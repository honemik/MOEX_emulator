import { invoke } from "@tauri-apps/api/core";
import type {
  BootstrapPayload,
  ExamCatalogItem,
  ExamPayload,
} from "./types";

export function bootstrapCatalog() {
  return invoke<BootstrapPayload>("bootstrap_catalog");
}

export function listExams(query?: string) {
  return invoke<ExamCatalogItem[]>("list_exams", {
    query: query && query.trim().length > 0 ? query.trim() : null,
  });
}

export function loadExam(examId: string) {
  return invoke<ExamPayload>("load_exam", { examId });
}

export function resolveImagePath(relativePath: string) {
  return invoke<string>("resolve_image_path", { relativePath });
}
