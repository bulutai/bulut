import { NATIVE_INTERACTIVE_TAGS, INTERACTIVE_ROLES } from "./tagSets";

export const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

export const canonicalUrl = (rawUrl: string): string => {
  try {
    return new URL(rawUrl, rawUrl).href;
  } catch {
    return rawUrl;
  }
};

export const parseTabIndex = (value: string | null): number | null => {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const getPrimaryRole = (element: Element): string => {
  const rawRole = normalizeWhitespace(element.getAttribute("role") || "")
    .toLowerCase()
    .split(" ")[0];
  return rawRole || "";
};

export const isVisible = (element: Element): boolean => {
  if (element.getAttribute("aria-hidden") === "true") return false;
  if (element instanceof HTMLElement && element.hidden) return false;

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

/**
 * Returns true if the element is nested inside an interactive parent
 * (e.g. a `<span>` or `<img>` inside a `<button>` or `<a>`).
 */
export const hasInteractiveAncestor = (element: Element): boolean => {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const parentTag = parent.tagName.toLowerCase();
    if (NATIVE_INTERACTIVE_TAGS.has(parentTag)) return true;
    const parentRole = getPrimaryRole(parent);
    if (INTERACTIVE_ROLES.has(parentRole)) return true;
    parent = parent.parentElement;
  }
  return false;
};

export const toAbsoluteUrl = (href: string): string => {
  try {
    return new URL(href, window.location.href).href;
  } catch {
    return href;
  }
};
