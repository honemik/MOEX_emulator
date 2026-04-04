mod data;
mod models;

use data::{
  bootstrap_catalog as load_bootstrap, list_exams as query_exams, load_exam as fetch_exam,
  resolve_image_path as fetch_image_path, debug_data_paths as load_debug_data_paths,
};
use models::{BootstrapPayload, DataPathDebugPayload, ExamCatalogItem, ExamPayload};
use tauri::AppHandle;

#[tauri::command]
fn bootstrap_catalog(app: AppHandle) -> Result<BootstrapPayload, String> {
  load_bootstrap(&app)
}

#[tauri::command]
fn list_exams(app: AppHandle, query: Option<String>) -> Result<Vec<ExamCatalogItem>, String> {
  query_exams(&app, query.as_deref())
}

#[tauri::command]
fn load_exam(app: AppHandle, exam_id: String) -> Result<ExamPayload, String> {
  fetch_exam(&app, &exam_id)
}

#[tauri::command]
fn resolve_image_path(app: AppHandle, relative_path: String) -> Result<String, String> {
  fetch_image_path(&app, &relative_path)
}

#[tauri::command]
fn debug_data_paths(app: AppHandle) -> DataPathDebugPayload {
  load_debug_data_paths(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      bootstrap_catalog,
      list_exams,
      load_exam,
      resolve_image_path,
      debug_data_paths
    ])
    .run(tauri::generate_context!())
    .expect("error while running MOEX Emulator");
}
