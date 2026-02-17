// ── Chat Window types & constants ───────────────────────────────────

export interface Message {
  id: number;
  text: string;
  isUser: boolean;
  type?: "message" | "tool";
  toolKind?: "context" | "cursor" | "scroll" | "navigate" | "form" | "interact" | "unknown";
  toolLabel?: string;
  toolCount?: number;
}

export type RecordingMode = "vad" | "press";

export type StorageLike = {
  removeItem: (key: string) => void;
};

export const STORAGE_KEY = "bulut_chat_history";
export const TIMESTAMP_KEY = "bulut_chat_timestamp";
export const SESSION_ID_KEY = "bulut_session_id";
export const TTL_MS = 5 * 60 * 1000;
export const VAD_THRESHOLD = 0.06;
export const SILENCE_DURATION_MS = 500;
export const ACCESSIBILITY_MIN_SPEECH_DURATION_MS = 1500;
export const HOLD_THRESHOLD_MS = 250;
