type InteractAction = "move" | "click" | "type" | "submit";

export interface InteractToolCall {
  tool: "interact";
  action: InteractAction;
  id?: number;
  selector?: string;
  text?: string;
  x?: number;
  y?: number;
}

export interface NavigateToolCall {
  tool: "navigate";
  url: string;
}

export interface GetPageContextToolCall {
  tool: "getPageContext";
}

export interface ScrollToolCall {
  tool: "scroll";
  id?: number;
  selector?: string;
}

export type AgentToolCall =
  | InteractToolCall
  | NavigateToolCall
  | GetPageContextToolCall
  | ScrollToolCall;

export interface ParsedAgentResponse {
  reply: string;
  toolCalls: AgentToolCall[];
}

export type ToolCallWithId = AgentToolCall & {
  call_id: string;
};

export interface ToolCallResult {
  call_id: string;
  result: string;
}

export interface PendingAgentResume {
  sessionId: string;
  projectId: string;
  model: string;
  voice: string;
  accessibilityMode: boolean;
  pendingToolCalls: Array<{
    call_id: string;
    tool: string;
    args: Record<string, unknown>;
  }>;
  completedResults: Array<{ call_id: string; result: string }>;
  accumulatedDelta?: string;
  savedAt: number;
}

interface ResolvedTarget {
  element?: HTMLElement;
  x: number;
  y: number;
}

export type { InteractAction, ResolvedTarget };
