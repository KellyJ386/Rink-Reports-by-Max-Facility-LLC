"use client";

export interface HeatmapPoint {
  pointIndex: number;
  avgDepth: number;
  deltaFromBaseline: number | null;
}

export interface HeatmapGridProps {
  points: HeatmapPoint[];
  gridCols: number;
  title: string;
}

/** Returns a background colour for a heatmap cell based on deltaFromBaseline. */
function cellColor(point: HeatmapPoint): string {
  const { avgDepth, deltaFromBaseline } = point;

  if (deltaFromBaseline === null) return "#A5ACAF"; // gray — no baseline data
  if (avgDepth === 0) return "#A5ACAF"; // guard against divide-by-zero

  const pct = deltaFromBaseline / avgDepth; // negative = thinner than baseline

  if (pct >= 0) return "#4DFF00"; // OK — at or above baseline
  if (pct >= -0.1) return "#FFB800"; // watch — up to 10% thinner
  return "#F42A2A"; // thin spot — more than 10% below baseline
}

export function HeatmapGrid({ points, gridCols, title }: HeatmapGridProps) {
  if (points.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-[#003B6F]">{title}</h3>
        <div className="flex h-32 items-center justify-center rounded border border-dashed border-[#A5ACAF] text-sm text-[#A5ACAF]">
          No data for this period
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[#003B6F]">{title}</h3>
      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          gap: "4px",
        }}
      >
        {points.map((point) => (
          <div
            key={point.pointIndex}
            title={`Point ${point.pointIndex}: avg ${point.avgDepth.toFixed(2)}, Δ ${point.deltaFromBaseline !== null ? point.deltaFromBaseline.toFixed(2) : "n/a"}`}
            style={{ backgroundColor: cellColor(point) }}
            className="flex h-8 items-center justify-center rounded text-[10px] font-semibold text-[#001122]"
          >
            {point.pointIndex}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-[#A5ACAF]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#A5ACAF" }} />
          No data
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#4DFF00" }} />
          OK
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#FFB800" }} />
          Watch
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: "#F42A2A" }} />
          Thin spot
        </span>
      </div>
    </div>
  );
}
