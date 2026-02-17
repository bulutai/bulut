import { getPageContext, getElementById, invalidateCurrentPageContext } from "../context";
import { SCROLL_DURATION_MS } from "./constants";
import type {
  AgentToolCall,
  InteractToolCall,
  NavigateToolCall,
  ScrollToolCall,
  ToolCallWithId,
  ToolCallResult,
} from "./types";
import { moveCursor, getElementCenter } from "./cursor";
import {
  isRectOutsideViewport,
  computeCenteredScrollTop,
  animateWindowScrollTo,
} from "./animation";

// ── Selector resolution ─────────────────────────────────────────────

const CONTAINS_SELECTOR_PATTERN = /^(.*?):contains\((['"])(.*?)\2\)\s*$/;

const findElementBySelector = (selector: string): Element | null => {
  try {
    return document.querySelector(selector);
  } catch (error) {
    const containsMatch = selector.match(CONTAINS_SELECTOR_PATTERN);
    if (!containsMatch) {
      console.warn(`AuticBot selector invalid: ${selector}`, error);
      return null;
    }

    const baseSelector = containsMatch[1]?.trim() || "*";
    const expectedText = containsMatch[3]?.trim() || "";
    if (!expectedText) {
      console.warn(`AuticBot selector contains empty text: ${selector}`);
      return null;
    }

    try {
      const candidates = document.querySelectorAll(baseSelector);
      for (const candidate of candidates) {
        if (candidate.textContent?.includes(expectedText)) return candidate;
      }
      return null;
    } catch (fallbackError) {
      console.warn(`AuticBot selector fallback invalid: ${selector}`, fallbackError);
      return null;
    }
  }
};

interface ResolvedTarget {
  element?: HTMLElement;
  x: number;
  y: number;
}

const resolveTarget = (call: InteractToolCall): ResolvedTarget | null => {
  if (typeof call.id === "number") {
    const mapped = getElementById(call.id);
    if (mapped instanceof HTMLElement) {
      const center = getElementCenter(mapped);
      return { element: mapped, x: center.x, y: center.y };
    }
    console.warn(`AuticBot interact: element id=${call.id} not found in map`);
  }

  if (call.selector) {
    const selected = findElementBySelector(call.selector);
    if (selected instanceof HTMLElement) {
      const center = getElementCenter(selected);
      return { element: selected, x: center.x, y: center.y };
    }
    console.warn(`AuticBot interact: selector not found: ${call.selector}`);
  }

  if (typeof call.x === "number" && typeof call.y === "number") {
    return { x: call.x, y: call.y };
  }

  console.warn("AuticBot interact: missing target id, selector or coordinates.", call);
  return null;
};

// ── DOM interaction helpers ─────────────────────────────────────────

const dispatchMouseEvent = (element: HTMLElement, type: string, x: number, y: number) => {
  element.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x - window.scrollX,
      clientY: y - window.scrollY,
    }),
  );
};

const setNativeInputLikeValue = (
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
) => {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) descriptor.set.call(element, text);
  else element.value = text;

  element.defaultValue = text;
  element.setAttribute("value", text);
};

