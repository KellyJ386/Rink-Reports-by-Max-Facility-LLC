"use client";

export interface CompletionRingProps {
  pct: number;
  label: string;
  size?: number;
}

/**
 * SVG-based circular progress ring.
 * Track colour: Navy Blue (#003B6F)
 * Fill colour: Action Green (#4DFF00)
 */
export function CompletionRing({ pct, label, size = 120 }: CompletionRingProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  const radius = (size - 12) / 2; // 6px stroke on each side
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} aria-label={`${label}: ${Math.round(clamped)}%`}>
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#003B6F"
          strokeWidth={8}
        />
        {/* Arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#4DFF00"
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Percentage label */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.22}
          fontWeight="bold"
          fill="#ffffff"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      <span className="text-xs text-[#A5ACAF]">{label}</span>
    </div>
  );
}
