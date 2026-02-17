/**
 * Re-export barrel -- tools functionality now lives in tools/ sub-modules.
 * This file exists for backward compatibility.
 */
export { CURSOR_MOVE_DURATION_MS, SCROLL_DURATION_MS } from "./tools/constants";
export type {
  AgentToolCall,
  ParsedAgentResponse,
  ToolCallWithId,
  ToolCallResult,
  PendingAgentResume,
} from "./tools/types";
export {
  savePendingAgentResume,
  getPendingAgentResume,
  clearPendingAgentResume,
} from "./tools/resume";
export { parseAgentResponse } from "./tools/parser";
export {
  clamp,
  easeInOutCubic,
  easeInOutSine,
  isRectOutsideViewport,
  computeCenteredScrollTop,
  animateWindowScrollTo,
} from "./tools/animation";
export { hideAgentCursor } from "./tools/cursor";
export { executeToolCalls, executeSingleToolCall } from "./tools/executors";
