import type { CachedPageContextEntry } from "./types";
import { normalizeWhitespace, canonicalUrl } from "./helpers";
import { MAX_CACHED_PAGES } from "./config";

export const PAGE_CONTEXT_CACHE_VERSION = 4;
export const PAGE_CONTEXT_CACHE_KEY = "auticbot_page_context_cache_v4";

const pageContextCache = new Map<string, CachedPageContextEntry>();
let cacheHydrated = false;

const isCacheEntry = (value: unknown): value is CachedPageContextEntry => {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.url === "string" &&
    typeof obj.summary === "string" &&
    Array.isArray(obj.links) &&
    Array.isArray(obj.interactables) &&
    typeof obj.capturedAt === "number" &&
    typeof obj.version === "number"
  );
};

const hydrateCacheFromStorage = (): void => {
  if (cacheHydrated || typeof sessionStorage === "undefined") return;
  cacheHydrated = true;

  try {
    const raw = sessionStorage.getItem(PAGE_CONTEXT_CACHE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    for (const value of parsed) {
      if (!isCacheEntry(value)) continue;
      if (value.version !== PAGE_CONTEXT_CACHE_VERSION) continue;
      pageContextCache.set(value.url, value);
    }
    if (pageContextCache.size > 0) {
      console.info(`[Autic] context cache restored entries=${pageContextCache.size}`);
    }
  } catch (error) {
    console.warn("[Autic] context cache restore failed", error);
  }
};

const persistCacheToStorage = (): void => {
  if (typeof sessionStorage === "undefined") return;

  try {
    const serialized = JSON.stringify(
      Array.from(pageContextCache.values()).sort((a, b) => a.capturedAt - b.capturedAt),
    );
    sessionStorage.setItem(PAGE_CONTEXT_CACHE_KEY, serialized);
  } catch (error) {
    console.warn("[Autic] context cache persist failed", error);
  }
};

const pruneOldestCacheEntries = (): void => {
  if (pageContextCache.size <= MAX_CACHED_PAGES) return;

  const sorted = Array.from(pageContextCache.values()).sort(
    (a, b) => a.capturedAt - b.capturedAt,
  );
  const overflow = sorted.length - MAX_CACHED_PAGES;
  for (let i = 0; i < overflow; i += 1) {
    pageContextCache.delete(sorted[i].url);
  }
};

export const buildSummaryWithHistory = (current: CachedPageContextEntry): string => {
  const recentPages = Array.from(pageContextCache.values())
    .filter((entry) => entry.url !== current.url)
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, 3);

  if (recentPages.length === 0) return current.summary;

  const historySection = [
    "Recent Page Memory:",
    ...recentPages.map((entry) => {
      const compactSummary = normalizeWhitespace(entry.summary);
      return `- ${entry.url} :: ${compactSummary}`;
    }),
  ].join("\n");

  return `${current.summary}\n\n${historySection}`;
};

export const clearPageContextCache = (): void => {
  pageContextCache.clear();
  cacheHydrated = false;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(PAGE_CONTEXT_CACHE_KEY);
  }
};

export const getCachedPageContexts = (): CachedPageContextEntry[] => {
  hydrateCacheFromStorage();
  return Array.from(pageContextCache.values()).sort((a, b) => b.capturedAt - a.capturedAt);
};

export const invalidateCurrentPageContext = (): void => {
  if (typeof window === "undefined") return;
  const url = canonicalUrl(window.location.href);
  pageContextCache.delete(url);
  persistCacheToStorage();
};

export const getCachedEntry = (url: string): CachedPageContextEntry | undefined => {
  hydrateCacheFromStorage();
  return pageContextCache.get(url);
};

export const storeCacheEntry = (entry: CachedPageContextEntry): void => {
  pageContextCache.set(entry.url, entry);
  pruneOldestCacheEntries();
  persistCacheToStorage();
};

export const ensureCacheHydrated = (): void => {
  hydrateCacheFromStorage();
};
