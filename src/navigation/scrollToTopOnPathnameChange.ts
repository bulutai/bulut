export const installPathnameScrollToTop = (): (() => void) => {
  let lastPathname = window.location.pathname;

  const scrollIfPathChanged = (): void => {
    const nextPathname = window.location.pathname;
    if (nextPathname === lastPathname) {
      return;
    }
    lastPathname = nextPathname;
    window.scrollTo(0, 0);
  };

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  const wrappedPushState: History["pushState"] = function (
    this: History,
    ...args
  ) {
    const result = originalPushState.apply(this, args);
    scrollIfPathChanged();
    return result;
  };

  const wrappedReplaceState: History["replaceState"] = function (
    this: History,
    ...args
  ) {
    const result = originalReplaceState.apply(this, args);
    scrollIfPathChanged();
    return result;
  };

  window.history.pushState = wrappedPushState;
  window.history.replaceState = wrappedReplaceState;

  const onPopState = (): void => {
    scrollIfPathChanged();
  };
  window.addEventListener("popstate", onPopState);

  return () => {
    window.removeEventListener("popstate", onPopState);

    if (window.history.pushState === wrappedPushState) {
      window.history.pushState = originalPushState;
    }
    if (window.history.replaceState === wrappedReplaceState) {
      window.history.replaceState = originalReplaceState;
    }
  };
};
