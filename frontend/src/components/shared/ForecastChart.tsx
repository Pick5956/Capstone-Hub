"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AIForecastResult } from "@/src/types/ai";

function fmtBaht(v: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(v);
}

// ForecastTooltip formats the hovered point: actuals show one figure, forecasts
// show the prediction plus its range — the range being the honest "how sure" cue.
type ForecastRow = {
  date?: string;
  actual?: number;
  predicted?: number;
  band?: number[];
};

// Recharts hands the content element active/payload/label at hover time, so
// those stay optional; `t` is the caller-supplied label set.
type ForecastTooltipProps = {
  active?: boolean;
  payload?: { payload?: ForecastRow }[];
  label?: string | number;
  t: { actual: string; predicted: string; range: string };
};

function ForecastTooltip({ active, payload, label, t }: ForecastTooltipProps) {
  if (!active || !payload?.length) return null;
  const row: ForecastRow = payload[0]?.payload ?? {};
  // Holding the value rather than a boolean lets TS see it is defined below.
  const forecast = row.actual == null ? row.predicted : undefined;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="font-medium text-gray-700 dark:text-gray-200">{label}</div>
      {row.actual != null && (
        <div className="text-gray-500 dark:text-gray-400">{t.actual}: {fmtBaht(row.actual)} ฿</div>
      )}
      {forecast != null && (
        <>
          <div className="text-orange-600 dark:text-orange-400">{t.predicted}: {fmtBaht(forecast)} ฿</div>
          {row.band && (
            <div className="text-gray-400">{t.range}: {fmtBaht(row.band[0])}–{fmtBaht(row.band[1])} ฿</div>
          )}
        </>
      )}
    </div>
  );
}

// ForecastChart draws history as a solid line continuing into a dashed forecast,
// with the uncertainty band shaded behind it — the widening band IS the warning.
export default function ForecastChart({
  data,
  language,
}: {
  data: AIForecastResult;
  language: "th" | "en";
}) {
  const rows: Record<string, unknown>[] = [
    ...data.history.map((h) => ({ date: h.date, actual: h.actual })),
    ...data.forecast.map((f) => ({ date: f.date, predicted: f.predicted, band: [f.lower, f.upper] })),
  ];
  // Bridge the solid history line into the dashed forecast so they connect — but
  // only when they are actually contiguous. If the data is stale (a gap between the
  // last actual and the first forecast), leave a visible break instead of drawing a
  // line across days that do not exist.
  if (data.history.length && data.forecast.length) {
    const gapDays = Math.round(
      (Date.parse(data.forecast[0].date) - Date.parse(data.history[data.history.length - 1].date)) / 86_400_000,
    );
    if (gapDays <= 2) {
      const last = rows[data.history.length - 1] as { actual?: number; predicted?: number; band?: number[] };
      last.predicted = last.actual;
      last.band = [last.actual as number, last.actual as number];
    }
  }
  const forecastStart = data.forecast[0]?.date;

  const shortDate = (d: string) => {
    const p = d.split("-");
    return p.length === 3 ? `${+p[2]}/${+p[1]}` : d;
  };
  const kBaht = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`);

  const t =
    language === "th"
      ? { title: "คาดการณ์ยอดขาย 7 วันข้างหน้า", actual: "จริง", predicted: "ทำนาย", range: "ช่วง", accuracy: `พลาดเฉลี่ย ±${Math.round(data.mape)}%` }
      : { title: "7-day sales forecast", actual: "Actual", predicted: "Forecast", range: "Range", accuracy: `avg error ±${Math.round(data.mape)}%` };

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t.title}</span>
        <span className="text-[11px] text-gray-400">{t.accuracy}</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickFormatter={kBaht} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<ForecastTooltip t={t} />} />
          <Area dataKey="band" stroke="none" fill="#f97316" fillOpacity={0.13} isAnimationActive={false} />
          <Line dataKey="actual" stroke="#64748b" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="predicted" stroke="#ea580c" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2, fill: "#ea580c" }} isAnimationActive={false} connectNulls />
          {forecastStart && <ReferenceLine x={forecastStart} stroke="#f97316" strokeDasharray="2 2" strokeOpacity={0.5} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
