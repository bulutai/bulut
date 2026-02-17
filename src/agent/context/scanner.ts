import {
  NON_CONTENT_TAGS,
  SVG_INTERNAL_TAGS,
  NATIVE_INTERACTIVE_TAGS,
  INTERACTIVE_ROLES,
} from "./tagSets";
import {
  normalizeWhitespace,
  isVisible,
  hasInteractiveAncestor,
  toAbsoluteUrl,
  getPrimaryRole,
  parseTabIndex,
} from "./helpers";
import {
  getElementLabel,
  describeElementType,
  getElementState,
} from "./elementDescriptors";
import {
  MAX_LINKS,
  MAX_INTERACTABLES,
  MAX_TEXT_SNIPPETS,
  MAX_HEADINGS,
  MAX_PAGE_SCAN_ELEMENTS,
} from "./config";
import type { InteractableCandidate, SemanticScanResult } from "./types";

/**
 * Scan the DOM and build a semantic element map.
 *
 * Every interactive element gets a numeric ID. The LLM uses these IDs
 * with `interact(id=N)` instead of fragile CSS selectors.
 */
export const collectSemanticElements = (): SemanticScanResult => {
  const allElements = Array.from(document.querySelectorAll("*"));
  const sampledElements = allElements.slice(0, MAX_PAGE_SCAN_ELEMENTS);

  const links: string[] = [];
  const linkSet = new Set<string>();
  const candidates: InteractableCandidate[] = [];
  const elementMap = new Map<number, Element>();
  let idCounter = 1;

  for (let order = 0; order < sampledElements.length; order += 1) {
    const element = sampledElements[order];
    const tag = element.tagName.toLowerCase();

    if (NON_CONTENT_TAGS.has(tag)) continue;
    if (SVG_INTERNAL_TAGS.has(tag)) continue;
    if (!isVisible(element)) continue;

    const role = getPrimaryRole(element);
    const style = window.getComputedStyle(element);
    const href = element.getAttribute("href");
    const isNativeInteractive = NATIVE_INTERACTIVE_TAGS.has(tag) && (tag !== "a" || Boolean(href));
    const isRoleInteractive = INTERACTIVE_ROLES.has(role);
    const tabIndex = parseTabIndex(element.getAttribute("tabindex"));
    const hasTabStop = tabIndex !== null && tabIndex >= 0;
    const hasPointerCursor = style.cursor === "pointer";
    const isContentEditable = element.getAttribute("contenteditable") === "true";
    const isDisabled =
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true";

    // ── Links ───────────────────────────────────────────────────
    if (
      tag === "a" &&
      href &&
      !href.startsWith("#") &&
      !href.startsWith("javascript:")
    ) {
      const absoluteHref = toAbsoluteUrl(href);
      const label = getElementLabel(element) || absoluteHref;
      const id = idCounter++;
      const line = `- [${id}] ${label} -> ${absoluteHref}`;

      if (!linkSet.has(absoluteHref)) {
        linkSet.add(absoluteHref);
        links.push(line);
        elementMap.set(id, element);
      }
    }

    // ── Interactables ───────────────────────────────────────────
    const hasInteractionSignals =
      isNativeInteractive ||
      isRoleInteractive ||
      isContentEditable ||
      hasTabStop ||
      hasPointerCursor;

    if (!hasInteractionSignals || isDisabled) continue;
    if (hasInteractiveAncestor(element)) continue;

    const id = idCounter++;
    elementMap.set(id, element);

    const elType = describeElementType(element);
    const label = getElementLabel(element);
    const stateTokens = getElementState(element);
    const statePart = stateTokens.length > 0 ? ` (${stateTokens.join(", ")})` : "";
    const line = `- [${id}] ${elType}: "${label}"${statePart}`;

    const score =
      (isNativeInteractive ? 5 : 0) +
      (isRoleInteractive ? 4 : 0) +
      (hasTabStop ? 2 : 0) +
      (hasPointerCursor ? 2 : 0) +
      (isContentEditable ? 2 : 0);

    candidates.push({ id, line, score, order, element });
  }

  const interactables = candidates
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_INTERACTABLES)
    .map((c) => c.line);

  return {
    links: links.slice(0, MAX_LINKS),
    interactables,
    elementMap,
  };
};

const TEXT_CONTENT_SELECTOR = [
  "p", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "figcaption", "dd", "dt", "td", "th",
  "pre", "label", "caption",
].join(", ");

/**
 * Check if an element has meaningful direct text content
 * (text nodes that aren't just whitespace).
 */
const hasDirectText = (element: Element): boolean => {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const trimmed = (child.textContent || "").trim();
      if (trimmed.length >= 10) return true;
    }
  }
  return false;
};

export const collectTextSnippets = (): string[] => {
  const root =
    document.querySelector("main, article, [role='main']") ?? document.body;
  const snippets: string[] = [];
  const seen = new Set<string>();

  const addSnippet = (raw: string): boolean => {
    if (!raw || raw.length < 15) return false;
    const text = raw.length > 300 ? raw.substring(0, 300) + "…" : raw;
    if (seen.has(text)) return false;
    seen.add(text);
    snippets.push(`- ${text}`);
    return snippets.length >= MAX_TEXT_SNIPPETS;
  };

  // Pass 1: semantic text elements
  const textCandidates = Array.from(root.querySelectorAll(TEXT_CONTENT_SELECTOR));
  for (const node of textCandidates) {
    if (!isVisible(node)) continue;
    const raw = normalizeWhitespace(node.textContent || "");
    if (addSnippet(raw)) return snippets;
  }

  // Pass 2: generic containers with direct text
  const genericContainers = Array.from(
    root.querySelectorAll("div, span, section, article, aside, header, footer"),
  );
  for (const node of genericContainers) {
    if (!isVisible(node)) continue;
    if (!hasDirectText(node)) continue;
    const raw = normalizeWhitespace(node.textContent || "");
    if (addSnippet(raw)) return snippets;
  }

  return snippets;
};

export const collectHeadings = (): string[] => {
  return Array.from(document.querySelectorAll("h1, h2, h3"))
    .filter((element) => isVisible(element))
    .map((element) => `- ${normalizeWhitespace(element.textContent || "")}`)
    .filter((line) => line !== "- ")
    .slice(0, MAX_HEADINGS);
};
