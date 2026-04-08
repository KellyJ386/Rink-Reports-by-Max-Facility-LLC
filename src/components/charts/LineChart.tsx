"use client";

import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

export interface LineChartLine {
  key: string;
  label: string;
  color: string;
}

export interface LineChartProps {
  data: { date: string; [key: string]: number | string | null }[];
  lines: LineChartLine[];
  title: string;
  unit?: string;
  height?: number;
}

export function LineChart({ data, lines, title, unit, height = 300 }: LineChartProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-[#003B6F]">{title}</h3>
      {data.length === 0 ? (
        <div
          className="flex items-center justify-center rounded border border-dashed border-[#A5ACAF] text-[#A5ACAF] text-sm"
          style={{ height }}
        >
          No data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <RechartsLineChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          >
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#A5ACAF" }}
              tickLine={false}
            />
            <YAxis
              unit={unit}
              tick={{ fontSize: 11, fill: "#A5ACAF" }}
              tickLine={false}
              axisLine={false}
              width={50}
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
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
