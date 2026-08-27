"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AIChartData } from "@/src/types/ai";

function fmtNum(v: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(v);
}

// A small, distinct palette for the bars — orange leads (the app accent), slate
// follows, so a two-period comparison reads "this vs that" at a glance.
const BAR_COLORS = ["#ea580c", "#64748b", "#0ea5e9", "#16a34a", "#a855f7"];

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  // Bars/lines carry the category in `label`; a pie slice carries it on the
  // point instead, so fall back to that.
  const heading = label ?? payload[0]?.name ?? payload[0]?.payload?.name ?? "";
  return (
    <div className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {heading && <div className="font-medium text-gray-700 dark:text-gray-200">{heading}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="text-gray-500 dark:text-gray-400">
          {fmtNum(p.value)}{unit ? ` ${unit}` : ""}
        </div>
      ))}
    </div>
  );
}

// AIChart draws a general chart payload the backend computed (bar / line; pie
// lands here as it is added). The numbers come from Go — this only draws them —
// so the picture always matches the answer text.
export default function AIChart({ data }: { data: AIChartData; language?: "th" | "en" }) {
  if (!data || !data.categories?.length || !data.series?.length) return null;

  const kNum = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`);

  // One row per category; each series contributes a value column. A single-series
  // comparison or daily trend is one "value" column across the categories.
  const primary = data.series[0];
  const rows = data.categories.map((c, i) => ({ name: c, value: primary.values[i] ?? 0 }));
  const isLine = data.kind === "line";
  const isPie = data.kind === "pie";

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{data.title}</span>
        {data.unit && <span className="text-[11px] text-gray-400">{data.unit}</span>}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {isPie ? (
          <PieChart>
            <Tooltip content={<ChartTooltip unit={data.unit} />} />
            <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 11 }} />
            <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={64} isAnimationActive={false}>
              {rows.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : isLine ? (
          <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tickFormatter={kNum} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<ChartTooltip unit={data.unit} />} />
            <Line dataKey="value" stroke="#ea580c" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        ) : (
          <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tickFormatter={kNum} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip cursor={{ fill: "#f9731611" }} content={<ChartTooltip unit={data.unit} />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
