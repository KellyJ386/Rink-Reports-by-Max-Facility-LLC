"use client";

import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

export interface BarChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  data: BarChartDataPoint[];
  title: string;
  unit?: string;
  height?: number;
}

const DEFAULT_COLOR = "#003B6F";

export function BarChart({ data, title, unit, height = 300 }: BarChartProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-[#003B6F]">{title}</h3>
      {data.length === 0 ? (
        <div
          className="flex items-center justify-center rounded border border-dashed border-[#A5ACAF] text-sm text-[#A5ACAF]"
          style={{ height }}
        >
          No data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <RechartsBarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
          >
            <YAxis
              dataKey="label"
              type="category"
              width={120}
              tick={{ fontSize: 11, fill: "#A5ACAF" }}
              tickLine={false}
              axisLine={false}
            />
            <XAxis
              type="number"
              unit={unit}
              tick={{ fontSize: 11, fill: "#A5ACAF" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#001122",
                border: "1px solid #003B6F",
                borderRadius: 4,
                fontSize: 12,
              }}
              labelStyle={{ color: "#A5ACAF" }}
              itemStyle={{ color: "#fff" }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color ?? DEFAULT_COLOR}
                />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
