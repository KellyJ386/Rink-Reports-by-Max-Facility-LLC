/**
 * Stub for `recharts` in the test environment.
 *
 * recharts is added to package.json but is not installed yet — the orchestrator
 * runs `npm install` after merging all phase-c branches. Until then, tests that
 * render chart components must resolve this module through the vitest alias in
 * vitest.config.ts so the Vite import-analysis plugin does not fail.
 *
 * Each export is the minimal stub needed by the chart components:
 *   - Container / wrapper components render their `children` inside a <div>.
 *   - Leaf components (Line, Bar, XAxis, YAxis, Tooltip, Legend, Cell) return null.
 */

import React from "react";

type AnyProps = { children?: React.ReactNode; [k: string]: unknown };

const passthrough =
  (testId?: string) =>
  ({ children, ...rest }: AnyProps) =>
    React.createElement("div", { "data-testid": testId, ...rest }, children);

export const ResponsiveContainer = passthrough("recharts-responsive-container");
export const LineChart = passthrough("recharts-line-chart");
export const BarChart = passthrough("recharts-bar-chart");
export const Line = ({ dataKey }: { dataKey?: string }) =>
  React.createElement("div", {
    "data-testid": `recharts-line-${dataKey ?? "unknown"}`,
  });
export const Bar = () => null;
export const XAxis = () => null;
export const YAxis = () => null;
export const Tooltip = () => null;
export const Legend = () => null;
export const Cell = () => null;
