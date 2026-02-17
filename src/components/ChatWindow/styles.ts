import type { JSX } from "preact";
import {
  WINDOW_WIDTH,
  WINDOW_HEIGHT,
  POSITION_BOTTOM,
  POSITION_RIGHT,
  COLORS,
  TRANSITIONS,
  BORDER_RADIUS,
  SHADOW,
} from "../../styles/constants";

export const windowStyle = (hidden: boolean, accessibilityMode: boolean): { [key: string]: string } => ({
  position: "fixed",
  bottom: `${POSITION_BOTTOM}px`,
  right: `${POSITION_RIGHT}px`,
  width: `${WINDOW_WIDTH}px`,
  maxHeight: `${WINDOW_HEIGHT}px`,
  backgroundColor: "hsla(0, 0%, 100%, 1)",
  borderRadius: BORDER_RADIUS.window,
  display: hidden ? "none" : "flex",
  flexDirection: "column",
  overflow: "hidden",
  zIndex: "10000",
  animation: hidden ? "none" : `slideIn ${TRANSITIONS.medium}`,
  boxShadow: accessibilityMode
    ? `inset 0 0 0 2px ${COLORS.primary}, ${SHADOW}`
    : SHADOW,
  fontFamily: '"Geist", sans-serif',
});

export const headerStyle: { [key: string]: string } = {
  padding: "14px 16px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export const headerActionsStyle: { [key: string]: string } = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

export const headerButtonStyle: { [key: string]: string } = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px",
  borderRadius: "6px",
  color: COLORS.text,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: `color ${TRANSITIONS.fast}, background-color ${TRANSITIONS.fast}`,
};

export const messagesContainerStyle: { [key: string]: string } = {
  padding: "0px 16px",
  overflowY: "auto",
  flex: "1",
  minHeight: "0",
};

export const messagesListStyle: { [key: string]: string } = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

export const messageStyle = (isUser: boolean): JSX.CSSProperties => ({
  maxWidth: "84%",
  padding: isUser ? "9px 14px" : "0px 0px",
  borderRadius: BORDER_RADIUS.message,
  fontSize: "14px",
  lineHeight: "140%",
  wordWrap: "break-word",
  whiteSpace: "pre-wrap",
  alignSelf: isUser ? "flex-end" : "flex-start",
  backgroundColor: isUser ? COLORS.messageUser : "",
  color: isUser ? COLORS.messageUserText : "hsla(215, 100%, 5%, 1)",
});

export const footerStyle: { [key: string]: string } = {
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

export const statusPanelStyle: { [key: string]: string } = {
  flex: "1",
  minHeight: "34px",
  borderRadius: "10px",
  color: COLORS.text,
  fontSize: "14px",
  display: "flex",
  alignItems: "center",
  padding: "0 10px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  opacity: "0.7",
};

export const footerActionsStyle: { [key: string]: string } = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexShrink: "0",
};

export const recordingTimerStyle: { [key: string]: string } = {
  minWidth: "46px",
  fontSize: "12px",
  fontWeight: "700",
  color: COLORS.text,
  textAlign: "right",
};

export const micFooterButtonStyle: { [key: string]: string } = {
  width: "37px",
  height: "37px",
  borderRadius: "999px",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "#ffffff",
  border: "1px solid hsla(215, 100%, 5%, 0.5)",
  transition: `transform ${TRANSITIONS.fast}`,
};

export const getChatWindowCss = (): string => `
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bulut-header-btn:hover:not(:disabled) {
    color: ${COLORS.text};
  }

  .bulut-footer-btn:hover:not(:disabled) {
    transform: scale(1.04);
  }

  .bulut-header-btn:disabled,
  .bulut-footer-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
    transform: none;
  }

  @keyframes bulut-dots {
    0%   { content: '.'; }
    33%  { content: '..'; }
    66%  { content: '...'; }
  }

  .bulut-status-dots::after {
    content: '.';
    animation: bulut-dots 1.2s steps(1) infinite;
    display: inline-block;
    min-width: 12px;
    text-align: left;
  }

  /* Mobile: full-screen chat window */
  @media (max-width: 600px) {
    .bulut-chat-window {
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      max-height: 100% !important;
      height: 100% !important;
      border-radius: 0 !important;
    }
    .bulut-close-btn {
      width: 40px !important;
      height: 40px !important;
      padding: 8px !important;
    }
    .bulut-close-btn svg {
      width: 26px !important;
      height: 26px !important;
    }
  }
`;
