export type { Message, RecordingMode, StorageLike } from "./types";
export { HOLD_THRESHOLD_MS, STORAGE_KEY, TIMESTAMP_KEY, SESSION_ID_KEY, TTL_MS } from "./types";
export {
  STATUS_LABELS,
  resolveStatusText,
  hasActiveStatus,
  getGreetingText,
  createInitialMessages,
  clearPersistedChatState,
  getNextMessageId,
  formatDurationMs,
  classifyMicGesture,
  scrollElementToBottom,
  normalizeError,
  resolveAssistantPayload,
  shouldAutoListenAfterAudio,
  shouldAcceptVadSpeech,
  getToolIndicatorMessage,
} from "./helpers";
export type { StatusFlags, AssistantPayloadResolution } from "./helpers";
export { ChatWindow } from "./ChatWindow";
export type { ChatWindowHandle, ChatWindowProps } from "./ChatWindow";
