import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { BulutRuntimeConfig } from "../../index";
import {
  agentTextChatStream,
  agentVoiceChatStream,
  agentResumeStream,
  startSttWebSocketStream,
  stopActiveAudioPlayback,
  speakText,
  type AudioStreamState,
  type StreamController,
  type AgentToolCallInfo,
  type SttWsController,
} from "../../api/client";
import {
  executeSingleToolCall,
  getPendingAgentResume,
  clearPendingAgentResume,
  type ToolCallWithId,
} from "../../agent/tools";
import { getPageContext } from "../../agent/context";
import { COLORS } from "../../styles/constants";
import {
  logoContent,
  arrowPathIconContent,
  commandLineIconContent,
  cursorArrowRaysIconContent,
  faceSmileIconContent,
  handRaisedIconContent,
  mapIconContent,
  microphoneOutlineIconContent,
  queueListIconContent,
  stopOutlineIconContent,
  xMarkIconContent,
} from "../../assets";
import { playCue, type SfxName } from "../../audio/sfxManager";
import { SvgIcon } from "../SvgIcon";

import type { Message, RecordingMode } from "./types";
import {
  STORAGE_KEY,
  TIMESTAMP_KEY,
  SESSION_ID_KEY,
  TTL_MS,
  VAD_THRESHOLD,
  SILENCE_DURATION_MS,
} from "./types";
import {
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
  shouldAutoListenAfterAudio,
  shouldAcceptVadSpeech,
  getToolIndicatorMessage,
} from "./helpers";
import {
  windowStyle,
  headerStyle,
  headerActionsStyle,
  headerButtonStyle,
  messagesContainerStyle,
  messagesListStyle,
  messageStyle,
  footerStyle,
  statusPanelStyle,
  footerActionsStyle,
  recordingTimerStyle,
  micFooterButtonStyle,
  getChatWindowCss,
} from "./styles";

// ── Public types ────────────────────────────────────────────────────

export interface ChatWindowHandle {
  startRecording: () => void;
  cancelRecording: () => void;
  stopTask: () => void;
}

