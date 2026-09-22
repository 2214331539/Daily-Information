use serde::{Deserialize, Serialize};

/// 一个分组，附带「直接子节点」的计数（不含后代，后代聚合在前端完成）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStat {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub sort_order: i64,
    pub expanded: bool,
    /// 该分组下直接挂载的卡片总数
    pub total: i64,
    /// 该分组下直接挂载且「今日未点卯」的卡片数
    pub pending: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: i64,
    #[serde(default)]
    pub folder_id: Option<i64>,
    pub url: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub site_name: Option<String>,
    #[serde(default)]
    pub image_url: Option<String>,
    #[serde(default)]
    pub favicon_url: Option<String>,
    /// UTC 时间戳；None 表示从未点卯
    #[serde(default)]
    pub last_clicked_at: Option<String>,
    /// 今日是否未点卯（由 SQL 依据本地时区计算，前端不重复实现）
    #[serde(default)]
    pub pending: bool,
    #[serde(default)]
    pub sort_order: i64,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub total: i64,
    pub pending: i64,
}

/// 网页元数据抓取结果。任何字段都可能为空，由降级策略兜底。
#[derive(Debug, Clone, Default)]
pub struct PageMeta {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub site_name: Option<String>,
    pub image_url: Option<String>,
    pub favicon_url: Option<String>,
}
