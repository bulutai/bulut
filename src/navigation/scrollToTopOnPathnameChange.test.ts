import { describe, expect, it, vi } from "vitest";
import { installPathnameScrollToTop } from "./scrollToTopOnPathnameChange";

interface FakeWindow {
  location: { pathname: string };
  history: {
    pushState: History["pushState"];
    replaceState: History["replaceState"];
  };
  scrollTo: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, handler: () => void) => void;
  removeEventListener: (type: string, handler: () => void) => void;
}

const toPathname = (url?: string | URL | null): string => {
  if (!url) {
    return "/";
  }
  return new URL(String(url), "https://example.test").pathname;
};

const createFakeWindow = (): { fakeWindow: FakeWindow; firePopState: () => void } => {
  const listeners = new Map<string, Set<() => void>>();
  const location = { pathname: "/" };
  const scrollTo = vi.fn();

  const pushState: History["pushState"] = (_state, _unused, url) => {
    location.pathname = toPathname(url);
  };
  const replaceState: History["replaceState"] = (_state, _unused, url) => {
    location.pathname = toPathname(url);
  };

  const fakeWindow: FakeWindow = {
    location,
    history: {
      pushState,
      replaceState,
    },
    scrollTo,
    addEventListener: (type, handler) => {
      const current = listeners.get(type) || new Set<() => void>();
      current.add(handler);
      listeners.set(type, current);
    },
    removeEventListener: (type, handler) => {
      const current = listeners.get(type);
      current?.delete(handler);
    },
  };

  const firePopState = (): void => {
    const popHandlers = listeners.get("popstate");
    if (!popHandlers) {
      return;
    }
    for (const handler of popHandlers) {
      handler();
    }
  };

  return { fakeWindow, firePopState };
};

describe("installPathnameScrollToTop", () => {
  it("scrolls on pathname change via pushState", () => {
    const { fakeWindow } = createFakeWindow();
    const originalWindow = (globalThis as { window?: Window }).window;
    (globalThis as { window: Window }).window = fakeWindow as unknown as Window;

    const teardown = installPathnameScrollToTop();
    window.history.pushState({}, "", "/pricing");

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    teardown();
    (globalThis as { window?: Window }).window = originalWindow;
  });

  it("does not scroll on query/hash-only changes", () => {
    const { fakeWindow } = createFakeWindow();
    fakeWindow.location.pathname = "/about";
    const originalWindow = (globalThis as { window?: Window }).window;
    (globalThis as { window: Window }).window = fakeWindow as unknown as Window;

    const teardown = installPathnameScrollToTop();
    window.history.pushState({}, "", "/about?tab=voice#intro");
    window.history.replaceState({}, "", "/about?tab=ui");

    expect(window.scrollTo).not.toHaveBeenCalled();

    teardown();
    (globalThis as { window?: Window }).window = originalWindow;
  });

  it("scrolls on popstate when pathname changes", () => {
    const { fakeWindow, firePopState } = createFakeWindow();
    fakeWindow.location.pathname = "/";
    const originalWindow = (globalThis as { window?: Window }).window;
    (globalThis as { window: Window }).window = fakeWindow as unknown as Window;

    const teardown = installPathnameScrollToTop();
    fakeWindow.location.pathname = "/about";
    firePopState();

    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    teardown();
    (globalThis as { window?: Window }).window = originalWindow;
  });

  it("restores history wrappers and removes listener on teardown", () => {
    const { fakeWindow, firePopState } = createFakeWindow();
    const originalWindow = (globalThis as { window?: Window }).window;
    (globalThis as { window: Window }).window = fakeWindow as unknown as Window;

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const teardown = installPathnameScrollToTop();

    expect(window.history.pushState).not.toBe(originalPushState);
    expect(window.history.replaceState).not.toBe(originalReplaceState);

    teardown();

    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);

    fakeWindow.location.pathname = "/pricing";
    firePopState();
    expect(window.scrollTo).not.toHaveBeenCalled();

    (globalThis as { window?: Window }).window = originalWindow;
  });
});
