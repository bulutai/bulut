import type { PageContext, CachedPageContextEntry } from "./types";
import { canonicalUrl } from "./helpers";
import {
  ensureCacheHydrated,
  getCachedEntry,
  storeCacheEntry,
  buildSummaryWithHistory,
} from "./cache";
import { collectSemanticElements, collectTextSnippets, collectHeadings } from "./scanner";

/**
 * Live element map — maps numeric IDs to DOM elements.
 * Rebuilt on every page context scan; NOT serialised to cache.
 */
let liveElementMap = new Map<number, Element>();

/** Look up a DOM element by its semantic-map ID. */
export const getElementById = (id: number): Element | undefined =>
  liveElementMap.get(id);

const formatSection = (title: string, lines: string[]): string => {
  if (lines.length === 0) return `${title}:\n- none`;
  return `${title}:\n${lines.join("\n")}`;
};

export const buildPageContextSummary = (
  url: string,
  title: string,
  lang: string,
  headings: string[],
  links: string[],
  interactables: string[],
  textSnippets: string[],
): string => {
  const sections = [
    formatSection("Page", [
      `- URL: ${url || "unknown"}`,
      `- Title: ${title || "unknown"}`,
      `- Lang: ${lang || "unknown"}`,
    ]),
    formatSection("Headings", headings),
    formatSection("Content Snippets", textSnippets),
    formatSection("Links", links),
    formatSection("Interactive Elements", interactables),
  ];

  return sections.join("\n\n");
};

export const getPageContext = (forceRefresh: boolean = false): PageContext => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { links: [], interactables: [], summary: "", elementMap: new Map() };
  }

  ensureCacheHydrated();
  const url = canonicalUrl(window.location.href);

  // Always rebuild the live element map (it holds DOM references)
  const scan = collectSemanticElements();
  liveElementMap = scan.elementMap;

  if (!forceRefresh) {
    const cached = getCachedEntry(url);
    if (cached) {
      console.info(`[Autic] context cache hit url=${url}`);
      return {
        links: cached.links,
        interactables: cached.interactables,
        summary: buildSummaryWithHistory(cached),
        elementMap: liveElementMap,
      };
    }
  }

  console.info(`[Autic] context cache miss url=${url}`);

  const headings = collectHeadings();

  const summary = buildPageContextSummary(
    url,
    document.title,
    document.documentElement.lang,
    headings,
    scan.links,
    scan.interactables,
    collectTextSnippets(),
  );

  const entry: CachedPageContextEntry = {
    url,
    summary,
    links: scan.links,
    interactables: scan.interactables,
    capturedAt: Date.now(),
    version: 4,
  };

  storeCacheEntry(entry);
  console.info(`[Autic] context cache stored url=${url}`);

  return {
    links: entry.links,
    interactables: entry.interactables,
    summary: buildSummaryWithHistory(entry),
    elementMap: liveElementMap,
  };
};
