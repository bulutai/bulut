export const NON_FINAL_MAX_CHARS = 180;
export const NON_FINAL_MAX_WORDS = 28;
export const FINAL_MAX_CHARS = 420;
export const FINAL_MAX_WORDS = 90;

const POLICY_MARKER = "BULUT_AGENT_RUNTIME_POLICY_V1";

const normalizeWhitespace = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

const dedupeConsecutiveSentences = (text: string): string => {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return text;
  }

  const deduped: string[] = [];
  let previous = "";

  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === previous) {
      continue;
    }
    deduped.push(part);
    previous = normalized;
  }

  return deduped.join(" ").trim();
};

const clipWords = (text: string, maxWords: number): string => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text;
  }
  return words.slice(0, maxWords).join(" ");
};

const clipChars = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) {
    return text;
  }

  const clipped = text.slice(0, maxChars).trimEnd();
  if (!clipped) {
    return "";
  }

  return clipped.endsWith("...") ? clipped : `${clipped}...`;
};

const trimByLimits = (
  text: string,
  maxWords: number,
  maxChars: number,
): string => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return "";
  }

  const deduped = dedupeConsecutiveSentences(normalized);
  const wordClipped = clipWords(deduped, maxWords);
  const charClipped = clipChars(wordClipped, maxChars);
  return normalizeWhitespace(charClipped);
};

export const trimNonFinalReply = (text: string): string =>
  trimByLimits(text, NON_FINAL_MAX_WORDS, NON_FINAL_MAX_CHARS);

export const trimFinalReply = (text: string): string =>
  trimByLimits(text, FINAL_MAX_WORDS, FINAL_MAX_CHARS);

export const shouldSpeakMidSessionReply = (text: string): boolean =>
  /[?]|(onay|izin|emin|hangi|confirm|clarify|which)/i.test(text.trim());

export const buildRuntimePolicyContext = (pageContext?: string): string => {
  const base = normalizeWhitespace(pageContext || "");
  if (base.includes(POLICY_MARKER)) {
    return base;
  }

  const policy = [
    POLICY_MARKER,
    "Intermediate replies: short, operational, max_tokens=120, no repetition.",
    "Final reply: concise summary, max_tokens=320.",
    "Keep tool reasoning; do not expose verbose confirmations.",
    "click: if target changes domain, ask user confirmation first.",
    "navigate: internal route change only; never change domain.",
    "getpagecontext: use when page context is missing/uncertain; fetch context then continue.",
    "Execution: chain safe tool calls silently; speak mid-session only for confirmation/clarification.",
  ].join("\n");

  return base ? `${base}\n\n${policy}` : policy;
};
