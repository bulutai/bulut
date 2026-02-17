import { COLORS } from "../../styles/constants";
import {
  AGENT_CURSOR_ID,
  CURSOR_MOVE_DURATION_MS,
  CURSOR_EASING,
  CURSOR_HOVER_RADIUS_PX,
  CURSOR_DIAMETER_PX,
} from "./constants";

const isVisibleElement = (element: HTMLElement): boolean => {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
};

const getBulutShadowRoots = (): ShadowRoot[] => {
  const roots: ShadowRoot[] = [];

  const defaultHost = document.getElementById("bulut-container");
  if (defaultHost?.shadowRoot) roots.push(defaultHost.shadowRoot);

  const allElements = document.querySelectorAll<HTMLElement>("*");
  for (const el of allElements) {
    if (!el.shadowRoot) continue;
    if (!roots.includes(el.shadowRoot)) roots.push(el.shadowRoot);
  }

  return roots;
};

const findAgentUiAnchorElement = (): HTMLElement | null => {
  const roots = getBulutShadowRoots();

  for (const root of roots) {
    const panel = root.querySelector<HTMLElement>(".bulut-chat-window");
    if (panel && isVisibleElement(panel)) return panel;
  }

  for (const root of roots) {
    const button = root.querySelector<HTMLElement>(".bulut-fab-container");
    if (button && isVisibleElement(button)) return button;
  }

  return null;
};

const getAgentWindowTopLeft = (): { x: number; y: number } => {
  const anchor = findAgentUiAnchorElement();
  if (!anchor) {
    return { x: CURSOR_DIAMETER_PX / 2, y: CURSOR_DIAMETER_PX / 2 };
  }
  const rect = anchor.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX + CURSOR_DIAMETER_PX / 2,
    y: rect.top + window.scrollY + CURSOR_DIAMETER_PX / 2,
  };
};

const setCursorPosition = (cursor: HTMLElement, x: number, y: number) => {
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
};

const getCursorPosition = (cursor: HTMLElement): { x: number; y: number } => ({
  x: Number.parseFloat(cursor.style.left) || 0,
  y: Number.parseFloat(cursor.style.top) || 0,
});

const setCursorVisibility = (cursor: HTMLElement, visible: boolean) => {
  cursor.style.opacity = visible ? "1" : "0";
};

let cursorHoverTrackingInitialized = false;
const initializeCursorHoverTracking = () => {
  if (cursorHoverTrackingInitialized) return;
  cursorHoverTrackingInitialized = true;

  document.addEventListener("mousemove", (event) => {
    const cursor = document.getElementById(AGENT_CURSOR_ID);
    if (!(cursor instanceof HTMLElement)) return;
    if (cursor.style.opacity !== "1") return;

    const { x, y } = getCursorPosition(cursor);
    const distance = Math.hypot(event.pageX - x, event.pageY - y);
    if (distance <= CURSOR_HOVER_RADIUS_PX) setCursorVisibility(cursor, false);
  });
};

const ensureCursor = (): HTMLElement => {
  const existing = document.getElementById(AGENT_CURSOR_ID);
  if (existing) {
    existing.style.background = COLORS.primary;
    initializeCursorHoverTracking();
    return existing as HTMLElement;
  }

  const cursor = document.createElement("div");
  cursor.id = AGENT_CURSOR_ID;
  cursor.style.position = "absolute";
  const startPosition = getAgentWindowTopLeft();
  cursor.style.left = `${startPosition.x}px`;
  cursor.style.top = `${startPosition.y}px`;
  cursor.style.opacity = "0";
  const width = CURSOR_DIAMETER_PX;
  cursor.style.width = `${width}px`;
  cursor.style.height = `${width}px`;
  cursor.style.borderRadius = "50%";
  cursor.style.background = COLORS.primary;
  const border = 25 * 16 / 100;
  cursor.style.border = `${border}px solid #ffffff`;
  cursor.style.boxShadow = "0px 0px 10px rgba(0, 11, 26, 0.5)";
  cursor.style.boxSizing = "border-box";
  cursor.style.zIndex = "2147483647";
  cursor.style.pointerEvents = "none";
  cursor.style.transform = "translate(-50%, -50%)";
  cursor.style.transition = `left ${CURSOR_MOVE_DURATION_MS}ms ${CURSOR_EASING}, top ${CURSOR_MOVE_DURATION_MS}ms ${CURSOR_EASING}, opacity 150ms ease-out`;
  document.body.appendChild(cursor);
  initializeCursorHoverTracking();
  console.info(`[Autic] cursor created color=${COLORS.primary} duration=${CURSOR_MOVE_DURATION_MS}ms`);
  return cursor;
};

const waitForNextAnimationFrame = async (): Promise<void> => {
  const raf =
    window.requestAnimationFrame ||
    ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
  await new Promise<void>((resolve) => { raf(() => resolve()); });
};

export const moveCursor = async (x: number, y: number) => {
  const cursor = ensureCursor();
  if (cursor.dataset.transitionReady !== "true") {
    cursor.dataset.transitionReady = "true";
    await waitForNextAnimationFrame();
  }

  const isAlreadyVisible = cursor.style.opacity === "1";

  if (!isAlreadyVisible) {
    const startPosition = getAgentWindowTopLeft();
    setCursorVisibility(cursor, true);
    setCursorPosition(cursor, startPosition.x, startPosition.y);
    await new Promise((resolve) => setTimeout(resolve, CURSOR_MOVE_DURATION_MS));
  }

  setCursorVisibility(cursor, true);
  setCursorPosition(cursor, x, y);
  await new Promise((resolve) => setTimeout(resolve, CURSOR_MOVE_DURATION_MS));
};

export const hideAgentCursor = (): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const cursor = document.getElementById(AGENT_CURSOR_ID);
  if (!(cursor instanceof HTMLElement)) return;
  setCursorVisibility(cursor, false);
};

export const getElementCenter = (element: HTMLElement): { x: number; y: number } => {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX + rect.width / 2,
    y: rect.top + window.scrollY + rect.height / 2,
  };
};
