/**
 * Tests for the LineChart chart component.
 *
 * recharts is stubbed via the vitest.config.ts alias (src/test/stubs/recharts.tsx)
 * because the package is not installed until the orchestrator merges all phase-c
 * branches and runs `npm install`. The stub lets us test the component shell
 * (empty state, title rendering, line key mapping) without a real recharts install.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { LineChart } from "@/components/charts/LineChart";

const SAMPLE_DATA = [
  { date: "2026-04-01", avgCo: 10, avgNo2: 5 },
  { date: "2026-04-02", avgCo: 12, avgNo2: 6 },
];

const SAMPLE_LINES = [
  { key: "avgCo", label: "CO (ppm)", color: "#3B82F6" },
  { key: "avgNo2", label: "NO\u2082 (ppm)", color: "#F59E0B" },
];

describe("LineChart", () => {
  it("renders the chart container when data is non-empty", () => {
    render(<LineChart data={SAMPLE_DATA} lines={SAMPLE_LINES} title="Air Quality" />);
    // Empty-state text must NOT be present
    expect(screen.queryByText("No data for this period")).toBeNull();
    // The recharts responsive container stub renders a div with data-testid
    expect(screen.getByTestId("recharts-responsive-container")).toBeDefined();
  });

  it('renders "No data for this period" when data is empty', () => {
    render(<LineChart data={[]} lines={SAMPLE_LINES} title="Air Quality" />);
    expect(screen.getByText("No data for this period")).toBeDefined();
  });

  it("renders the title", () => {
    render(<LineChart data={SAMPLE_DATA} lines={SAMPLE_LINES} title="My Chart" />);
    expect(screen.getByText("My Chart")).toBeDefined();
  });

  it("renders one recharts Line stub per entry in the lines prop", () => {
    render(<LineChart data={SAMPLE_DATA} lines={SAMPLE_LINES} title="Air Quality" />);
    // The stub renders a div with data-testid="recharts-line-<key>" per Line
    expect(screen.getByTestId("recharts-line-avgCo")).toBeDefined();
    expect(screen.getByTestId("recharts-line-avgNo2")).toBeDefined();
  });
});
