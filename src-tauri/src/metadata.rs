use crate::models::PageMeta;
use encoding_rs::Encoding;
use scraper::{Html, Selector};
use std::time::Duration;
use url::Url;

const MAX_BYTES: usize = 2 * 1024 * 1024;
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/// 抓取网页元数据。
///
/// 设计原则：**永不因为抓取失败而阻断卡片创建**。
/// 除「网址本身无法解析」外，任何错误都返回降级结果（标题 = 域名）。
pub async fn fetch_metadata(input: &str) -> Result<PageMeta, String> {
    let normalized = normalize_url(input);
    let parsed = Url::parse(&normalized).map_err(|_| "网址格式无法识别".to_string())?;
    if parsed.host_str().is_none() {
        return Err("网址格式无法识别".to_string());
    }

    let host = display_host(&parsed);
    let mut meta = PageMeta {
        url: normalized.clone(),
        title: Some(host.clone()),
        favicon_url: Some(format!("{}/favicon.ico", origin_of(&parsed))),
        ..Default::default()
    };

    let client = match reqwest::Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(12))
        .connect_timeout(Duration::from_secs(6))
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(meta),
    };

    let resp = match client.get(&normalized).send().await {
        Ok(r) => r,
        Err(_) => return Ok(meta),
    };

    let final_url = Url::parse(resp.url().as_str()).unwrap_or(parsed);
    meta.url = final_url.to_string();

    if !resp.status().is_success() {
        return Ok(meta);
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let bytes = match read_capped(resp).await {
        Some(b) => b,
        None => return Ok(meta),
    };
    let html = decode_body(&bytes, content_type.as_deref());

    parse_html(&mut meta, &html, &final_url);
    Ok(meta)
}

/// 流式读取响应体，最多 MAX_BYTES，避免加载巨型页面。
async fn read_capped(mut resp: reqwest::Response) -> Option<Vec<u8>> {
    let mut buf: Vec<u8> = Vec::with_capacity(64 * 1024);
    while let Ok(Some(chunk)) = resp.chunk().await {
        buf.extend_from_slice(&chunk);
        if buf.len() >= MAX_BYTES {
            break;
        }
    }
    if buf.is_empty() {
        None
    } else {
        Some(buf)
    }
}

/// 处理中文站点常见的 GBK / GB18030 / Big5 编码。
fn decode_body(bytes: &[u8], content_type: Option<&str>) -> String {
    let mut label: Option<String> = content_type.and_then(charset_from_content_type);
    if label.is_none() {
        let head_len = bytes.len().min(4096);
        let head = String::from_utf8_lossy(&bytes[..head_len]);
        label = sniff_meta_charset(&head);
    }
    let encoding = label
        .as_deref()
        .and_then(|l| Encoding::for_label(l.as_bytes()))
        .unwrap_or(encoding_rs::UTF_8);
    let (cow, _, _) = encoding.decode(bytes);
    cow.into_owned()
}

