"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Coins,
  Loader2,
  PackageX,
  Package,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getProactiveInsights } from "@/src/lib/ai";
import type { AIInsight, AIInsightSeverity } from "@/src/types/ai";

type Props = { language: "th" | "en"; onCount?: (count: number) => void };

const copyByLang = {
  th: {
    title: "ควรรู้วันนี้",
    empty: "ทุกอย่างปกติ ไม่มีเรื่องต้องรีบวันนี้",
    loading: "กำลังตรวจข้อมูลร้าน",
    urgent: (n: number) => `${n} เรื่องด่วน`,
    items: (n: number) => `${n} เรื่อง`,
  },
  en: {
    title: "Today's insights",
    empty: "All clear — nothing urgent today",
    loading: "Checking the shop",
    urgent: (n: number) => `${n} urgent`,
    items: (n: number) => `${n} items`,
  },
};

// A card's tone is what the owner should FEEL about it, which is not the same as
// the raw severity: "sales_up" and "dead_stock" are both severity=info, but one is
// good news and one is money sitting still. Deriving the tone from the kind as
// well keeps the colour honest.
type Tone = "danger" | "warn" | "good" | "note";

// Colour alone must never be the only carrier of meaning (a red dot reads as a
// grey dot to a red-blind owner, and as nothing at all on a glance), so every
// tone also ships a word and a distinct icon. Three signals, one meaning.
const toneStyle: Record<
  Tone,
  { chip: string; icon: string; metric: string; card: string; label: { th: string; en: string } | null }
> = {
  danger: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    metric: "text-rose-700 dark:text-rose-300",
    // The one card that gets a tinted ground: the eye lands here first, and
    // nothing else competes with it.
    card: "bg-rose-50/70 ring-1 ring-rose-100 dark:bg-rose-950/20 dark:ring-rose-900/40",
    label: { th: "ด่วน", en: "Urgent" },
  },
  warn: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    metric: "text-amber-800 dark:text-amber-300",
    card: "bg-white ring-1 ring-gray-100 dark:bg-gray-900/50 dark:ring-gray-800",
    label: { th: "ต้องดู", en: "Watch" },
  },
  good: {
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    metric: "text-emerald-800 dark:text-emerald-300",
    card: "bg-white ring-1 ring-gray-100 dark:bg-gray-900/50 dark:ring-gray-800",
    label: null,
  },
  note: {
    chip: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    icon: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    metric: "text-gray-700 dark:text-gray-200",
    card: "bg-white ring-1 ring-gray-100 dark:bg-gray-900/50 dark:ring-gray-800",
    label: null,
  },
};

function toneFor(kind: string, severity: AIInsightSeverity): Tone {
  if (kind === "sales_up") return "good";
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warn";
  return "note";
}

function iconFor(kind: string) {
  switch (kind) {
    case "ingredient_low":
      return Package;
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

export default function AIInsightsPanel({ language, onCount }: Props) {
  const copy = copyByLang[language];
  const [insights, setInsights] = useState<AIInsight[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // onCount is a parent callback that can be re-created every render. Keeping
  // it in a ref lets the fetch stay mount-once without an incomplete dep list.
  const onCountRef = useRef(onCount);
  useEffect(() => {
    onCountRef.current = onCount;
  });

  useEffect(() => {
    let active = true;
    getProactiveInsights()
      .then((res) => {
        if (!active) return;
        const list = res.data?.insights ?? [];
        setInsights(list);
        onCountRef.current?.(list.length);
        // next frame → trigger the staggered entrance transition
        requestAnimationFrame(() => active && setMounted(true));
      })
      .catch(() => {
        if (!active) return;
        setInsights([]);
        onCountRef.current?.(0);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const urgentCount = insights?.filter((i) => i.severity === "critical").length ?? 0;

  return (
    <div>
      {/* Header: the count is the summary, so it is stated before any card. It
          turns red only when something is actually urgent — a chip that is always
          coloured stops meaning anything. */}
      <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-gray-950 dark:text-white">
          {copy.title}
        </h2>
        {insights && insights.length > 0 && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              urgentCount > 0 ? toneStyle.danger.chip : toneStyle.note.chip
            }`}
          >
            {urgentCount > 0 ? copy.urgent(urgentCount) : copy.items(insights.length)}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center gap-2 px-1 py-6 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {copy.loading}
          </div>
        )}

        {!loading && insights && insights.length === 0 && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-50/70 px-4 py-4 text-[13px] font-medium text-emerald-800 ring-1 ring-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-300 dark:ring-emerald-900/40">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Check className="h-4 w-4" />
            </span>
            {copy.empty}
          </div>
        )}

        {!loading &&
          insights?.map((insight, index) => {
            const Icon = iconFor(insight.kind);
            const tone = toneFor(insight.kind, insight.severity);
            const style = toneStyle[tone];
            return (
              <article
                key={`${insight.kind}-${index}`}
                style={{ transitionDelay: `${index * 60}ms` }}
                className={`flex gap-3 rounded-2xl p-3.5 transition-all duration-500 ease-out ${style.card} ${
                  mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.icon}`}
                  aria-hidden
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  {style.label && (
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${style.metric}`}>
                      {style.label[language]}
                    </span>
                  )}
                  {/* The headline is never truncated: a cut headline is a fact the
                      owner has to guess at. */}
                  <p className="text-[14.5px] font-bold leading-snug tracking-[-0.01em] text-gray-950 dark:text-white">
                    {insight.title}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500 tabular-nums dark:text-gray-400">
                    {insight.metric && (
                      <span className={`font-bold ${style.metric}`}>{insight.metric} · </span>
                    )}
                    {insight.detail}
                  </p>
                </div>
              </article>
            );
          })}
      </div>
    </div>
  );
}
