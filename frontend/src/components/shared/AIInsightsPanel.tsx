"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Coins,
  Loader2,
  PackageX,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getProactiveInsights } from "@/src/lib/ai";
import type { AIInsight, AIInsightSeverity } from "@/src/types/ai";

type Props = { language: "th" | "en" };

const copyByLang = {
  th: { title: "ควรรู้วันนี้", empty: "ทุกอย่างดูโอเค ไม่มีเรื่องด่วนวันนี้ 👍", loading: "กำลังสแกนร้าน..." },
  en: { title: "Today's insights", empty: "All clear — nothing urgent today 👍", loading: "Scanning the shop..." },
};

const severityStyle: Record<AIInsightSeverity, { bar: string; icon: string; metric: string; glow: string }> = {
  critical: {
    bar: "bg-gradient-to-b from-rose-500 to-red-600",
    icon: "bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm shadow-rose-500/40",
    metric: "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900/60",
    glow: "hover:shadow-[0_8px_30px_-12px_rgba(244,63,94,0.45)]",
  },
  warning: {
    bar: "bg-gradient-to-b from-amber-400 to-orange-500",
    icon: "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/40",
    metric: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50",
    glow: "hover:shadow-[0_8px_30px_-12px_rgba(245,158,11,0.4)]",
  },
  info: {
    bar: "bg-gradient-to-b from-sky-400 to-indigo-500",
    icon: "bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-sm shadow-sky-500/40",
    metric: "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900/50",
    glow: "hover:shadow-[0_8px_30px_-12px_rgba(56,189,248,0.4)]",
  },
};

function iconFor(kind: string) {
  switch (kind) {
    case "ingredient_low":
      return AlertTriangle;
    case "sales_drop":
      return TrendingDown;
    case "sales_up":
      return TrendingUp;
    case "dead_stock":
      return PackageX;
    default:
      return Coins; // plowhorse & others
  }
}

export default function AIInsightsPanel({ language }: Props) {
  const copy = copyByLang[language];
  const [insights, setInsights] = useState<AIInsight[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProactiveInsights()
      .then((res) => {
        if (!active) return;
        setInsights(res.data?.insights ?? []);
        // next frame → trigger the staggered entrance transition
        requestAnimationFrame(() => active && setMounted(true));
      })
      .catch(() => active && setInsights([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white/70 shadow-sm backdrop-blur dark:border-gray-800/80 dark:bg-gray-950/60">
      <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800/70">
        <span className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">{copy.title}</h2>
        {insights && insights.length > 0 && (
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {insights.length}
          </span>
        )}
      </header>

      <div className="space-y-2 p-3">
        {loading && (
          <div className="flex items-center gap-2 px-1 py-6 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {copy.loading}
          </div>
        )}

        {!loading && insights && insights.length === 0 && (
          <div className="rounded-xl bg-emerald-50/60 px-3 py-5 text-center text-xs text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
            {copy.empty}
          </div>
        )}

        {!loading &&
          insights?.map((insight, index) => {
            const Icon = iconFor(insight.kind);
            const style = severityStyle[insight.severity] ?? severityStyle.info;
            return (
              <article
                key={`${insight.kind}-${index}`}
                style={{ transitionDelay: `${index * 70}ms` }}
                className={`group relative flex gap-3 overflow-hidden rounded-xl border border-gray-100 bg-white p-3 pl-4 transition-all duration-500 ease-out dark:border-gray-800/70 dark:bg-gray-900/40 ${style.glow} ${
                  mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
              >
                <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} aria-hidden />
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.icon}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold leading-snug text-gray-900 dark:text-white">
                      {insight.title}
                    </p>
                    {insight.metric && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${style.metric}`}>
                        {insight.metric}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {insight.detail}
                  </p>
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
}
