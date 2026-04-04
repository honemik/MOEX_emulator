import { invoke } from "@tauri-apps/api/core";
import type {
  BootstrapPayload,
  DataPathDebugPayload,
  ExamCatalogItem,
  ExamPayload,
  ResolvedImageAsset,
} from "./types";

export function normalizeInvokeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.cause;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return "未知錯誤";
}

export function formatDataPathDebug(debug: DataPathDebugPayload) {
  const lines = [
    `resource_dir: ${debug.resourceDir ?? "<unavailable>"}`,
    `executable_dir: ${debug.executableDir ?? "<unavailable>"}`,
    "checked_candidates:",
    ...debug.checkedCandidates.map((item) => `- ${item}`),
  ];
  return lines.join("\n");
}

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

export function resolveImageAsset(relativePath: string) {
  return invoke<ResolvedImageAsset>("resolve_image_asset", { relativePath });
}

export function debugDataPaths() {
  return invoke<DataPathDebugPayload>("debug_data_paths");
}
