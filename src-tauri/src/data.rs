use std::{
  fs,
  path::PathBuf,
};

use rusqlite::{Connection, OpenFlags};
use tauri::{AppHandle, Manager};

use crate::models::{
  BootstrapPayload, ChoiceOption, ExamCatalogItem, ExamPayload, InitializationPayload,
  QuestionRecord,
};

#[derive(Clone, Debug)]
struct DataPaths {
  database_path: PathBuf,
  image_root: PathBuf,
}

pub fn bootstrap_catalog(app: &AppHandle) -> Result<BootstrapPayload, String> {
  let data_paths = resolve_data_paths(app)?;
  let connection = open_database(&data_paths.database_path)?;
  let initialization = build_initialization(&connection);
  let exams = list_exams_with_connection(&connection, None)?;
  Ok(BootstrapPayload {
    initialization,
    exams,
  })
}

pub fn list_exams(app: &AppHandle, query: Option<&str>) -> Result<Vec<ExamCatalogItem>, String> {
  let data_paths = resolve_data_paths(app)?;
  let connection = open_database(&data_paths.database_path)?;
  list_exams_with_connection(&connection, query)
}

fn build_initialization(connection: &Connection) -> InitializationPayload {
  let exam_count = read_metadata_usize(connection, "exam_count").unwrap_or_else(|| {
    connection
      .query_row("SELECT COUNT(*) FROM exams", [], |row| row.get::<_, i64>(0))
      .unwrap_or(0) as usize
  });
  let question_count = read_metadata_usize(connection, "question_count").unwrap_or_else(|| {
    connection
      .query_row("SELECT COUNT(*) FROM questions", [], |row| row.get::<_, i64>(0))
      .unwrap_or(0) as usize
  });
  let prepared_at = read_metadata_string(connection, "generated_at").unwrap_or_else(|| "0".to_string());

  InitializationPayload {
    exam_count,
    question_count,
    prepared_at,
  }
}

fn list_exams_with_connection(
  connection: &Connection,
  query: Option<&str>,
) -> Result<Vec<ExamCatalogItem>, String> {
  let search_term = query.map(|item| format!("%{}%", item.to_lowercase()));
  let sql = if search_term.is_some() {
    "SELECT exam_id, exam_year, roc_year, exam_nth_time, question_count, image_count, inferred_subject, inferred_stage, display_title, subtitle, tags_json FROM exams WHERE lower(display_title) LIKE ?1 OR lower(subtitle) LIKE ?1 OR lower(tags_json) LIKE ?1 OR lower(search_text) LIKE ?1 ORDER BY exam_year DESC, exam_nth_time DESC, inferred_stage ASC, inferred_subject ASC"
  } else {
    "SELECT exam_id, exam_year, roc_year, exam_nth_time, question_count, image_count, inferred_subject, inferred_stage, display_title, subtitle, tags_json FROM exams ORDER BY exam_year DESC, exam_nth_time DESC, inferred_stage ASC, inferred_subject ASC"
  };

  let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
  let rows = if let Some(search_term) = search_term {
    statement
      .query_map([search_term], map_exam_row)
      .map_err(|error| error.to_string())?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| error.to_string())?
  } else {
    statement
      .query_map([], map_exam_row)
      .map_err(|error| error.to_string())?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| error.to_string())?
  };

  Ok(rows)
}

pub fn load_exam(app: &AppHandle, exam_id: &str) -> Result<ExamPayload, String> {
  let data_paths = resolve_data_paths(app)?;
  let connection = open_database(&data_paths.database_path)?;

  let exam = connection
    .query_row(
      "SELECT exam_id, exam_year, roc_year, exam_nth_time, question_count, image_count, inferred_subject, inferred_stage, display_title, subtitle, tags_json FROM exams WHERE exam_id = ?1",
      [exam_id],
      map_exam_row,
    )
    .map_err(|error| error.to_string())?;

  let mut statement = connection
    .prepare(
      "SELECT id, exam_id, question_number, question_text, options_json, correct_answers_json, question_images_json, tags_json, is_multiple_choice FROM questions WHERE exam_id = ?1 ORDER BY question_number ASC",
    )
    .map_err(|error| error.to_string())?;
  let questions = statement
    .query_map([exam_id], |row| {
      let options = parse_json_column::<Vec<ChoiceOption>>(&row.get::<_, String>(4)?)?;
      let correct_answer_indices = parse_json_column::<Vec<usize>>(&row.get::<_, String>(5)?)?;
      let question_images = parse_json_column::<Vec<String>>(&row.get::<_, String>(6)?)?;
      let tags = parse_json_column::<Vec<String>>(&row.get::<_, String>(7)?)?;
      let correct_labels = correct_answer_indices
        .iter()
        .filter_map(|index| options.get(*index).map(|option| option.label.clone()))
        .collect::<Vec<_>>();

      Ok(QuestionRecord {
        id: row.get(0)?,
        exam_id: row.get(1)?,
        question_number: row.get(2)?,
        question_text: row.get(3)?,
        options,
        correct_answer_indices,
        correct_labels,
        question_images,
        tags,
        is_multiple_choice: row.get::<_, i64>(8)? == 1,
      })
    })
    .map_err(|error| error.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| error.to_string())?;

  Ok(ExamPayload { exam, questions })
}

