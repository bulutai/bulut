import type { AgentToolCall, ParsedAgentResponse } from "./types";

interface JsonObject {
  [key: string]: unknown;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const extractJsonCandidate = (raw: string): string => {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();
  return trimmed;
};

const extractFirstJsonObject = (input: string): string | null => {
  const start = input.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];

    if (inString) {
      if (isEscaped) { isEscaped = false; }
      else if (char === "\\") { isEscaped = true; }
      else if (char === '"') { inString = false; }
      continue;
    }

    if (char === '"') { inString = true; continue; }
    if (char === "{") { depth += 1; continue; }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }

  return null;
};

const parseJsonFromRaw = (raw: string): unknown => {
  const candidate = extractJsonCandidate(raw);
  try {
    return JSON.parse(candidate);
  } catch {
    const objectCandidate = extractFirstJsonObject(candidate);
    if (!objectCandidate) return null;
    try { return JSON.parse(objectCandidate); }
    catch { return null; }
  }
};

type InteractAction = "move" | "click" | "type" | "submit";

const sanitizeToolCalls = (value: unknown): AgentToolCall[] => {
  if (!Array.isArray(value)) return [];
  const toolCalls: AgentToolCall[] = [];

  for (const item of value) {
    if (!isObject(item)) continue;

    if (item.tool === "interact") {
      const action = asString(item.action) as InteractAction | undefined;
      if (!action || !["move", "click", "type", "submit"].includes(action)) continue;
      toolCalls.push({
        tool: "interact",
        action,
        id: asNumber(item.id),
        selector: asString(item.selector),
        text: typeof item.text === "string" ? item.text : undefined,
        x: asNumber(item.x),
        y: asNumber(item.y),
      });
      continue;
    }

    if (item.tool === "navigate") {
      const url = asString(item.url);
      if (!url) continue;
      toolCalls.push({ tool: "navigate", url });
      continue;
    }

    if (item.tool === "getPageContext") {
      toolCalls.push({ tool: "getPageContext" });
      continue;
    }

    if (item.tool === "scroll") {
      const id = asNumber(item.id);
      const selector = asString(item.selector);
      if (!id && !selector) continue;
      toolCalls.push({ tool: "scroll", id, selector });
    }
  }

  return toolCalls;
};

export const parseAgentResponse = (raw: string): ParsedAgentResponse => {
  const parsed = parseJsonFromRaw(raw);
  if (!isObject(parsed)) return { reply: raw.trim(), toolCalls: [] };

  const reply = asString(parsed.reply) || "";
  const toolCalls = sanitizeToolCalls(parsed.tool_calls ?? parsed.toolCalls);

  return { reply, toolCalls };
};
