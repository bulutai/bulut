import { RESUME_STORAGE_KEY, RESUME_TTL_MS } from "./constants";
import type { PendingAgentResume } from "./types";

export const savePendingAgentResume = (
  state: Omit<PendingAgentResume, "savedAt">,
): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      RESUME_STORAGE_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {
    // localStorage may be full or blocked
  }
};

export const getPendingAgentResume = (): PendingAgentResume | null => {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(RESUME_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingAgentResume;
    if (Date.now() - parsed.savedAt > RESUME_TTL_MS) {
      clearPendingAgentResume();
      return null;
    }
    return parsed;
  } catch {
    clearPendingAgentResume();
    return null;
  }
};

export const clearPendingAgentResume = (): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(RESUME_STORAGE_KEY);
};
