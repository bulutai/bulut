/**
 * Re-export barrel  all context functionality now lives in context/ sub-modules.
 * This file exists for backward compatibility so existing imports keep working.
 */
export type { PageContext, CachedPageContextEntry } from "./context/types";
export {
  PAGE_CONTEXT_CACHE_VERSION,
  PAGE_CONTEXT_CACHE_KEY,
  clearPageContextCache,
  getCachedPageContexts,
  invalidateCurrentPageContext,
} from "./context/cache";
export { getPageContext, getElementById, buildPageContextSummary } from "./context/getPageContext";
