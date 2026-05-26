"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import { RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";
import { can } from "@/src/lib/rbac";
import { getManagerReport } from "@/src/lib/report";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { ManagerReport } from "@/src/types/report";

function money(value: number, language: "th" | "en") {
  return new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number, language: "th" | "en") {
  return new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

export default function ReportsPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const lang = language as "th" | "en";
  const canView = can(activeMembership, "view_reports");
  const [report, setReport] = useState<ManagerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = useMemo(() => language === "th"
    ? {
        denied: "ไม่มีสิทธิ์ดูรายงาน",
        eyebrow: "Reports",
        title: "รายงานผู้จัดการ",
        subtitle: "ยอดขาย ต้นทุนเมนู และวัตถุดิบเสี่ยงจากข้อมูลขายจริง",
        refresh: "รีเฟรช",
        loadError: "โหลดรายงานไม่สำเร็จ",
        revenue: "ยอดขาย",
        orders: "ออเดอร์",
        foodCost: "ต้นทุนวัตถุดิบ",
        profit: "กำไรขั้นต้น",
        margin: "มาร์จิน",
        salesDays: "ยอดขายรายวัน",
        menuMargins: "เมนูและกำไร",
        stockRisks: "วัตถุดิบที่ต้องดู",
        menu: "เมนู",
        qty: "จำนวน",
        cost: "ต้นทุน",
        noData: "ยังไม่มีข้อมูลในช่วงนี้",
        restock: "ควรเติม",
      }
    : {
        denied: "You do not have permission to view reports.",
        eyebrow: "Reports",
        title: "Manager report",
        subtitle: "Sales, menu food cost, and stock risks from real order data.",
        refresh: "Refresh",
        loadError: "Could not load report.",
        revenue: "Revenue",
        orders: "Orders",
        foodCost: "Food cost",
        profit: "Gross profit",
        margin: "Margin",
        salesDays: "Daily sales",
        menuMargins: "Menu margin",
        stockRisks: "Stock risks",
        menu: "Menu",
        qty: "Qty",
        cost: "Cost",
        noData: "No data in this period yet.",
        restock: "Top up",
      }, [language]);

  const load = async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await getManagerReport(14);
      setReport(res.data);
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, language]);

  if (!canView) return <PermissionDenied title={copy.denied} />;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-gray-950 dark:text-white sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">{copy.eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy.subtitle}</p>
        </div>
        <button type="button" onClick={() => void load()} className="ui-press inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gray-900 px-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
          <RefreshCw className="h-4 w-4" />
          {copy.refresh}
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <RestaurantCardSkeleton />
          <RestaurantCardSkeleton />
          <RestaurantCardSkeleton />
        </div>
      ) : report ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: copy.revenue, value: money(report.summary.revenue, lang), icon: <Wallet className="h-4 w-4" /> },
              { label: copy.orders, value: number(report.summary.orders, lang), icon: <BarChart3 className="h-4 w-4" /> },
              { label: copy.foodCost, value: money(report.summary.cost, lang), icon: <AlertTriangle className="h-4 w-4" /> },
              { label: copy.profit, value: money(report.summary.profit, lang), icon: <TrendingUp className="h-4 w-4" /> },
              { label: copy.margin, value: `${number(report.summary.margin, lang)}%`, icon: <TrendingUp className="h-4 w-4" /> },
            ].map((card) => (
              <div key={card.label} className="rounded-md border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                <div className="flex items-center justify-between gap-3 text-slate-400">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{card.label}</span>
                  {card.icon}
                </div>
                <p className="mt-3 text-xl font-semibold tabular-nums">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
            <section className="rounded-md border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-sm font-semibold">{copy.salesDays}</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-gray-800">
                {report.sales_days.length ? report.sales_days.map((day) => (
                  <div key={day.order_date} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 text-sm">
                    <span className="font-medium">{day.order_date}</span>
                    <span className="text-slate-500">{number(day.orders, lang)} {copy.orders}</span>
                    <span className="font-semibold tabular-nums">{money(day.revenue, lang)}</span>
                  </div>
                )) : <p className="px-4 py-8 text-center text-sm text-slate-400">{copy.noData}</p>}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-sm font-semibold">{copy.menuMargins}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-slate-400">
                    <tr>
                      <th className="px-4 py-3">{copy.menu}</th>
                      <th className="px-4 py-3 text-right">{copy.qty}</th>
                      <th className="px-4 py-3 text-right">{copy.revenue}</th>
                      <th className="px-4 py-3 text-right">{copy.cost}</th>
                      <th className="px-4 py-3 text-right">{copy.margin}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {report.menu_margins.length ? report.menu_margins.map((item) => (
                      <tr key={`${item.menu_id}-${item.menu_name}`}>
                        <td className="px-4 py-3 font-medium">{item.menu_name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{number(item.quantity, lang)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(item.revenue, lang)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(item.cost, lang)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{number(item.margin, lang)}%</td>
                      </tr>
                    )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{copy.noData}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="rounded-md border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-sm font-semibold">{copy.stockRisks}</h2>
            </div>
            <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
              {report.stock_risks.length ? report.stock_risks.map((risk) => (
                <div key={risk.id} className="rounded-md border border-slate-200 px-3 py-3 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{risk.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{risk.category || "-"}</p>
                    </div>
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${risk.status === "out" ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                      {risk.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {number(risk.stock, lang)} / {number(risk.min_stock, lang)} {risk.unit} · {copy.restock} {number(risk.restock_estimate, lang)} {risk.unit}
                  </p>
                </div>
              )) : <p className="col-span-full px-4 py-8 text-center text-sm text-slate-400">{copy.noData}</p>}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
