export interface PageContext {
  links: string[];
  interactables: string[];
  summary: string;
  elementMap: Map<number, Element>;
}

export interface CachedPageContextEntry {
  url: string;
  summary: string;
  links: string[];
  interactables: string[];
  capturedAt: number;
  version: number;
}

export interface InteractableCandidate {
  id: number;
  line: string;
  score: number;
  order: number;
  element: Element;
}

export interface SemanticScanResult {
  links: string[];
  interactables: string[];
  elementMap: Map<number, Element>;
}
