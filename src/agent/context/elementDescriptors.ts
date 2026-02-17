import { normalizeWhitespace, getPrimaryRole } from "./helpers";

/** Get a human-readable label for an element. */
export const getElementLabel = (element: Element): string => {
  const text = normalizeWhitespace(
    (element instanceof HTMLElement ? element.innerText : element.textContent) || "",
  ).substring(0, 80);
  const ariaLabel = normalizeWhitespace(element.getAttribute("aria-label") || "");
  const title = normalizeWhitespace(element.getAttribute("title") || "");
  const placeholder = normalizeWhitespace(element.getAttribute("placeholder") || "");
  const name = normalizeWhitespace(element.getAttribute("name") || "");
  const value =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
      ? normalizeWhitespace(element.value || "")
      : "";

  const label = text || ariaLabel || title || placeholder || value || name || "";
  const tag = element.tagName.toLowerCase();

  if (tag === "img") {
    const alt = normalizeWhitespace(element.getAttribute("alt") || "");
    if (alt) return alt;
    const src = element.getAttribute("src") || "";
    const filename = src.split("/").pop()?.split("?")[0] || "";
    return filename ? `img: ${filename}` : compactOuterHtml(element);
  }

  if (tag === "svg") return ariaLabel || title || "icon";

  if (tag === "input") {
    const inputType = element.getAttribute("type") || "text";
    const currentValue = element instanceof HTMLInputElement ? element.value : "";
    const valueNote = currentValue ? ` val="${currentValue.substring(0, 40)}"` : "";
    return `${inputType} ${label || "input"}${valueNote}`;
  }

  if (tag === "textarea") {
    const currentValue = element instanceof HTMLTextAreaElement ? element.value : "";
    const valueNote = currentValue ? ` val="${currentValue.substring(0, 40)}"` : "";
    return `textarea ${label || "textarea"}${valueNote}`;
  }

  if (tag === "select") {
    const selectEl = element as HTMLSelectElement;
    const selectedText = selectEl.selectedOptions?.[0]?.textContent?.trim() || "";
    const valueNote = selectedText ? ` val="${selectedText}"` : "";
    return `select ${label || "select"}${valueNote}`;
  }

  if (label) return label;
  return compactOuterHtml(element);
};

/** Return a trimmed, single-line outerHTML (opening tag + short text), max 90 chars. */
const compactOuterHtml = (element: Element): string => {
  const html = element.outerHTML || "";
  const closeIdx = html.indexOf(">");
  if (closeIdx === -1) return html.substring(0, 90);
  const snippet = html.substring(0, Math.min(closeIdx + 30, 90)).replace(/\s+/g, " ").trim();
  return snippet || "untitled";
};

/** Classify the element into a semantic type string. */
export const describeElementType = (element: Element): string => {
  const tag = element.tagName.toLowerCase();
  const role = getPrimaryRole(element);

  if (role === "button" || tag === "button") return "Button";
  if (role === "link" || tag === "a") return "Link";
  if (role === "tab") return "Tab";
  if (role === "menuitem") return "MenuItem";
  if (role === "checkbox" || (tag === "input" && element.getAttribute("type") === "checkbox")) return "Checkbox";
  if (role === "radio" || (tag === "input" && element.getAttribute("type") === "radio")) return "Radio";
  if (role === "switch") return "Switch";
  if (role === "combobox" || tag === "select") return "Select";
  if (role === "textbox" || tag === "textarea") return "TextArea";
  if (role === "searchbox") return "SearchBox";
  if (role === "slider" || (tag === "input" && element.getAttribute("type") === "range")) return "Slider";
  if (role === "spinbutton") return "SpinButton";
  if (role === "option" || tag === "option") return "Option";
  if (role === "treeitem") return "TreeItem";
  if (tag === "input") {
    const t = element.getAttribute("type") || "text";
    return `Input[${t}]`;
  }
  if (tag === "summary") return "Summary";
  if (tag === "details") return "Details";
  if (element.getAttribute("contenteditable") === "true") return "Editable";

  return role ? `${role[0].toUpperCase()}${role.slice(1)}` : `<${tag}>`;
};

/** Collect ARIA / state attributes into a list of human-readable tokens. */
export const getElementState = (element: Element): string[] => {
  const states: string[] = [];

  const pressed = element.getAttribute("aria-pressed");
  if (pressed === "true") states.push("Pressed");
  else if (pressed === "false") states.push("Not pressed");

  const expanded = element.getAttribute("aria-expanded");
  if (expanded === "true") states.push("Expanded");
  else if (expanded === "false") states.push("Collapsed");

  const selected = element.getAttribute("aria-selected");
  if (selected === "true") states.push("Selected");

  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") {
      states.push(element.checked ? "Checked" : "Unchecked");
    }
  }

  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") {
    states.push("Disabled");
  }

  return states;
};
