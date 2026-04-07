import { convertFileSrc, invoke } from "@tauri-apps/api/core";
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

const resolvedImageAssetCache = new Map<string, Promise<ResolvedImageAsset>>();
const imageAssetUrlCache = new Map<string, Promise<string>>();

export function resolveImageAsset(relativePath: string) {
  const cacheKey = relativePath.trim();
  if (!resolvedImageAssetCache.has(cacheKey)) {
    resolvedImageAssetCache.set(
      cacheKey,
      invoke<ResolvedImageAsset>("resolve_image_asset", { relativePath: cacheKey }),
    );
  }

  return resolvedImageAssetCache.get(cacheKey)!;
}

export function resolveImageAssetUrl(relativePath: string) {
  const cacheKey = relativePath.trim();
  if (!imageAssetUrlCache.has(cacheKey)) {
    imageAssetUrlCache.set(
      cacheKey,
      resolveImageAsset(cacheKey).then(
        ({ absolutePath, revision }) =>
          `${convertFileSrc(absolutePath)}?v=${encodeURIComponent(revision)}`,
      ),
    );
  }

  return imageAssetUrlCache.get(cacheKey)!;
}

export function debugDataPaths() {
  return invoke<DataPathDebugPayload>("debug_data_paths");
}
