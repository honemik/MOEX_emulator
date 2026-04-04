import type { ExamSession } from "./types";

const SESSION_PREFIX = "moex-emulator/session";

export function buildSessionKey(examId: string, candidateId: string) {
  return `${SESSION_PREFIX}/${examId}/${candidateId}`;
}

export function buildLegacySessionKeys(examId: string, candidateId: string) {
  return [
    `${SESSION_PREFIX}/${examId}/${candidateId}/simulator`,
    `${SESSION_PREFIX}/${examId}/${candidateId}/study`,
  ];
}

export function loadStoredSession(keyOrKeys: string | string[]) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];

  for (const key of keys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      continue;
    }

    try {
      return JSON.parse(raw) as ExamSession;
    } catch {
      continue;
    }
  }

  return null;
}

export function saveStoredSession(key: string, session: ExamSession) {
  window.localStorage.setItem(key, JSON.stringify(session));
}

export function clearStoredSession(key: string) {
  window.localStorage.removeItem(key);
}