export interface ChatWindowProps {
  onClose: () => void;
  config: BulutRuntimeConfig;
  accessibilityMode?: boolean;
  onAccessibilityToggle?: () => void;
  hidden?: boolean;
  actionsRef?: { current: ChatWindowHandle | null };
  onRecordingChange?: (recording: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onPreviewChange?: (text: string | null) => void;
  onTextSubmit?: (text: string) => void;
}

// ── Helpers (tool icon resolution) ──────────────────────────────────

const resolveToolIconSrc = (kind: Message["toolKind"]): string => {
  if (kind === "cursor") return cursorArrowRaysIconContent;
  if (kind === "scroll") return handRaisedIconContent;
  if (kind === "navigate") return mapIconContent;
  if (kind === "form") return queueListIconContent;
  if (kind === "interact") return handRaisedIconContent;
  if (kind === "unknown") return commandLineIconContent;
  return faceSmileIconContent;
};

// ── Component ───────────────────────────────────────────────────────

export const ChatWindow = ({
  onClose,
  config,
  accessibilityMode = false,
  hidden = false,
  actionsRef,
  onRecordingChange,
  onBusyChange,
  onPreviewChange,
  onTextSubmit,
}: ChatWindowProps) => {
  // ── State ─────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      const timestamp = localStorage.getItem(TIMESTAMP_KEY);
      if (saved && timestamp) {
        const timePassed = Date.now() - parseInt(timestamp, 10);
        if (timePassed < TTL_MS) {
          try { return JSON.parse(saved) as Message[]; }
          catch { /* fall through */ }
        } else {
          clearPersistedChatState(localStorage);
        }
      }
    }
    return createInitialMessages(config.agentName);
  });

  const [isBusy, setIsBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isRenderingAudio, setIsRenderingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRunningTools, setIsRunningTools] = useState(false);
  const [isMicPending, setIsMicPending] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);

  const statusFlags = {
    isBusy, isRecording, isTranscribing, isThinking,
    isRenderingAudio, isPlayingAudio, isRunningTools,
  };
  const resolvedStatusText = resolveStatusText(statusFlags);
  const showStatus = hasActiveStatus(statusFlags, statusOverride);
  const statusText = showStatus ? (statusOverride ?? resolvedStatusText) : STATUS_LABELS.ready;

  // ── Refs ──────────────────────────────────────────────────────
  const isBusyRef = useRef(isBusy);
  const isRecordingRef = useRef(isRecording);
  const nextMessageIdRef = useRef(getNextMessageId(messages));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const activeStreamControllerRef = useRef<StreamController | null>(null);
  const sessionIdRef = useRef<string | null>(
    typeof localStorage !== "undefined"
      ? (() => {
          const ts = localStorage.getItem(TIMESTAMP_KEY);
          if (ts && Date.now() - parseInt(ts, 10) < TTL_MS) return localStorage.getItem(SESSION_ID_KEY);
          return null;
        })()
      : null,
  );

  const silenceStartRef = useRef<number | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const discardNextRecordingRef = useRef(false);
  const micPressStartRef = useRef<number | null>(null);
  const micHoldTimeoutRef = useRef<number | null>(null);
  const micHoldTriggeredRef = useRef(false);
  const recordingModeRef = useRef<RecordingMode | null>(null);
  const pendingStopAfterStartRef = useRef(false);
  const startRecordingPendingRef = useRef(false);
  const assistantMessageIdRef = useRef<number | null>(null);
  const assistantTextBufferRef = useRef("");
  const transcriptionReceivedRef = useRef(false);
  const assistantDoneReceivedRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerIntervalRef = useRef<number | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const pendingUserTextRef = useRef<string | null>(null);
  const pendingAssistantTextRef = useRef<string>("");

  const awaitingAssistantResponseRef = useRef(false);
  const activeSttWsRef = useRef<SttWsController | null>(null);
  const liveTranscriptionMessageIdRef = useRef<number | null>(null);
  const liveTranscriptionTextRef = useRef("");
  const autoListenSuppressedRef = useRef(false);
  const expectsReplyRef = useRef(true);
  const requestEpochRef = useRef(0);
  const sttSendCuePlayedRef = useRef(false);

  // ── Keep refs in sync ─────────────────────────────────────────
  useEffect(() => { isBusyRef.current = isBusy; }, [isBusy]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { onRecordingChange?.(isRecording); }, [isRecording]);
  useEffect(() => { onBusyChange?.(isBusy); }, [isBusy]);

  // Derive and report preview text to parent
  useEffect(() => {
    if (!onPreviewChange) return;
    if (isRecording) { onPreviewChange(statusOverride ?? STATUS_LABELS.listening); return; }
    if (isRenderingAudio || isPlayingAudio) {
      const lastAssistant = [...messages].reverse().find(m => !m.isUser && m.type !== "tool");
      onPreviewChange(lastAssistant?.text ?? getGreetingText(config.agentName));
      return;
    }
    if (showStatus) {
      onPreviewChange(statusOverride ?? resolveStatusText(statusFlags));
      return;
    }
    const lastAssistant = [...messages].reverse().find(m => !m.isUser && m.type !== "tool");
    onPreviewChange(lastAssistant?.text ?? getGreetingText(config.agentName));
  }, [isRecording, isBusy, isTranscribing, isThinking, isRunningTools, isPlayingAudio, isRenderingAudio, statusOverride, showStatus, messages]);

  // ── Sound helpers ─────────────────────────────────────────────
  const playSfx = (name: SfxName) => { playCue(name); };
  const beginRequestEpoch = () => { requestEpochRef.current += 1; return requestEpochRef.current; };
  const invalidateRequestEpoch = () => { requestEpochRef.current += 1; };
  const isCurrentRequestEpoch = (epoch: number): boolean => requestEpochRef.current === epoch;
  const playSttSentCueOnce = () => { if (sttSendCuePlayedRef.current) return; sttSendCuePlayedRef.current = true; playSfx("sent"); };

  // ── Persist messages ──────────────────────────────────────────
  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
    }
  }, [messages]);

  const scrollMessagesToBottom = () => { scrollElementToBottom(messagesContainerRef.current); };
  useLayoutEffect(() => { scrollMessagesToBottom(); }, [messages, statusText, isBusy, isRecording]);

  useEffect(() => {
    const content = messagesContentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { scrollMessagesToBottom(); });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // ── Recording timer ───────────────────────────────────────────
  const stopRecordingTimer = () => {
    if (recordingTimerIntervalRef.current !== null) {
      window.clearInterval(recordingTimerIntervalRef.current);
      recordingTimerIntervalRef.current = null;
    }
    recordingStartedAtRef.current = null;
  };

  const startRecordingTimer = () => {
    stopRecordingTimer();
    recordingStartedAtRef.current = Date.now();
    setRecordingDurationMs(0);
    recordingTimerIntervalRef.current = window.setInterval(() => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt === null) { setRecordingDurationMs(0); return; }
      setRecordingDurationMs(Date.now() - startedAt);
    }, 200);
  };

  // ── Cleanup helpers ───────────────────────────────────────────
  const resetProcessingFlags = () => {
    setIsTranscribing(false); setIsThinking(false);
    setIsRenderingAudio(false); setIsPlayingAudio(false);
    setIsRunningTools(false); setStatusOverride(null);
    assistantMessageIdRef.current = null;
    assistantTextBufferRef.current = "";
    transcriptionReceivedRef.current = false;
    assistantDoneReceivedRef.current = false;
    awaitingAssistantResponseRef.current = false;
    pendingUserTextRef.current = null;
    pendingAssistantTextRef.current = "";
  };

  const clearMicHoldTimeout = () => {
    if (micHoldTimeoutRef.current !== null) {
      window.clearTimeout(micHoldTimeoutRef.current);
      micHoldTimeoutRef.current = null;
    }
  };

  const cleanupVAD = () => {
    if (vadIntervalRef.current !== null) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    silenceStartRef.current = null;
  };

  const stopStreamTracks = () => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stopActiveStream = () => {
    if (!activeStreamControllerRef.current) return;
    activeStreamControllerRef.current.stop();
    activeStreamControllerRef.current = null;
  };

  const cancelActiveSttWs = () => {
    const activeSttWs = activeSttWsRef.current;
    activeSttWsRef.current = null;
    activeSttWs?.cancel();
    liveTranscriptionMessageIdRef.current = null;
    liveTranscriptionTextRef.current = "";
  };

  // ── Unmount cleanup ───────────────────────────────────────────
  useEffect(() => () => {
    invalidateRequestEpoch();
    clearMicHoldTimeout();
    pendingStopAfterStartRef.current = false;
    stopActiveStream(); stopActiveAudioPlayback();
    cancelActiveSttWs(); cleanupVAD();
    stopStreamTracks(); stopRecordingTimer();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
      recorderRef.current = null;
    }
    cancelActiveSttWs();
  }, []);

  // ── Message helpers ───────────────────────────────────────────
  const appendMessage = (text: string, isUser: boolean, options?: {
    type?: "message" | "tool"; toolKind?: Message["toolKind"]; toolLabel?: string; toolCount?: number;
  }): number => {
    const id = nextMessageIdRef.current++;
    setMessages((prev) => [...prev, { id, text, isUser, type: options?.type, toolKind: options?.toolKind, toolLabel: options?.toolLabel, toolCount: options?.toolCount }]);
    return id;
  };

  const appendToolIndicatorMessages = (calls: AgentToolCallInfo[]) => {
    setMessages((previous) => {
      const next = [...previous];
      for (const call of calls) {
        const indicator = getToolIndicatorMessage(call);
        const last = next[next.length - 1];
        const previousToolText = typeof last?.text === "string" ? last.text.replace(/\s+\(\d+\)$/, "") : "";
        if (last && !last.isUser && last.type === "tool" && previousToolText === indicator.text) {
          const extractedCount = Number.parseInt((last.text.match(/\((\d+)\)\s*$/)?.[1] ?? "1"), 10);
          const safeCurrentCount = Number.isFinite(extractedCount) ? extractedCount : 1;
          const nextCount = safeCurrentCount + 1;
          const baseLabel = previousToolText || indicator.text;
          next[next.length - 1] = { ...last, toolLabel: baseLabel, toolCount: nextCount, text: `${baseLabel} (${nextCount})` };
          continue;
        }
        const id = nextMessageIdRef.current++;
        next.push({ id, text: indicator.text, isUser: false, type: "tool", toolKind: indicator.kind, toolLabel: indicator.text, toolCount: 1 });
      }
      if (typeof localStorage !== "undefined") {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); localStorage.setItem(TIMESTAMP_KEY, Date.now().toString()); } catch { }
      }
      return next;
    });
  };

  const updateMessageText = (id: number, text: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, text } : m));
  };

  const upsertLiveUserTranscription = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    liveTranscriptionTextRef.current = normalized;
    if (liveTranscriptionMessageIdRef.current === null) {
      liveTranscriptionMessageIdRef.current = appendMessage(normalized, true);
      return;
    }
    updateMessageText(liveTranscriptionMessageIdRef.current, normalized);
  };

  const clearLiveUserTranscriptionState = () => {
    liveTranscriptionMessageIdRef.current = null;
    liveTranscriptionTextRef.current = "";
  };

  // ── Audio state ───────────────────────────────────────────────
  const handleAudioStateChange = (state: AudioStreamState, requestEpoch?: number) => {
    if (typeof requestEpoch === "number" && !isCurrentRequestEpoch(requestEpoch)) return;
    if (state === "rendering") { setIsRenderingAudio(true); setIsPlayingAudio(false); return; }
    if (state === "playing") { setIsRenderingAudio(false); setIsPlayingAudio(true); return; }
    if (state === "fallback") { setIsRenderingAudio(true); setIsPlayingAudio(false); return; }
    if (state === "done") { setIsRenderingAudio(false); setIsPlayingAudio(false); return; }
    setIsRenderingAudio(false); setIsPlayingAudio(false);
  };

  const finalizeStreamCycle = (requestEpoch?: number) => {
    if (typeof requestEpoch === "number" && !isCurrentRequestEpoch(requestEpoch)) return;
    awaitingAssistantResponseRef.current = false;
    setStatusOverride(null); setIsBusy(false); isBusyRef.current = false;
    setIsTranscribing(false); setIsThinking(false);
    setIsRenderingAudio(false); setIsPlayingAudio(false); setIsRunningTools(false);
    pendingUserTextRef.current = null; pendingAssistantTextRef.current = "";
    assistantMessageIdRef.current = null;
    if (activeStreamControllerRef.current) activeStreamControllerRef.current = null;
    if (!autoListenSuppressedRef.current && shouldAutoListenAfterAudio(accessibilityMode, expectsReplyRef.current, isRecordingRef.current, false)) {
      console.info("[Bulut] chat-window auto-listen trigger after stream completion");
      void startRecording("vad");
    }
    expectsReplyRef.current = true;
  };

  // ── Shared stream callbacks builder ───────────────────────────
  const buildStreamCallbacks = (requestEpoch: number) => ({
    onSessionId: (sid: string) => {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      if (sid && sid !== sessionIdRef.current) {
        sessionIdRef.current = sid;
        if (typeof localStorage !== "undefined") localStorage.setItem(SESSION_ID_KEY, sid);
      }
    },
    onAssistantDelta: (delta: string) => {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      setIsTranscribing(false); setIsThinking(true); setIsRunningTools(false);
      if (awaitingAssistantResponseRef.current) { awaitingAssistantResponseRef.current = false; setStatusOverride(null); }
      pendingAssistantTextRef.current += delta;
      if (assistantMessageIdRef.current === null) {
        assistantMessageIdRef.current = appendMessage(pendingAssistantTextRef.current, false);
      } else {
        updateMessageText(assistantMessageIdRef.current, pendingAssistantTextRef.current);
      }
    },
    onAssistantDone: (assistantText: string, expectsReply: boolean | undefined) => {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      playSfx("completed");
      expectsReplyRef.current = expectsReply !== false;
      awaitingAssistantResponseRef.current = false;
      setStatusOverride(null); setIsThinking(false); setIsRenderingAudio(true);
      const finalDisplayText = assistantText || pendingAssistantTextRef.current;
      pendingAssistantTextRef.current = finalDisplayText;
      if (assistantMessageIdRef.current !== null) {
        updateMessageText(assistantMessageIdRef.current, finalDisplayText);
      } else {
        assistantMessageIdRef.current = appendMessage(finalDisplayText, false);
      }
    },
    onIntermediateReply: (text: string) => {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      void speakText(config.backendBaseUrl, text, config.voice, accessibilityMode, (state) => handleAudioStateChange(state, requestEpoch)).catch((err) => console.warn("[Bulut] intermediate TTS failed", err));
    },
    onToolCalls: (calls: AgentToolCallInfo[]) => {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      if (calls.length > 0) playSfx("toolCall");
      setIsRunningTools(true); setStatusOverride(STATUS_LABELS.runningTools);
      appendToolIndicatorMessages(calls);
      assistantMessageIdRef.current = null; pendingAssistantTextRef.current = "";
    },
    onToolResult: () => {},
    onIteration: () => {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      playSfx("thinking"); setIsThinking(true); setStatusOverride(STATUS_LABELS.thinking);
    },
    onAudioStateChange: (state: AudioStreamState) => { handleAudioStateChange(state, requestEpoch); },
    onError: (err: string) => {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      awaitingAssistantResponseRef.current = false; setStatusOverride(null);
      appendMessage(`Hata: ${err}`, false);
    },
  });

  const buildToolExecutor = () => async (call: AgentToolCallInfo): Promise<{ call_id: string; result: string }> => {
    const toolCall: ToolCallWithId = {
      tool: call.tool as "navigate" | "getPageContext" | "interact" | "scroll",
      call_id: call.call_id, ...call.args,
    } as ToolCallWithId;
    return executeSingleToolCall(toolCall);
  };

  // ── Resume agent loop after full-page navigation ──────────────
  useEffect(() => {
    const resumeState = getPendingAgentResume();
    if (!resumeState) return;
    clearPendingAgentResume();
    console.info("[Bulut] Resuming agent after navigation");
    if (resumeState.sessionId) {
      sessionIdRef.current = resumeState.sessionId;
      if (typeof localStorage !== "undefined") localStorage.setItem(SESSION_ID_KEY, resumeState.sessionId);
    }
    const requestEpoch = beginRequestEpoch();
    setIsBusy(true); isBusyRef.current = true;
    setIsRunningTools(true); setStatusOverride(STATUS_LABELS.thinking);
    const freshPageContext = getPageContext().summary;
    const controller = agentResumeStream(config.backendBaseUrl, resumeState, freshPageContext, buildStreamCallbacks(requestEpoch), buildToolExecutor());
    activeStreamControllerRef.current = controller;
    controller.done.catch(() => {}).finally(() => {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      setIsBusy(false); isBusyRef.current = false;
      setIsRunningTools(false); setIsThinking(false); setIsRenderingAudio(false); setIsPlayingAudio(false); setStatusOverride(null);
      pendingAssistantTextRef.current = ""; assistantMessageIdRef.current = null; activeStreamControllerRef.current = null;
      if (!autoListenSuppressedRef.current && shouldAutoListenAfterAudio(accessibilityMode, expectsReplyRef.current, isRecordingRef.current, false)) void startRecording("vad");
      expectsReplyRef.current = true;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Run agent for user text ───────────────────────────────────
  const runAgentForUserText = async (userText: string) => {
    if (!config.projectId) { appendMessage("Hata: Project ID yapılandırılmamış.", false); return; }
    const normalizedUserText = userText.trim();
    if (!normalizedUserText) { appendMessage("Ses kaydı metne dönüştürülemedi. Lütfen tekrar deneyin.", false); return; }
    const requestEpoch = beginRequestEpoch();
    setIsBusy(true); isBusyRef.current = true;
    setIsTranscribing(false); setIsThinking(true);
    setIsRenderingAudio(false); setIsPlayingAudio(false); setIsRunningTools(false);
    setStatusOverride(STATUS_LABELS.thinking);
    awaitingAssistantResponseRef.current = true;
    try {
      pendingUserTextRef.current = normalizedUserText;
      upsertLiveUserTranscription(normalizedUserText);
      clearLiveUserTranscriptionState();
      stopActiveStream();
      const pageContext = getPageContext().summary;
      const controller = agentTextChatStream(config.backendBaseUrl, normalizedUserText, config.projectId, sessionIdRef.current, { model: config.model, voice: config.voice, pageContext, accessibilityMode }, buildStreamCallbacks(requestEpoch), buildToolExecutor());
      activeStreamControllerRef.current = controller;
      await controller.done;
    } catch (error) {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      awaitingAssistantResponseRef.current = false; setStatusOverride(null);
      if (error instanceof Error) appendMessage(`Hata: ${error.message}`, false);
    } finally { finalizeStreamCycle(requestEpoch); }
  };

  // ── Handle audio blob ─────────────────────────────────────────
  const handleAudioBlob = async (blob: Blob) => {
    if (!config.projectId) { appendMessage("Hata: Project ID yapılandırılmamış.", false); return; }
    const requestEpoch = beginRequestEpoch();
    setIsBusy(true); isBusyRef.current = true;
    setIsTranscribing(true); setIsThinking(false);
    setIsRenderingAudio(false); setIsPlayingAudio(false); setIsRunningTools(false);
    resetProcessingFlags();
    setStatusOverride(STATUS_LABELS.thinking);
    awaitingAssistantResponseRef.current = true;
    try {
      const fileType = blob.type || "audio/webm";
      const extension = fileType.includes("ogg") ? "ogg" : fileType.includes("wav") ? "wav" : fileType.includes("mpeg") || fileType.includes("mp3") ? "mp3" : "webm";
      const file = new File([blob], `voice-input.${extension}`, { type: fileType });
      stopActiveStream();
      const pageContext = getPageContext().summary;
      const callbacks = buildStreamCallbacks(requestEpoch);
      const controller = agentVoiceChatStream(config.backendBaseUrl, file, config.projectId, sessionIdRef.current, { model: config.model, voice: config.voice, pageContext, accessibilityMode }, {
        onSttRequestSent: () => { if (!isCurrentRequestEpoch(requestEpoch)) return; playSttSentCueOnce(); },
        onTranscription: (data) => {
          if (!isCurrentRequestEpoch(requestEpoch)) return;
          if (data.session_id && data.session_id !== sessionIdRef.current) {
            sessionIdRef.current = data.session_id;
            if (typeof localStorage !== "undefined") localStorage.setItem(SESSION_ID_KEY, data.session_id);
          }
          const normalized = data.user_text.trim();
          if (normalized) {
            const prev = pendingUserTextRef.current;
            pendingUserTextRef.current = normalized;
            if (liveTranscriptionMessageIdRef.current !== null) { updateMessageText(liveTranscriptionMessageIdRef.current, normalized); clearLiveUserTranscriptionState(); }
            else if (prev !== normalized) appendMessage(normalized, true);
          }
          setIsTranscribing(false); setIsThinking(true); setStatusOverride(STATUS_LABELS.thinking);
        },
        ...callbacks,
      }, buildToolExecutor());
      activeStreamControllerRef.current = controller;
      await controller.done;
    } catch (error) {
      if (!isCurrentRequestEpoch(requestEpoch)) return;
      awaitingAssistantResponseRef.current = false; setStatusOverride(null);
    } finally { finalizeStreamCycle(requestEpoch); }
  };

  // ── Recording ─────────────────────────────────────────────────
  const stopRecording = (options?: { discard?: boolean }) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (options?.discard) discardNextRecordingRef.current = true;
    cleanupVAD();
    recorder.stop();
  };

  const setupVAD = (stream: MediaStream, recorder: MediaRecorder) => {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx(); audioContextRef.current = context;
    const analyser = context.createAnalyser(); analyser.fftSize = 256;
    const source = context.createMediaStreamSource(stream); sourceRef.current = source; source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    silenceStartRef.current = null;
    let speechDetected = false; let speechStartedAt: number | null = null;
    const enforceMinSpeechDuration = accessibilityMode;
    vadIntervalRef.current = window.setInterval(() => {
      if (!isRecordingRef.current || recorder.state === "inactive") { cleanupVAD(); return; }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0; for (const value of dataArray) sum += value;
      const volume = (sum / dataArray.length) / 255;
      if (volume < VAD_THRESHOLD) {
        if (!speechDetected) { speechStartedAt = null; silenceStartRef.current = null; return; }
        if (silenceStartRef.current === null) { silenceStartRef.current = Date.now(); return; }
        if (speechDetected && Date.now() - silenceStartRef.current > SILENCE_DURATION_MS) stopRecording();
        return;
      }
      silenceStartRef.current = null;
      if (speechStartedAt === null) speechStartedAt = Date.now();
      if (!speechDetected) {
        if (shouldAcceptVadSpeech(Date.now() - speechStartedAt, enforceMinSpeechDuration)) {
          speechDetected = true;
          if (enforceMinSpeechDuration) setStatusOverride(STATUS_LABELS.listening);
        }
      }
    }, 50);
  };

  const startRecording = async (mode: RecordingMode) => {
    if (isBusyRef.current || isRecordingRef.current || startRecordingPendingRef.current) return;
    setStatusOverride(STATUS_LABELS.micInitializing); setIsMicPending(true);
    if (!navigator.mediaDevices?.getUserMedia) { setStatusOverride(null); setIsMicPending(false); appendMessage("Bu tarayıcıda mikrofon kullanılamıyor.", false); return; }
    if (typeof MediaRecorder === "undefined") { setStatusOverride(null); setIsMicPending(false); appendMessage("Bu tarayıcıda MediaRecorder desteklenmiyor.", false); return; }
    startRecordingPendingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: 16_000 };
      const preferredMimeTypes = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
      for (const mime of preferredMimeTypes) { if (MediaRecorder.isTypeSupported(mime)) { recorderOptions.mimeType = mime; break; } }
      const recorder = new MediaRecorder(stream, recorderOptions);
      recorderRef.current = recorder; audioChunksRef.current = [];
      clearLiveUserTranscriptionState(); sttSendCuePlayedRef.current = false;
      const sttMimeType = (recorder.mimeType || recorderOptions.mimeType || "audio/webm").split(";")[0].trim() || "audio/webm";
      const sttWsController = startSttWebSocketStream(config.backendBaseUrl, { projectId: config.projectId, sessionId: sessionIdRef.current, language: "tr", mimeType: sttMimeType }, {
        onSessionId: (sid) => { if (!sid || sid === sessionIdRef.current) return; sessionIdRef.current = sid; if (typeof localStorage !== "undefined") localStorage.setItem(SESSION_ID_KEY, sid); },
        onPartial: ({ text }) => { if (!text.trim()) return; upsertLiveUserTranscription(text); },
      });
      activeSttWsRef.current = sttWsController;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) { audioChunksRef.current.push(event.data); if (activeSttWsRef.current) void activeSttWsRef.current.pushChunk(event.data).catch((error) => console.warn(`[Bulut] STT WS chunk send failed: ${error instanceof Error ? error.message : String(error)}`)); }
      };
      recorder.onerror = () => { appendMessage("Mikrofon kaydı sırasında bir hata oluştu.", false); };
      recorder.onstop = async () => {
        setIsRecording(false); isRecordingRef.current = false; recordingModeRef.current = null; stopRecordingTimer();
        cleanupVAD(); stopStreamTracks();
        const shouldDiscard = discardNextRecordingRef.current; discardNextRecordingRef.current = false;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" }); audioChunksRef.current = [];
        const currentSttWs = activeSttWsRef.current; activeSttWsRef.current = null;
        if (shouldDiscard) { currentSttWs?.cancel(); clearLiveUserTranscriptionState(); setStatusOverride(null); return; }
        if (blob.size === 0) { currentSttWs?.cancel(); clearLiveUserTranscriptionState(); setStatusOverride(null); appendMessage("Ses kaydı alınamadı. Lütfen tekrar deneyin.", false); return; }
        setIsTranscribing(true); setStatusOverride(STATUS_LABELS.transcribing);
        try {
          if (currentSttWs) {
            playSttSentCueOnce();
            const sttResult = await currentSttWs.stop();
            if (sttResult.session_id && sttResult.session_id !== sessionIdRef.current) { sessionIdRef.current = sttResult.session_id; if (typeof localStorage !== "undefined") localStorage.setItem(SESSION_ID_KEY, sttResult.session_id); }
            if (sttResult.text.trim()) { upsertLiveUserTranscription(sttResult.text); setStatusOverride(STATUS_LABELS.thinking); await runAgentForUserText(sttResult.text); return; }
          }
        } catch (error) { console.warn(`[Bulut] STT WS finalization failed, falling back to HTTP POST /chat/stt: ${error instanceof Error ? error.message : String(error)}`); }
        finally { clearLiveUserTranscriptionState(); }
        console.info("[Bulut] Using HTTP POST fallback for STT (streaming WS did not succeed)");
        setStatusOverride(STATUS_LABELS.thinking);
        await handleAudioBlob(blob);
      };
      if (mode === "vad") setupVAD(stream, recorder);
      recorder.start(200); recordingModeRef.current = mode;
      setIsRecording(true); isRecordingRef.current = true; startRecordingTimer();
      setStatusOverride(accessibilityMode && mode === "vad" ? STATUS_LABELS.accessibilityActive : STATUS_LABELS.listening);
      if (pendingStopAfterStartRef.current) { pendingStopAfterStartRef.current = false; stopRecording(); }
    } catch (error) {
      const errMsg = normalizeError(error);
      if (errMsg.toLowerCase().includes("permission") || errMsg.toLowerCase().includes("denied")) autoListenSuppressedRef.current = true;
      cancelActiveSttWs(); setStatusOverride(null); appendMessage(`Mikrofon hatası: ${errMsg}`, false); cleanupVAD(); stopStreamTracks(); pendingStopAfterStartRef.current = false; setIsRecording(false); isRecordingRef.current = false; stopRecordingTimer();
    } finally {
      if (!isRecordingRef.current && !isBusyRef.current) setStatusOverride(null);
      startRecordingPendingRef.current = false; setIsMicPending(false);
    }
  };

  // ── Mic gesture handlers ──────────────────────────────────────
  const resetMicGesture = () => { micPressStartRef.current = null; micHoldTriggeredRef.current = false; clearMicHoldTimeout(); };

  const handleMicPointerDown = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isBusyRef.current) return;
    if (isRecordingRef.current) {
      if (recordingModeRef.current === "vad") stopRecording({ discard: true }); else stopRecording();
      return;
    }
    micPressStartRef.current = Date.now(); micHoldTriggeredRef.current = false; clearMicHoldTimeout();
    if (event.currentTarget.setPointerCapture) try { event.currentTarget.setPointerCapture(event.pointerId); } catch { }
    micHoldTimeoutRef.current = window.setTimeout(() => {
      if (micPressStartRef.current === null || isBusyRef.current || isRecordingRef.current) return;
      micHoldTriggeredRef.current = true; void startRecording("press");
    }, 250);
  };

  const handleMicPointerUp = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.currentTarget.releasePointerCapture) try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { }
    const startedAt = micPressStartRef.current; const wasHold = micHoldTriggeredRef.current; resetMicGesture();
    if (startedAt === null) return;
    if (wasHold) { if (isRecordingRef.current) stopRecording(); else if (startRecordingPendingRef.current) pendingStopAfterStartRef.current = true; return; }
    if (classifyMicGesture(Date.now() - startedAt) === "tap") void startRecording("vad");
  };

  const handleMicPointerCancel = (event: JSX.TargetedPointerEvent<HTMLButtonElement>) => { handleMicPointerUp(event); };

  // ── Restart / Stop ────────────────────────────────────────────
  const handleRestart = () => {
    invalidateRequestEpoch(); sttSendCuePlayedRef.current = false; resetMicGesture(); pendingStopAfterStartRef.current = false;
    stopActiveStream(); stopActiveAudioPlayback(); cancelActiveSttWs();
    if (recorderRef.current && recorderRef.current.state !== "inactive") stopRecording({ discard: true });
    else { discardNextRecordingRef.current = false; cleanupVAD(); stopStreamTracks(); }
    stopRecordingTimer(); setRecordingDurationMs(0);
    clearPersistedChatState(typeof localStorage !== "undefined" ? localStorage : null);
    sessionIdRef.current = null;
    const initialMessages = createInitialMessages(config.agentName);
    nextMessageIdRef.current = getNextMessageId(initialMessages); setMessages(initialMessages);
    setIsBusy(false); isBusyRef.current = false; setIsRecording(false); isRecordingRef.current = false; resetProcessingFlags();
  };

  useEffect(() => {
    if (!accessibilityMode || autoListenSuppressedRef.current) return;
    const timer = window.setTimeout(() => {
      if (!isRecordingRef.current && !isBusyRef.current && !startRecordingPendingRef.current && !autoListenSuppressedRef.current) void startRecording("vad");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [accessibilityMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTask = () => {
    invalidateRequestEpoch(); sttSendCuePlayedRef.current = false;
    stopActiveStream(); stopActiveAudioPlayback(); cancelActiveSttWs();
    stopRecording({ discard: true }); cleanupVAD(); stopStreamTracks();
    resetProcessingFlags(); setIsBusy(false); isBusyRef.current = false;
  };

  if (actionsRef) {
    actionsRef.current = {
      startRecording: () => { autoListenSuppressedRef.current = false; void startRecording("vad"); },
      cancelRecording: () => {
        stopActiveAudioPlayback(); cancelActiveSttWs();
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") stopRecording({ discard: true });
        else { cleanupVAD(); stopStreamTracks(); }
      },
      stopTask,
    };
  }

  // ── Text input handler ────────────────────────────────────────
  const handleTextSubmit = () => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    setShowTextInput(false);
    if (onTextSubmit) onTextSubmit(text);
    void runAgentForUserText(text);
  };

  const handleTextKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); }
    if (e.key === "Escape") { setShowTextInput(false); setTextInput(""); }
  };

  // ── Derived state ─────────────────────────────────────────────
  const isVadRecording = isRecording && recordingModeRef.current === "vad";
  const showStopButton = isBusy && !isRecording;
  const hideMicButton = isMicPending && !isRecording;
  const disableMicControl = isBusy;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="bulut-chat-window" style={windowStyle(hidden, accessibilityMode)}>
      <style>{getChatWindowCss()}</style>

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <SvgIcon src={logoContent} title="Bulut Logo" style={{ width: "80px", minWidth: "80px", height: "auto", flexShrink: 0 }} stripColors={false} />
          <span style={{ marginTop: "7px", fontSize: "9px", color: COLORS.textSecondary, opacity: 0.45, fontWeight: 400, letterSpacing: "0.02em", userSelect: "none", whiteSpace: "nowrap", alignSelf: "flex-end" }}>
            v{typeof __BULUT_VERSION__ !== "undefined" ? __BULUT_VERSION__ : ""}
          </span>
        </div>
        <div style={headerActionsStyle}>
          <button type="button" className="bulut-header-btn" style={headerButtonStyle} onClick={handleRestart} aria-label="Sohbeti yeniden başlat" title="Sohbeti yeniden başlat">
            <SvgIcon src={arrowPathIconContent} aria-hidden="true" width={22} height={22} />
          </button>
          <button type="button" className="bulut-header-btn bulut-close-btn" style={{ ...headerButtonStyle, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose} aria-label="Sohbeti kapat" title="Sohbeti kapat">
            <SvgIcon src={xMarkIconContent} aria-hidden="true" width={22} height={22} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={messagesContainerStyle} ref={messagesContainerRef}>
        <div style={messagesListStyle} ref={messagesContentRef}>
          {messages.map((message) => {
            if (message.type === "tool") {
              const toolIconSrc = resolveToolIconSrc(message.toolKind);
              return (
                <div key={message.id} style={{ ...messageStyle(false), opacity: "0.7", display: "flex", alignItems: "center", gap: "8px" }}>
                  <SvgIcon src={toolIconSrc} aria-hidden="true" width={20} height={20} style={{ flexShrink: 0 }} />
                  <span>{message.text}</span>
                </div>
              );
            }
            return <div key={message.id} style={messageStyle(message.isUser)}>{message.text}</div>;
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <div style={{ ...statusPanelStyle, transition: "opacity 0.2s ease-out" }}>
          {showStatus ? (
            <span className="bulut-status-dots" title={statusText}>{statusText}</span>
          ) : showTextInput ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }}>
              <input
                type="text"
                value={textInput}
                onInput={(e) => setTextInput((e.target as HTMLInputElement).value)}
                onKeyDown={handleTextKeyDown}
                placeholder="Mesajınızı yazın..."
                autoFocus
                style={{
                  flex: "1", border: "none", outline: "none", fontSize: "14px",
                  background: "transparent", color: COLORS.text, padding: "4px 0",
                  fontFamily: '"Geist", sans-serif',
                }}
              />
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={!textInput.trim()}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "2px", opacity: textInput.trim() ? "1" : "0.4",
                  color: COLORS.primary, fontWeight: "600", fontSize: "13px",
                }}
              >
                Gönder
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowTextInput(true)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: "12px", opacity: "0.6", whiteSpace: "nowrap",
                color: COLORS.text, padding: "0",
                fontFamily: '"Geist", sans-serif',
              }}
            >
              Yazarak mesaj gönderin
            </button>
          )}
        </div>

        <div style={footerActionsStyle}>
          {isRecording ? (
            <span style={recordingTimerStyle}>{formatDurationMs(recordingDurationMs)}</span>
          ) : null}
          {showStopButton ? (
            <button type="button" className="bulut-footer-btn" style={micFooterButtonStyle} onClick={stopTask} aria-label="Görevi durdur" title="Görevi durdur">
              <SvgIcon src={stopOutlineIconContent} aria-hidden="true" width={22} height={22} style={{ color: "hsla(215, 100%, 5%, 1)" }} />
            </button>
          ) : hideMicButton ? null : (
            <button
              type="button" className="bulut-footer-btn" style={micFooterButtonStyle}
              onPointerDown={handleMicPointerDown} onPointerUp={handleMicPointerUp} onPointerCancel={handleMicPointerCancel}
              disabled={disableMicControl}
              aria-label={isVadRecording ? "Kaydı iptal et" : isRecording ? "Kaydı durdur" : "Kaydı başlat"}
              title={isVadRecording ? "Kaydı iptal et" : isRecording ? "Kaydı durdur" : "Dokun: VAD, Basılı tut: bırakınca gönder"}
            >
              {isVadRecording ? (
                <SvgIcon src={xMarkIconContent} aria-hidden="true" width={22} height={22} style={{ color: "hsla(215, 100%, 5%, 1)" }} />
              ) : (
                <SvgIcon src={microphoneOutlineIconContent} aria-hidden="true" width={22} height={22} style={{ color: "hsla(215, 100%, 5%, 1)" }} />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