fn charset_from_content_type(ct: &str) -> Option<String> {
    let lower = ct.to_ascii_lowercase();
    let idx = lower.find("charset=")?;
    let rest = &ct[idx + 8..];
    let value = rest
        .split(|c| c == ';' || c == ' ')
        .next()
        .unwrap_or("")
        .trim()
        .trim_matches('"')
        .trim_matches('\'');
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn sniff_meta_charset(head: &str) -> Option<String> {
    let lower = head.to_ascii_lowercase();
    let idx = lower.find("charset")?;
    let rest = &head[idx..];
    let eq = rest.find('=')?;
    let value: String = rest[eq + 1..]
        .trim_start()
        .trim_start_matches('"')
        .trim_start_matches('\'')
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn parse_html(meta: &mut PageMeta, html: &str, base: &Url) {
    let doc = Html::parse_document(html);

    let meta_content = |keys: &[&str]| -> Option<String> {
        for key in keys {
            let sel_str = format!(
                "meta[property=\"{k}\"], meta[name=\"{k}\"], meta[itemprop=\"{k}\"]",
                k = key
            );
            // 注意：Selector::parse 的错误类型借用了 sel_str，
            // 必须让临时 Result 在 match 语句结束时立即释放，否则会与 sel_str 的
            // 生命周期冲突（E0597）。
            let sel = match Selector::parse(&sel_str) {
                Ok(s) => s,
                Err(_) => continue,
            };
            if let Some(el) = doc.select(&sel).next() {
                if let Some(content) = el.value().attr("content") {
                    let cleaned = collapse(content);
                    if !cleaned.is_empty() {
                        return Some(cleaned);
                    }
                }
            }
        }
        None
    };

    let title = meta_content(&["og:title", "twitter:title"])
        .or_else(|| {
            Selector::parse("title")
                .ok()
                .and_then(|sel| doc.select(&sel).next())
                .map(|el| collapse(&el.text().collect::<String>()))
                .filter(|s| !s.is_empty())
        })
        .or_else(|| meta_content(&["og:site_name"]));

    if let Some(t) = title {
        meta.title = Some(truncate(&t, 160));
    }

    meta.site_name = meta_content(&["og:site_name"]).map(|s| truncate(&s, 80));

    meta.description = meta_content(&[
        "og:description",
        "description",
        "twitter:description",
    ])
    .map(|s| truncate(&s, 300));

    meta.image_url = meta_content(&["og:image", "twitter:image"])
        .and_then(|raw| resolve(base, &raw));

    let favicon = find_favicon(&doc, base);
    if favicon.is_some() {
        meta.favicon_url = favicon;
    }
}

fn find_favicon(doc: &Html, base: &Url) -> Option<String> {
    // 优先 rel 含 icon 的声明，其次 apple-touch-icon
    let selectors = [
        "link[rel=\"icon\"]",
        "link[rel=\"shortcut icon\"]",
        "link[rel=\"apple-touch-icon\"]",
        "link[rel=\"apple-touch-icon-precomposed\"]",
    ];
    for sel_str in selectors {
        if let Ok(sel) = Selector::parse(sel_str) {
            for el in doc.select(&sel) {
                if let Some(href) = el.value().attr("href") {
                    if let Some(abs) = resolve(base, href) {
                        return Some(abs);
                    }
                }
            }
        }
    }
    // 兜底：站点根目录 favicon.ico
    Some(format!("{}/favicon.ico", origin_of(base)))
}

fn resolve(base: &Url, raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    if raw.starts_with("data:") {
        return None;
    }
    base.join(raw).ok().map(|u| u.to_string())
}

fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate(s: &str, max_chars: usize) -> String {
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i >= max_chars {
            out.push('…');
            break;
        }
        out.push(ch);
    }
    out
}

fn normalize_url(input: &str) -> String {
    let t = input.trim();
    if t.starts_with("http://") || t.starts_with("https://") {
        t.to_string()
    } else {
        format!("https://{t}")
    }
}

fn display_host(url: &Url) -> String {
    url.host_str()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_string()
}

fn origin_of(url: &Url) -> String {
    match (url.scheme(), url.host_str(), url.port()) {
        (scheme, Some(host), Some(port)) => format!("{scheme}://{host}:{port}"),
        (scheme, Some(host), None) => format!("{scheme}://{host}"),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 解析优先级：og:title / og:description / og:image，以及相对路径与协议相对路径的解析
    #[test]
    fn parses_open_graph_tags_and_resolves_urls() {
        let html = r#"<html><head>
            <title>兜底标题</title>
            <meta property="og:title" content="OG 标题">
            <meta name="description" content="普通描述">
            <meta property="og:description" content="OG 描述">
            <meta property="og:image" content="/img/cover.png">
            <link rel="icon" href="//cdn.example.com/fav.ico">
        </head><body></body></html>"#;

        let base = Url::parse("https://example.com/page").unwrap();
        let mut meta = PageMeta::default();
        parse_html(&mut meta, html, &base);

        assert_eq!(meta.title.as_deref(), Some("OG 标题"));
        assert_eq!(meta.description.as_deref(), Some("OG 描述"));
        assert_eq!(
            meta.image_url.as_deref(),
            Some("https://example.com/img/cover.png")
        );
        assert_eq!(
            meta.favicon_url.as_deref(),
            Some("https://cdn.example.com/fav.ico")
        );
    }

    /// 没有 og 标签时应回退到 <title> 与 meta[name=description]
    #[test]
    fn falls_back_to_plain_tags() {
        let html = r#"<html><head>
            <title>  只有普通标题
            </title>
            <meta name="description" content="这是一段   有多余空白的描述。">
        </head></html>"#;

        let base = Url::parse("https://example.com/").unwrap();
        let mut meta = PageMeta::default();
        parse_html(&mut meta, html, &base);

        assert_eq!(meta.title.as_deref(), Some("只有普通标题"));
        assert_eq!(meta.description.as_deref(), Some("这是一段 有多余空白的描述。"));
    }

    /// 中文站点常见的 GBK 编码必须被正确识别，否则标题会变成乱码
    #[test]
    fn decodes_gbk_body_by_meta_charset() {
        let mut bytes = br#"<html><head><meta charset="gbk"></head><body>"#.to_vec();
        bytes.extend_from_slice(&[0xd6, 0xd0, 0xce, 0xc4]); // "中文" 的 GBK 编码
        let decoded = decode_body(&bytes, None);
        assert!(decoded.contains("中文"), "解码结果不正确: {decoded}");
    }

    /// Content-Type 头中的 charset 优先级高于页面内声明
    #[test]
    fn content_type_charset_is_read() {
        assert_eq!(
            charset_from_content_type("text/html; charset=UTF-8").as_deref(),
            Some("UTF-8")
        );
        assert_eq!(
            charset_from_content_type("text/html; charset=\"gb2312\"").as_deref(),
            Some("gb2312")
        );
        assert_eq!(charset_from_content_type("text/html"), None);
    }

    /// 无协议输入应补全为 https
    #[test]
    fn normalizes_scheme() {
        assert_eq!(normalize_url("example.com"), "https://example.com");
        assert_eq!(normalize_url("  http://a.cn  "), "http://a.cn");
    }

    /// 需要联网：cargo test -- --ignored
    #[test]
    #[ignore]
    fn fetches_real_page_metadata() {
        let meta =
            tauri::async_runtime::block_on(fetch_metadata("github.com")).expect("抓取失败");
        println!("title       = {:?}", meta.title);
        println!("description = {:?}", meta.description);
        println!("site_name   = {:?}", meta.site_name);
        println!("favicon     = {:?}", meta.favicon_url);
        println!("final url   = {:?}", meta.url);
        assert!(meta.title.is_some());
        assert!(meta.url.starts_with("http"));
    }
}
