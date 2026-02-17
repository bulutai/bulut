import { SCROLL_DURATION_MS } from "./constants";

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const easeInOutCubic = (progress: number): number => {
  if (progress < 0.5) return 4 * progress * progress * progress;
  return 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

export const easeInOutSine = (progress: number): number =>
  -(Math.cos(Math.PI * progress) - 1) / 2;

export const isRectOutsideViewport = (
  rect: Pick<DOMRect, "top" | "bottom">,
  viewportHeight: number,
): boolean => rect.top < 0 || rect.bottom > viewportHeight;

export const computeCenteredScrollTop = (
  currentScrollY: number,
  rectTop: number,
  rectHeight: number,
  viewportHeight: number,
  maxScrollTop: number,
): number => {
  const desired =
    currentScrollY + rectTop - (viewportHeight / 2 - rectHeight / 2);
  return clamp(desired, 0, Math.max(0, maxScrollTop));
};

export const animateWindowScrollTo = async (
  targetY: number,
  durationMs: number = SCROLL_DURATION_MS,
): Promise<void> => {
  if (typeof window === "undefined") return;

  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 1) return;

  await new Promise<void>((resolve) => {
    const raf =
      window.requestAnimationFrame ||
      ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = clamp(elapsed / durationMs, 0, 1);
      const eased = easeInOutSine(progress);
      window.scrollTo(0, startY + delta * eased);

      if (progress < 1) raf(step);
      else resolve();
    };

    raf(step);
  });
};
