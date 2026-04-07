"use client";

import type { ReactNode } from "react";

/**
 * Standard NHL ice surface SVG (200ft × 85ft, ratio 200:85). Drawn
 * once and reused by both the staff form (interactive markers) and
 * the admin point-placement editor (click to add a point).
 *
 * The viewBox is 1000 × 425 — every 5 ft = 25 SVG units, so the
 * proportions are correct without ever needing real foot/meter math.
 *
 * Children are rendered ABOVE the rink art so callers can drop in
 * point markers, heat-map overlays, etc.
 *
 * The whole thing is a styled SVG with no external assets and no
 * runtime dependencies — works offline.
 */

export const RINK_VIEWBOX_W = 1000;
export const RINK_VIEWBOX_H = 425;

interface RinkSurfaceProps {
  children?: ReactNode;
  /** Click handler with normalized (x, y) in [0, 1]. */
  onSurfaceClick?: (x: number, y: number) => void;
  /** Optional ARIA label. */
  ariaLabel?: string;
  /** When true, render with print-friendly colors (white bg, dark lines). */
  printMode?: boolean;
  /** Optional className for outer wrapper. */
  className?: string;
}

export function RinkSurface({
  children,
  onSurfaceClick,
  ariaLabel = "Ice rink diagram",
  printMode = false,
  className,
}: RinkSurfaceProps) {
  // Stroke + fill tokens swap based on print mode so the print
  // stylesheet gets a clean black-on-white rendering.
  const stroke = printMode ? "#1a1a1a" : "#A5ACAF";
  const blue = printMode ? "#3b6fcc" : "#4D7BD1";
  const red = printMode ? "#cc2f2f" : "#F42A2A";
  const goalCrease = printMode ? "#bcdcff" : "#1f3554";
  const surfaceFill = printMode ? "#ffffff" : "#0a1a2e";

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onSurfaceClick) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onSurfaceClick(
      Math.min(1, Math.max(0, x)),
      Math.min(1, Math.max(0, y)),
    );
  }

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${RINK_VIEWBOX_W} ${RINK_VIEWBOX_H}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={onSurfaceClick ? handleClick : undefined}
      className={className}
      style={{ width: "100%", height: "auto", cursor: onSurfaceClick ? "crosshair" : "default" }}
    >
      {/* Surface (rounded corners — 28ft radius = 140 SVG units) */}
      <rect
        x={0}
        y={0}
        width={RINK_VIEWBOX_W}
        height={RINK_VIEWBOX_H}
        rx={140}
        ry={140}
        fill={surfaceFill}
        stroke={stroke}
        strokeWidth={3}
      />

      {/* Goal lines — 11ft from the end boards */}
      <line
        x1={55}
        y1={28}
        x2={55}
        y2={RINK_VIEWBOX_H - 28}
        stroke={red}
        strokeWidth={2}
      />
      <line
        x1={RINK_VIEWBOX_W - 55}
        y1={28}
        x2={RINK_VIEWBOX_W - 55}
        y2={RINK_VIEWBOX_H - 28}
        stroke={red}
        strokeWidth={2}
      />

      {/* Blue lines — 25ft from goal lines */}
      <line
        x1={350}
        y1={0}
        x2={350}
        y2={RINK_VIEWBOX_H}
        stroke={blue}
        strokeWidth={6}
      />
      <line
        x1={RINK_VIEWBOX_W - 350}
        y1={0}
        x2={RINK_VIEWBOX_W - 350}
        y2={RINK_VIEWBOX_H}
        stroke={blue}
        strokeWidth={6}
      />

      {/* Center red line */}
      <line
        x1={RINK_VIEWBOX_W / 2}
        y1={0}
        x2={RINK_VIEWBOX_W / 2}
        y2={RINK_VIEWBOX_H}
        stroke={red}
        strokeWidth={6}
      />

      {/* Center face-off circle (15ft radius = 75) */}
      <circle
        cx={RINK_VIEWBOX_W / 2}
        cy={RINK_VIEWBOX_H / 2}
        r={75}
        fill="none"
        stroke={blue}
        strokeWidth={2}
      />
      <circle
        cx={RINK_VIEWBOX_W / 2}
        cy={RINK_VIEWBOX_H / 2}
        r={5}
        fill={blue}
      />

      {/* Four end-zone face-off circles */}
      {[
        { cx: 175, cy: 105 },
        { cx: 175, cy: RINK_VIEWBOX_H - 105 },
        { cx: RINK_VIEWBOX_W - 175, cy: 105 },
        { cx: RINK_VIEWBOX_W - 175, cy: RINK_VIEWBOX_H - 105 },
      ].map((c, i) => (
        <g key={i}>
          <circle
            cx={c.cx}
            cy={c.cy}
            r={75}
            fill="none"
            stroke={red}
            strokeWidth={2}
          />
          <circle cx={c.cx} cy={c.cy} r={5} fill={red} />
        </g>
      ))}

      {/* Neutral-zone face-off dots (just dots, no circles) */}
      {[
        { cx: 405, cy: 105 },
        { cx: 405, cy: RINK_VIEWBOX_H - 105 },
        { cx: RINK_VIEWBOX_W - 405, cy: 105 },
        { cx: RINK_VIEWBOX_W - 405, cy: RINK_VIEWBOX_H - 105 },
      ].map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={4} fill={red} />
      ))}

      {/* Goal creases (semicircle 6ft radius = 30 SVG units, projecting toward center) */}
      <path
        d={`M 55 ${RINK_VIEWBOX_H / 2 - 30} A 30 30 0 0 1 55 ${RINK_VIEWBOX_H / 2 + 30}`}
        fill={goalCrease}
        stroke={red}
        strokeWidth={1}
      />
      <path
        d={`M ${RINK_VIEWBOX_W - 55} ${RINK_VIEWBOX_H / 2 - 30} A 30 30 0 0 0 ${RINK_VIEWBOX_W - 55} ${RINK_VIEWBOX_H / 2 + 30}`}
        fill={goalCrease}
        stroke={red}
        strokeWidth={1}
      />

      {/* Goal mouths (small rect on the goal line) */}
      <rect
        x={50}
        y={RINK_VIEWBOX_H / 2 - 15}
        width={5}
        height={30}
        fill="none"
        stroke={red}
        strokeWidth={2}
      />
      <rect
        x={RINK_VIEWBOX_W - 55}
        y={RINK_VIEWBOX_H / 2 - 15}
        width={5}
        height={30}
        fill="none"
        stroke={red}
        strokeWidth={2}
      />

      {/* Children layer (markers, heat map overlay, etc.) */}
      {children}
    </svg>
  );
}