const typeIntoElement = (element: HTMLElement, text: string) => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    setNativeInputLikeValue(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (element.isContentEditable) {
    element.focus();
    element.textContent = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  console.warn("AuticBot interact: type action requires input, textarea, or contenteditable target.");
};

const submitElement = (element: HTMLElement) => {
  if (element.tagName === "FORM") {
    (element as HTMLFormElement).requestSubmit();
    return;
  }
  if (element.tagName === "BUTTON" && (element as HTMLButtonElement).form) {
    (element as HTMLButtonElement).form?.requestSubmit();
    return;
  }
  const parentForm = element.closest("form");
  if (parentForm) {
    parentForm.requestSubmit();
    return;
  }
  console.warn("AuticBot interact: submit action requires a form target.");
};

// ── Scrolling ───────────────────────────────────────────────────────

const slowScrollElementIntoView = async (element: HTMLElement): Promise<void> => {
  await slowScrollElementIntoViewWithMode(element, false);
};

const slowScrollElementIntoViewWithMode = async (
  element: HTMLElement,
  forceCenter: boolean,
): Promise<void> => {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;

  if (!forceCenter && !isRectOutsideViewport(rect, viewportHeight)) return;

  const maxScrollTop = Math.max(
    0,
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - viewportHeight,
  );
  const targetY = computeCenteredScrollTop(
    window.scrollY, rect.top, rect.height, viewportHeight, maxScrollTop,
  );

  await animateWindowScrollTo(targetY, SCROLL_DURATION_MS);
};

// ── Tool executors ──────────────────────────────────────────────────

const executeScroll = async (call: ScrollToolCall) => {
  const selected =
    (typeof call.id === "number" ? getElementById(call.id) : null) ??
    (call.selector ? findElementBySelector(call.selector) : null);

  if (!(selected instanceof HTMLElement)) {
    console.warn(`AuticBot scroll: target not found (id=${call.id}, selector=${call.selector})`);
    return;
  }

  await slowScrollElementIntoViewWithMode(selected, true);
  const center = getElementCenter(selected);
  await moveCursor(center.x, center.y);
};

const executeInteract = async (call: InteractToolCall) => {
  const target = resolveTarget(call);
  if (!target) return;

  if (call.action === "click" && target.element) {
    await slowScrollElementIntoView(target.element);
    const center = getElementCenter(target.element);
    target.x = center.x;
    target.y = center.y;
  }

  await moveCursor(target.x, target.y);

  if (call.action === "move") return;

  if (!target.element) {
    console.warn("AuticBot interact: target element not available for action.", call.action);
    return;
  }

  if (call.action === "click") {
    dispatchMouseEvent(target.element, "pointerdown", target.x, target.y);
    dispatchMouseEvent(target.element, "mousedown", target.x, target.y);
    dispatchMouseEvent(target.element, "pointerup", target.x, target.y);
    dispatchMouseEvent(target.element, "mouseup", target.x, target.y);
    target.element.click();
    invalidateCurrentPageContext();
    return;
  }

  if (call.action === "type") {
    typeIntoElement(target.element, call.text ?? "");
    invalidateCurrentPageContext();
    return;
  }

  submitElement(target.element);
  invalidateCurrentPageContext();
};

const isSamePageNavigation = (targetUrl: string): boolean => {
  try {
    const current = new URL(window.location.href);
    const target = new URL(targetUrl);
    return current.origin === target.origin && current.pathname === target.pathname;
  } catch {
    return false;
  }
};

/**
 * Find the best matching link element for a target URL.
 */
const findMatchingLinkForTarget = (targetUrl: string): HTMLElement | null => {
  let parsedTarget: URL | null = null;
  try {
    parsedTarget = new URL(targetUrl, window.location.href);
  } catch { /* will fall through */ }

  const allLinks = Array.from(
    document.querySelectorAll('a[href], [role="link"][href], [data-href]'),
  ) as HTMLElement[];

  // 1. Exact href match
  for (const el of allLinks) {
    if (el instanceof HTMLAnchorElement && el.href === parsedTarget?.href) return el;
  }

  if (parsedTarget) {
    // 2. pathname + search + hash
    for (const el of allLinks) {
      if (!(el instanceof HTMLAnchorElement)) continue;
      try {
        const elUrl = new URL(el.href, window.location.href);
        if (elUrl.pathname === parsedTarget.pathname && elUrl.search === parsedTarget.search && elUrl.hash === parsedTarget.hash) return el;
      } catch { continue; }
    }

    // 3. pathname only
    for (const el of allLinks) {
      if (!(el instanceof HTMLAnchorElement)) continue;
      try {
        const elUrl = new URL(el.href, window.location.href);
        if (elUrl.pathname === parsedTarget.pathname) return el;
      } catch { continue; }
    }

    // 4. Partial href attribute
    const rawUrl = targetUrl.replace(/^\//, "");
    for (const el of allLinks) {
      const href = el.getAttribute("href") || el.getAttribute("data-href") || "";
      if (href && (href === targetUrl || href === rawUrl || href === `/${rawUrl}`)) return el;
    }
  }

  // 5. Text-content match
  const urlSegments = targetUrl
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/[?#].*$/, "")
    .split("/")
    .filter(Boolean);
  const lastSegment = urlSegments[urlSegments.length - 1] || "";

  if (lastSegment) {
    let searchTerms = [lastSegment];
    if (parsedTarget) {
      for (const [, value] of parsedTarget.searchParams.entries()) {
        if (value) searchTerms.push(value);
      }
      if (parsedTarget.hash) searchTerms.push(parsedTarget.hash.replace(/^#/, ""));
    }
    searchTerms = searchTerms.map((t) => t.toLowerCase());

    const clickables = Array.from(
      document.querySelectorAll('a, button, [role="link"], [role="tab"], [role="button"], [data-tab], [onclick]'),
    ) as HTMLElement[];

    for (const el of clickables) {
      const text = (el.textContent || "").trim().toLowerCase();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      const dataTab = (el.getAttribute("data-tab") || "").toLowerCase();
      for (const term of searchTerms) {
        if (text === term || ariaLabel === term || dataTab === term || text.includes(term)) return el;
      }
    }
  }

  return null;
};

const executeNavigate = async (call: NavigateToolCall): Promise<boolean> => {
  try {
    const targetUrl = call.url;
    let resolvedUrl: string;
    try { resolvedUrl = new URL(targetUrl, window.location.href).href; }
    catch { resolvedUrl = targetUrl; }

    const matchingElement = findMatchingLinkForTarget(targetUrl);

    if (matchingElement) {
      console.log("AuticBot navigate: clicking element", resolvedUrl, matchingElement.tagName);
      await slowScrollElementIntoView(matchingElement);
      const center = getElementCenter(matchingElement);
      await moveCursor(center.x, center.y);

      matchingElement.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, view: window }));
      matchingElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, view: window }));
      matchingElement.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, view: window }));
      matchingElement.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, view: window }));
      matchingElement.click();

      return !isSamePageNavigation(resolvedUrl);
    }

    console.log("AuticBot navigate: no matching element found, using direct navigation", resolvedUrl);

    // Hash-only navigation
    try {
      const parsed = new URL(resolvedUrl);
      if (parsed.origin === window.location.origin && parsed.pathname === window.location.pathname && parsed.hash) {
        window.location.hash = parsed.hash;
        return false;
      }
    } catch { /* continue */ }

    // Query-param or same-origin via History API
    try {
      const parsed = new URL(resolvedUrl);
      if (parsed.origin === window.location.origin) {
        const newPath = parsed.pathname + parsed.search + parsed.hash;
        window.history.pushState({}, "", newPath);
        window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
        return false;
      }
    } catch { /* continue */ }

    // Cross-origin: full page navigation
    window.location.href = resolvedUrl;
    return true;
  } catch (error) {
    console.warn("AuticBot navigate: error", call.url, error);
    return false;
  }
};

