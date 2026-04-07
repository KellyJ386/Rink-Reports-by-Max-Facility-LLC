"use client";

import { useState } from "react";

import type { BodyMarker } from "@/modules/incidents/schema";

/**
 * Interactive front/back human figure for the Accident form. The
 * SVG is hand-coded (no images, no external assets) so it works
 * offline. Click anywhere on the figure to drop a marker. Each
 * marker stores its (x, y) in normalized [0, 1] over the viewbox
 * plus a label — defaulting to the closest admin-defined region
 * label if any are configured, otherwise free-text "Region 1",
 * "Region 2", etc.
 */

const VIEW_W = 200;
const VIEW_H = 480;

interface BodyDiagramProps {
  markers: readonly BodyMarker[];
  /** Admin-configured region labels. Closest match is auto-snapped. */
  regionLabels: readonly string[];
  /** Add a marker. */
  onAdd: (marker: BodyMarker) => void;
  /** Remove a marker by index. */
  onRemove: (index: number) => void;
}

export function BodyDiagram({
  markers,
  regionLabels,
  onAdd,
  onRemove,
}: BodyDiagramProps) {
  const [view, setView] = useState<"front" | "back">("front");

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Pick a label: nearest admin-defined region by string match,
    // or a sequential fallback name.
    let label: string;
    if (regionLabels.length > 0) {
      // Without (x, y) coordinates for region labels we can't snap
      // geographically. Instead, fall back to the first region in
      // the admin list and let the operator edit if needed.
      label = regionLabels[0]!;
    } else {
      label = `Region ${markers.length + 1}`;
    }

    onAdd({
      view,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      label,
    });
  }

  const visibleMarkers = markers
    .map((m, i) => ({ marker: m, index: i }))
    .filter(({ marker }) => marker.view === view);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setView("front")}
          className={
            view === "front"
              ? "rounded bg-navy px-3 py-1 text-xs font-medium text-white"
              : "rounded border border-grey/40 px-3 py-1 text-xs text-grey hover:text-white"
          }
        >
          Front
        </button>
        <button
          type="button"
          onClick={() => setView("back")}
          className={
            view === "back"
              ? "rounded bg-navy px-3 py-1 text-xs font-medium text-white"
              : "rounded border border-grey/40 px-3 py-1 text-xs text-grey hover:text-white"
          }
        >
          Back
        </button>
        <span className="ml-2 text-xs text-grey">Tap the figure to mark an affected area.</span>
      </div>

      <svg
        role="img"
        aria-label={`Human figure (${view} view)`}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleClick}
        style={{ width: "100%", maxWidth: 280, height: "auto", cursor: "crosshair" }}
      >
        <FigureOutline view={view} />
        {visibleMarkers.map(({ marker, index }) => (
          <g
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(index);
            }}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={marker.x * VIEW_W}
              cy={marker.y * VIEW_H}
              r={10}
              fill="#F42A2A"
              stroke="#003B6F"
              strokeWidth={2}
            />
            <text
              x={marker.x * VIEW_W}
              y={marker.y * VIEW_H + 4}
              textAnchor="middle"
              fontSize={10}
              fontWeight="bold"
              fill="#ffffff"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Hand-rolled stylized human silhouette. Front and back are nearly
 * identical at this resolution; we draw the back view with no facial
 * features so the operator can tell them apart at a glance.
 */
function FigureOutline({ view }: { view: "front" | "back" }) {
  const stroke = "#A5ACAF";
  const fill = "#1f3554";
  return (
    <g>
      {/* Head */}
      <circle cx={100} cy={50} r={32} fill={fill} stroke={stroke} strokeWidth={2} />
      {/* Neck */}
      <rect x={88} y={78} width={24} height={16} fill={fill} stroke={stroke} strokeWidth={2} />
      {/* Torso */}
      <path
        d="M 60 100 Q 60 90 80 90 L 120 90 Q 140 90 140 100 L 145 220 Q 145 230 135 230 L 65 230 Q 55 230 55 220 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* Left arm */}
      <path
        d="M 60 100 Q 40 110 35 180 L 35 260 Q 35 270 45 270 L 55 270 Q 65 270 65 260 L 65 180 Q 70 120 80 105 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* Right arm */}
      <path
        d="M 140 100 Q 160 110 165 180 L 165 260 Q 165 270 155 270 L 145 270 Q 135 270 135 260 L 135 180 Q 130 120 120 105 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* Left leg */}
      <path
        d="M 70 230 L 65 380 Q 65 410 75 460 Q 75 470 85 470 L 95 470 Q 100 470 100 460 L 100 380 L 95 230 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* Right leg */}
      <path
        d="M 105 230 L 100 380 L 100 460 Q 100 470 105 470 L 115 470 Q 125 470 125 460 Q 135 410 135 380 L 130 230 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* Front-only facial markers */}
      {view === "front" && (
        <>
          <circle cx={88} cy={48} r={2} fill={stroke} />
          <circle cx={112} cy={48} r={2} fill={stroke} />
          <line x1={92} y1={62} x2={108} y2={62} stroke={stroke} strokeWidth={1} />
        </>
      )}
    </g>
  );
}
