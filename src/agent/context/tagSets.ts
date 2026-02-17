/** Tags that never produce useful content or interactables. */
export const NON_CONTENT_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "link",
  "meta",
]);

/** SVG drawing primitives — never useful as standalone interactables. */
export const SVG_INTERNAL_TAGS = new Set([
  "path",
  "circle",
  "line",
  "rect",
  "polygon",
  "polyline",
  "ellipse",
  "g",
  "use",
  "defs",
  "clippath",
  "mask",
  "symbol",
  "lineargradient",
  "radialgradient",
  "stop",
  "text",
  "tspan",
]);

export const NATIVE_INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  "details",
  "option",
]);

export const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "tab",
  "menuitem",
  "option",
  "checkbox",
  "radio",
  "switch",
  "combobox",
  "textbox",
  "searchbox",
  "slider",
  "spinbutton",
  "treeitem",
]);
