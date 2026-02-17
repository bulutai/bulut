// Widget dimensions
export const BUTTON_SIZE = 60;
export const WINDOW_WIDTH = 350;
export const WINDOW_HEIGHT = 500;

// Positioning
export const POSITION_BOTTOM = 20;
export const POSITION_RIGHT = 20;

// Colors — initial values match the backend ProjectSettings default.
// applyTheme() in index.tsx overrides primary/primaryHover/messageUser
// with the remote config value before the widget renders.
export const COLORS = {
  primary: "#6C03C1",
  primaryHover: "#5b02a4",
  background: "#ffffff",
  text: "hsla(215, 100%, 5%, 1)",
  textSecondary: "hsla(215, 100%, 5%, 1)",
  border: "#e5e7eb",
  messageBot: "",
  messageUser: "#6C03C1",
  messageUserText: "#ffffff",
};

// Border radius
export const BORDER_RADIUS = {
  button: '50%',
  window: '17px',
  message: '10px'
};

// Shadows
export const SHADOW = "0 0 15px hsla(215, 100%, 5%, 0.15)";

// Transitions
export const TRANSITIONS = {
  fast: '150ms ease-in-out',
  medium: '250ms ease-in-out'
};