const executeGetPageContext = async () => {
  const context = getPageContext();
  console.info(
    `[Autic] getPageContext tool executed links=${context.links.length} interactables=${context.interactables.length} summary_len=${context.summary.length}`,
  );
};

// ── Public API ──────────────────────────────────────────────────────

export const executeToolCalls = async (toolCalls: AgentToolCall[]) => {
  for (const toolCall of toolCalls) {
    if (toolCall.tool === "interact") { await executeInteract(toolCall); continue; }
    if (toolCall.tool === "scroll") { await executeScroll(toolCall); continue; }
    if (toolCall.tool === "getPageContext") { await executeGetPageContext(); continue; }
    if (toolCall.tool === "navigate") {
      const terminalNavigation = await executeNavigate(toolCall);
      if (terminalNavigation) break;
    }
  }
};

/**
 * Execute a single tool call and return a result string.
 * Used by the agent loop to feed results back into the LLM.
 */
export const executeSingleToolCall = async (call: ToolCallWithId): Promise<ToolCallResult> => {
  const callId = call.call_id;
  try {
    if (call.tool === "interact") {
      await executeInteract(call);
      return { call_id: callId, result: `Etkileşim başarılı: ${call.action}` };
    }
    if (call.tool === "scroll") {
      await executeScroll(call);
      return { call_id: callId, result: "Öğeye kaydırma başarılı." };
    }
    if (call.tool === "getPageContext") {
      const context = getPageContext(true);
      return { call_id: callId, result: context.summary };
    }
    if (call.tool === "navigate") {
      await executeNavigate(call);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const context = getPageContext();
      return {
        call_id: callId,
        result: `Navigasyon tamamlandı. Şu anki sayfa: ${window.location.href}\nSayfa bağlamı: ${context.summary}`,
      };
    }
    return { call_id: callId, result: "Bilinmeyen araç." };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Autic] Tool execution error: ${call.tool}`, error);
    return { call_id: callId, result: `Hata: ${msg}` };
  }
};
