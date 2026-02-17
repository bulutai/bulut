import { parseAgentResponse } from "../../agent/tools";
import type { Message, StorageLike } from "./types";
import { STORAGE_KEY, TIMESTAMP_KEY, SESSION_ID_KEY, HOLD_THRESHOLD_MS } from "./types";
import type { AgentToolCallInfo } from "../../api/client";

// ── Status labels & helpers ─────────────────────────────────────────

export const STATUS_LABELS = {
  ready: "Hazır",
  loading: "Bir saniye",
  micInitializing: "Mikrofonu hazırlıyorum",
  listening: "Sizi dinliyorum",
  accessibilityActive: "Erişilebilirlik Aktif",
  transcribing: "Düşünüyorum",
  thinking: "Düşünüyorum",
  playingAudio: ".",
  runningTools: "Siteyle ilgileniyorum",
} as const;

export interface StatusFlags {
  isBusy: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  isThinking: boolean;
  isRenderingAudio: boolean;
  isPlayingAudio: boolean;
  isRunningTools: boolean;
}

export const resolveStatusText = (flags: StatusFlags): string => {
  if (flags.isRecording) return STATUS_LABELS.listening;
  if (flags.isRunningTools) return STATUS_LABELS.runningTools;
  if (flags.isPlayingAudio) return STATUS_LABELS.playingAudio;
  if (flags.isThinking) return STATUS_LABELS.thinking;
  if (flags.isTranscribing) return STATUS_LABELS.transcribing;
  if (flags.isBusy) return STATUS_LABELS.loading;
  return STATUS_LABELS.ready;
};

export const hasActiveStatus = (
  flags: StatusFlags,
  statusOverride: string | null,
): boolean =>
  Boolean(
    statusOverride
    || flags.isBusy
    || flags.isRecording
    || flags.isTranscribing
    || flags.isThinking
    || flags.isRenderingAudio
    || flags.isPlayingAudio
    || flags.isRunningTools,
  );

// ── Greeting / messages ─────────────────────────────────────────────

export const getGreetingText = (agentName: string): string =>
  `Merhaba, ben ${agentName}. Bu web sayfasında neler yapalım?`;

export const createInitialMessages = (agentName: string): Message[] => [
  { id: 1, text: getGreetingText(agentName), isUser: false },
];

export const clearPersistedChatState = (storage: StorageLike | null): void => {
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(TIMESTAMP_KEY);
  storage.removeItem(SESSION_ID_KEY);
};

export const getNextMessageId = (messages: Message[]): number => {
  const maxId = messages.reduce((acc, message) => Math.max(acc, message.id), 0);
  return maxId + 1;
};

// ── Formatting / classification ─────────────────────────────────────

export const formatDurationMs = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export const classifyMicGesture = (
  durationMs: number,
  thresholdMs: number = HOLD_THRESHOLD_MS,
): "tap" | "hold" => (durationMs >= thresholdMs ? "hold" : "tap");

export const scrollElementToBottom = (
  element: { scrollTop: number; scrollHeight: number } | null,
): void => {
  if (!element) return;
  element.scrollTop = element.scrollHeight;
};

export const normalizeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Bilinmeyen hata";
};

// ── Assistant payload resolution ────────────────────────────────────

export interface AssistantPayloadResolution {
  displayText: string;
  toolCalls: ReturnType<typeof parseAgentResponse>["toolCalls"];
}

export const resolveAssistantPayload = (
  assistantText: string,
): AssistantPayloadResolution => {
  const parsed = parseAgentResponse(assistantText);
  return { displayText: parsed.reply || assistantText, toolCalls: parsed.toolCalls };
};

// ── Auto-listen / VAD helpers ───────────────────────────────────────

export const shouldAutoListenAfterAudio = (
  accessibilityMode: boolean,
  expectsReply: boolean,
  isRecording: boolean,
  isBusy: boolean,
): boolean => (accessibilityMode || expectsReply) && !isRecording && !isBusy;

export const shouldAcceptVadSpeech = (
  speechDurationMs: number,
  enforceMinSpeechDuration: boolean,
  minSpeechDurationMs: number = 1500,
): boolean => !enforceMinSpeechDuration || speechDurationMs >= minSpeechDurationMs;

// ── Tool indicator messages ─────────────────────────────────────────

interface ToolIndicatorMessage {
  text: string;
  kind: "context" | "cursor" | "scroll" | "navigate" | "form" | "interact" | "unknown";
}

export const getToolIndicatorMessage = (call: AgentToolCallInfo): ToolIndicatorMessage => {
  if (call.tool === "getPageContext") return { text: "Algılama", kind: "context" };
  if (call.tool === "scroll") return { text: "Kaydırma", kind: "scroll" };
  if (call.tool === "navigate") {
    const url = typeof call.args.url === "string" ? call.args.url.trim() : "";
    return { text: url ? `Sayfa Geçişi: ${url}` : "Sayfa Geçişi", kind: "navigate" };
  }
  if (call.tool === "interact" && call.args.action === "move") return { text: "Serbest İmleç", kind: "cursor" };
  if (call.tool === "interact" && call.args.action === "type") return { text: "Form Doldurma", kind: "form" };
  if (call.tool === "interact" && call.args.action === "submit") return { text: "Form Gönderme", kind: "form" };
  if (call.tool === "interact" && call.args.action === "click") return { text: "Tıklama", kind: "interact" };
  if (call.tool === "interact") return { text: "Etkileşim", kind: "interact" };
  return { text: call.tool || "Araç", kind: "unknown" };
};
