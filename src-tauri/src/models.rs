use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializationPayload {
  pub exam_count: usize,
  pub question_count: usize,
  pub prepared_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
  pub initialization: InitializationPayload,
  pub exams: Vec<ExamCatalogItem>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPathDebugPayload {
  pub resource_dir: Option<String>,
  pub executable_dir: Option<String>,
  pub checked_candidates: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamCatalogItem {
  pub exam_id: String,
  pub exam_year: Option<i64>,
  pub roc_year: Option<i64>,
  pub exam_nth_time: Option<i64>,
  pub question_count: i64,
  pub image_count: i64,
  pub inferred_subject: String,
  pub inferred_stage: String,
  pub display_title: String,
  pub subtitle: String,
  pub tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ChoiceOption {
  pub label: String,
  pub text: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionRecord {
  pub id: String,
  pub exam_id: String,
  pub question_number: i64,
  pub question_text: String,
  pub options: Vec<ChoiceOption>,
  pub correct_answer_indices: Vec<usize>,
  pub correct_labels: Vec<String>,
  pub question_images: Vec<String>,
  pub tags: Vec<String>,
  pub is_multiple_choice: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamPayload {
  pub exam: ExamCatalogItem,
  pub questions: Vec<QuestionRecord>,
}