pub fn resolve_image_path(app: &AppHandle, relative_path: &str) -> Result<String, String> {
  let data_paths = resolve_data_paths(app)?;
  let normalized = normalize_relative_path(relative_path);
  let stripped = normalized.strip_prefix("images/").unwrap_or(normalized.as_str());
  let absolute_path = data_paths.image_root.join(stripped);
  let canonical_root = fs::canonicalize(&data_paths.image_root).map_err(|error| error.to_string())?;
  let canonical_target = fs::canonicalize(&absolute_path).map_err(|error| error.to_string())?;

  if !canonical_target.starts_with(&canonical_root) {
    return Err("圖片路徑不在允許範圍內".to_string());
  }

  Ok(canonical_target.display().to_string())
}

fn open_database(path: &PathBuf) -> Result<Connection, String> {
  let connection = Connection::open_with_flags(
    path,
    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
  )
  .map_err(|error| error.to_string())?;
  connection
    .pragma_update(None, "query_only", "ON")
    .map_err(|error| error.to_string())?;
  Ok(connection)
}

fn resolve_data_paths(app: &AppHandle) -> Result<DataPaths, String> {
  let mut candidates = Vec::new();

  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push((
      resource_dir.join("database").join("moex_clean.sqlite"),
      resource_dir.join("database").join("images"),
    ));
    candidates.push((
      resource_dir.join("moex_clean.sqlite"),
      resource_dir.join("images"),
    ));
  }

  if let Some(workspace_root) = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent() {
    candidates.push((
      workspace_root.join("database").join("moex_clean.sqlite"),
      workspace_root.join("database").join("images"),
    ));
  }

  let (database_path, image_root) = candidates
    .into_iter()
    .find(|(database_path, image_root)| database_path.exists() && image_root.exists())
    .ok_or_else(|| {
      "找不到 database/moex_clean.sqlite。請先執行 python scripts/build_clean_db.py".to_string()
    })?;

  Ok(DataPaths {
    database_path,
    image_root,
  })
}

fn map_exam_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ExamCatalogItem> {
  let tags_json: String = row.get(10)?;
  Ok(ExamCatalogItem {
    exam_id: row.get(0)?,
    exam_year: row.get(1)?,
    roc_year: row.get(2)?,
    exam_nth_time: row.get(3)?,
    question_count: row.get(4)?,
    image_count: row.get(5)?,
    inferred_subject: row.get(6)?,
    inferred_stage: row.get(7)?,
    display_title: row.get(8)?,
    subtitle: row.get(9)?,
    tags: parse_json_column(&tags_json)?,
  })
}

fn parse_json_column<T: serde::de::DeserializeOwned>(json: &str) -> rusqlite::Result<T> {
  serde_json::from_str(json).map_err(|error| {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
  })
}

fn read_metadata_string(connection: &Connection, key: &str) -> Option<String> {
  connection
    .query_row(
      "SELECT value FROM metadata WHERE key = ?1",
      [key],
      |row| row.get::<_, String>(0),
    )
    .ok()
}

fn read_metadata_usize(connection: &Connection, key: &str) -> Option<usize> {
  read_metadata_string(connection, key)?.parse().ok()
}

fn normalize_relative_path(path: &str) -> String {
  path
    .replace('\\', "/")
    .trim_start_matches("./")
    .trim_start_matches('/')
    .to_string()
}
