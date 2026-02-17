import { COLORS } from "./styles/constants";

// ── Public types ────────────────────────────────────────────────────

export type BulutVoice = "alloy" | "zeynep" | "ali";

export interface BulutOptions {
  containerId?: string;
  backendBaseUrl?: string;
  projectId?: string;
}

export interface BulutRuntimeConfig {
  backendBaseUrl: string;
  projectId: string;
  model: string;
  voice: BulutVoice;
  baseColor: string;
  agentName: string;
}

// ── Defaults ────────────────────────────────────────────────────────

/** Default LLM model — keep in sync with backend config.DEFAULT_LLM_MODEL */
const DEFAULT_LLM_MODEL = "x-ai/grok-4.1-fast";
const DEFAULT_AGENT_NAME = "Bulut";

export const DEFAULT_CONFIG: BulutRuntimeConfig = {
  backendBaseUrl: "https://api.bulut.lu",
  projectId: "",
  model: DEFAULT_LLM_MODEL,
  voice: "alloy",
  baseColor: COLORS.primary,
  agentName: DEFAULT_AGENT_NAME,
};

// ── Color / Theme utilities ─────────────────────────────────────────

const isValidHexColor = (value: string): boolean =>
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);

export const normalizeHexColor = (value: string): string => {
  const trimmed = value.trim();
  if (!isValidHexColor(trimmed)) return DEFAULT_CONFIG.baseColor;
  if (trimmed.length === 4) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
};

export const shadeHexColor = (hexColor: string, amount: number): string => {
  const normalized = normalizeHexColor(hexColor);
  const raw = normalized.slice(1);
  const toChannel = (start: number): number => parseInt(raw.slice(start, start + 2), 16);
  const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
  const adjust = (channel: number): number =>
    amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount;
  const toHex = (channel: number): string => clamp(channel).toString(16).padStart(2, "0");

  const r = adjust(toChannel(0));
  const g = adjust(toChannel(2));
  const b = adjust(toChannel(4));

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const applyTheme = (baseColor: string): void => {
  const normalized = normalizeHexColor(baseColor);
  COLORS.primary = normalized;
  COLORS.primaryHover = shadeHexColor(normalized, -0.15);
  COLORS.messageUser = normalized;
};

// ── Remote project config ───────────────────────────────────────────

export interface RemoteProjectConfig {
  base_color: string;
  model: string;
  agent_name: string;
  voice: string;
}

export const fetchRemoteConfig = async (
  baseUrl: string,
  projectId: string,
): Promise<RemoteProjectConfig | null> => {
  try {
    const url = baseUrl.replace(/\/+$/, "");
    const res = await fetch(`${url}/projects/${projectId}/config`);
    if (!res.ok) return null;
    return (await res.json()) as RemoteProjectConfig;
  } catch {
    return null;
  }
};

export const resolveRuntimeConfig = (options: BulutOptions): BulutRuntimeConfig => ({
  backendBaseUrl: options.backendBaseUrl || DEFAULT_CONFIG.backendBaseUrl,
  projectId: options.projectId || DEFAULT_CONFIG.projectId,
  model: DEFAULT_CONFIG.model,
  voice: DEFAULT_CONFIG.voice,
  baseColor: DEFAULT_CONFIG.baseColor,
  agentName: DEFAULT_CONFIG.agentName,
});
