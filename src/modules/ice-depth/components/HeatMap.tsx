"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  RINK_VIEWBOX_H,
  RINK_VIEWBOX_W,
} from "@/modules/ice-depth/components/RinkSurface";
import type { Point } from "@/modules/ice-depth/schema";

/**
 * Heat map overlay for the rink. Renders a coarse-grid inverse-
 * distance-weighted (IDW) interpolation of measurement values onto
 * a canvas, then displays it in an SVG <foreignObject> sized to the
 * rink viewport so it stacks cleanly under the numbered markers.
 *
 * Color ramp: green (cold/thin) → yellow → red (hot/thick). Cells
 * outside the rounded-corner ice surface are clipped to transparent.
 *
 * IDW is overkill for 60 points but cheap (the grid is small) and
 * gives a smooth gradient without pulling in d3 or any other dep.
 */

interface HeatMapProps {
  points: readonly Point[];
  measurements: Record<string, number | undefined>;
}

const GRID_W = 200;
const GRID_H = 85;
// Power for the IDW falloff. 2 = inverse-square; higher = more
// localized blobs around each point.
const IDW_POWER = 2;

export function HeatMap({ points, measurements }: HeatMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Anchor points: the subset of template points that have a
  // measurement. Memoized so the effect dependency list is stable
  // when nothing relevant changed.
  const anchors = useMemo(() => {
    const out: { x: number; y: number; v: number }[] = [];
    for (const p of points) {
      const v = measurements[String(p.n)];
      if (typeof v === "number" && Number.isFinite(v)) {
        out.push({ x: p.x, y: p.y, v });
      }
    }
    return out;
  }, [points, measurements]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = GRID_W;
    canvas.height = GRID_H;
    ctx.clearRect(0, 0, GRID_W, GRID_H);

    if (anchors.length === 0) return;

    let min = Infinity;
    let max = -Infinity;
    for (const a of anchors) {
      if (a.v < min) min = a.v;
      if (a.v > max) max = a.v;
    }
    const span = max - min || 1;

    const image = ctx.createImageData(GRID_W, GRID_H);
    const data = image.data;

    // Rink rounded-corner test (28 ft radius = 14% of width, ≈ 33%
    // of height). We work in viewBox-normalized units so a 1:1
    // distance check matches the SVG. nx ∈ [0, 1] horizontally and
    // we scale ny back into the same x units via the aspect ratio.
    const aspect = GRID_H / GRID_W;
    const cornerRx = 0.14; // 28/200
    const cornerRy = cornerRx; // same physical distance, scaled below

    function inRink(nx: number, ny: number): boolean {
      const yScaled = ny * aspect; // now in same units as nx (0..aspect)
      // The four corner anchor points (centers of the rounding arcs).
      const corners: ReadonlyArray<{ cx: number; cy: number }> = [
        { cx: cornerRx, cy: cornerRy },
        { cx: 1 - cornerRx, cy: cornerRy },
        { cx: cornerRx, cy: aspect - cornerRy },
        { cx: 1 - cornerRx, cy: aspect - cornerRy },
      ];
      for (const c of corners) {
        const inCornerBox =
          ((c.cx === cornerRx && nx < c.cx) ||
            (c.cx === 1 - cornerRx && nx > c.cx)) &&
          ((c.cy === cornerRy && yScaled < c.cy) ||
            (c.cy === aspect - cornerRy && yScaled > c.cy));
        if (inCornerBox) {
          const dx = nx - c.cx;
          const dy = yScaled - c.cy;
          if (dx * dx + dy * dy > cornerRx * cornerRx) {
            return false;
          }
        }
      }
      return true;
    }

    for (let py = 0; py < GRID_H; py++) {
      for (let px = 0; px < GRID_W; px++) {
        const nx = px / GRID_W;
        const ny = py / GRID_H;

        if (!inRink(nx, ny)) {
          // Leave fully transparent
          continue;
        }

        // IDW: weighted average of all anchors.
        let num = 0;
        let den = 0;
        for (const a of anchors) {
          const dx = (a.x - nx) * 4;
          const dy = (a.y - ny) * 4 * (1 / aspect);
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.00001) {
            // We're right on top of an anchor — short-circuit.
            num = a.v;
            den = 1;
            break;
          }
          const w = 1 / Math.pow(d2, IDW_POWER / 2);
          num += a.v * w;
          den += w;
        }
        const value = num / den;
        const t = (value - min) / span; // 0..1

        const [r, g, b] = colorRamp(t);
        const idx = (py * GRID_W + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 170; // alpha
      }
    }

    ctx.putImageData(image, 0, 0);
  }, [anchors]);

  return (
    <foreignObject
      x={0}
      y={0}
      width={RINK_VIEWBOX_W}
      height={RINK_VIEWBOX_H}
      style={{ pointerEvents: "none" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
        }}
      />
    </foreignObject>
  );
}

/**
 * Linear gradient from green (t=0) to yellow (t=0.5) to red (t=1).
 */
function colorRamp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.5) {
    const u = x / 0.5;
    // green → yellow
    return [Math.round(77 + (255 - 77) * u), Math.round(255 - (255 - 184) * u), 0];
  }
  const u = (x - 0.5) / 0.5;
  // yellow → red
  return [255, Math.round(184 - 184 * u), 0];
}
