import { closeIconUrl, microphoneIconUrl, restartIconUrl, logoUrl } from "../assets";

export default function renderSvgIcon(
  svgString: string,
  color: string,
  strokeWidth: number,
): string {
  return svgString.replace(/fill="none"/g, `fill="${color}"`).replace(/stroke-width="2"/g, `stroke-width="${strokeWidth}"`).replace(/stroke="none"/g, `stroke="${color}"`);
}

export function renderCloseIcon(color: string): string {
  return renderSvgIcon(closeIconUrl, color, 2);
}

export function renderMicrophoneIcon(color: string): string {
  return renderSvgIcon(microphoneIconUrl, color, 2);
}

export function renderRestartIcon(color: string): string {
  return renderSvgIcon(restartIconUrl, color, 2);
}

export function renderBulutLogo(): string {
  return logoUrl;
}

