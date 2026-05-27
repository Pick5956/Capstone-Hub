"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bot, Loader2, PackageSearch, Send, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { askOperationsAI } from "@/src/lib/ai";
import { getUnclearRequestActions, resolveClarificationRequest } from "@/src/lib/aiClarification";
import { getGuidedActions, type AIGuidedAction } from "@/src/lib/aiGuidedActions";
import { resolveNavigationRequest } from "@/src/lib/aiNavigation";
import { can } from "@/src/lib/rbac";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { AIAskResponse, AIConversationMessage } from "@/src/types/ai";
import AIResponseContent from "@/src/components/shared/AIResponseContent";

function formatCurrency(value: number, language: "th" | "en") {
  return new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number, language: "th" | "en") {
  return new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function buildCopy(language: "th" | "en") {
  return language === "th"
    ? {
        eyebrow: "AI Operations",
        title: "ผู้ช่วยวิเคราะห์ร้าน",
        subtitle: "ถามจากยอดขายและคลังวัตถุดิบล่าสุดของร้าน",
        askPlaceholder: "เช่น พรุ่งนี้ควรเตรียมวัตถุดิบอะไรเพิ่ม?",
        ask: "ถาม AI",
        thinking: "กำลังวิเคราะห์",
        model: "โมเดล",
        answer: "คำตอบจาก AI",
        snapshot: "ข้อมูลที่ใช้วิเคราะห์",
        salesDays: "วันที่มียอดขาย",
        inventoryValue: "มูลค่าคงคลัง",
        stockRisks: "รายการเสี่ยง",
        permissionDenied: "หน้านี้สำหรับเจ้าของร้านหรือผู้จัดการ",
        noAnswer: "เลือกคำถามลัดหรือพิมพ์คำถามเพื่อเริ่มวิเคราะห์",
        error: "เรียก AI ไม่สำเร็จ",
        stockOut: "หมด",
        stockLow: "ต่ำ",
        restock: "แนะนำเติม",
        quickQuestions: [
          "สรุปสถานการณ์ร้านวันนี้ให้หน่อย",
          "พรุ่งนี้ควรเตรียมวัตถุดิบอะไรเพิ่ม?",
          "เมนูไหนขายดีและกระทบสต็อกมากที่สุด?",
          "มีความเสี่ยงวัตถุดิบขาดหรือซื้อเกินไหม?",
        ],
      }
    : {
        eyebrow: "AI Operations",
        title: "Restaurant AI assistant",
        subtitle: "Ask against the restaurant's latest sales and inventory data",
        askPlaceholder: "For example, what ingredients should we prepare tomorrow?",
        ask: "Ask AI",
        thinking: "Analyzing",
        model: "Model",
        answer: "AI answer",
        snapshot: "Analysis snapshot",
        salesDays: "Sales days",
        inventoryValue: "Inventory value",
        stockRisks: "Stock risks",
        permissionDenied: "This page is for owners or managers",
        noAnswer: "Pick a quick question or type one to start",
        error: "AI request failed",
        stockOut: "Out",
        stockLow: "Low",
        restock: "Restock",
        quickQuestions: [
          "Summarize today's restaurant situation.",
          "What ingredients should we prepare tomorrow?",
          "Which menu items sell well and affect stock the most?",
          "Are there stockout or overbuying risks?",
        ],
      };
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 truncate text-lg font-bold text-gray-950 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function AIAssistantPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const copy = useMemo(() => buildCopy(language), [language]);
  const [question, setQuestion] = useState(copy.quickQuestions[0]);
  const [result, setResult] = useState<AIAskResponse | null>(null);
  const [history, setHistory] = useState<AIConversationMessage[]>([]);
  const [actions, setActions] = useState<AIGuidedAction[]>([]);
  const [pendingAction, setPendingAction] = useState<AIGuidedAction | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canUseAI = can(activeMembership, "view_reports") || can(activeMembership, "manage_inventory");

  const submitQuestion = async (nextQuestion = question) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || loading) return;
    setQuestion(trimmed);
    setNotice("");
    setActions([]);
    setPendingAction(null);
    const navigation = resolveNavigationRequest(trimmed, activeMembership, language, pathname);
    if (navigation) {
      setResult(null);
      setNotice(navigation.message);
      if (navigation.kind === "suggest") {
        setActions(navigation.options.map((option) => ({ id: option.href, ...option })));
      } else if (!navigation.alreadyThere) {
        router.push(navigation.href);
      }
      return;
    }
    const clarification = resolveClarificationRequest(trimmed, activeMembership, language);
    if (clarification) {
      setResult(null);
      setNotice(clarification.message);
      setActions(clarification.actions);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await askOperationsAI(trimmed, history.slice(-6));
      setResult(response.data);
      const nextTurn: AIConversationMessage[] = [
        { role: "user", content: trimmed },
        { role: "assistant", content: response.data.answer },
      ];
      setHistory((previous) => [...previous, ...nextTurn].slice(-6));
      setActions(response.data.intent === "unclear"
        ? getUnclearRequestActions(activeMembership, language)
        : response.data.intent === "analysis"
          ? getGuidedActions(trimmed, response.data.answer, activeMembership, language)
          : []);
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : "";
      setError(message || copy.error);
    } finally {
      setLoading(false);
    }
  };

  const handleGuidedAction = (action: AIGuidedAction) => {
    if (action.prompt) {
      submitQuestion(action.prompt);
      return;
    }
    if (!action.href) return;
    if (action.requiresConfirmation) {
      setPendingAction(action);
      return;
    }
    router.push(action.href);
  };

  if (!canUseAI) {
    return (
      <main className="flex w-full flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <section className="rounded-md border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-950">
          <Bot className="mx-auto h-10 w-10 text-gray-400" />
          <h1 className="mt-4 text-lg font-semibold text-gray-950 dark:text-white">{copy.permissionDenied}</h1>
        </section>
      </main>
    );
  }

  const snapshot = result?.snapshot;
  const salesDays = snapshot?.sales_days ?? [];
  const stockRisks = snapshot?.stock_risks ?? [];
  const inventorySummary = snapshot?.inventory_summary;

  return (
    <main className="flex w-full flex-1 flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-800 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{copy.subtitle}</p>
        </div>
        {result && (
          <div className="rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            {copy.model}: <span className="font-semibold text-gray-800 dark:text-gray-200">{result.model}</span>
          </div>
        )}
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="border-b border-gray-200 p-4 dark:border-gray-800">
            <div className="flex flex-wrap gap-2">
              {copy.quickQuestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => submitQuestion(item)}
                  disabled={loading}
                  className="rounded-md border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-wait disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:border-orange-800 dark:hover:bg-orange-900/20 dark:hover:text-orange-300"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <form
            className="border-b border-gray-200 p-4 dark:border-gray-800"
            onSubmit={(event) => {
              event.preventDefault();
              submitQuestion();
            }}
          >
            <label className="sr-only" htmlFor="ai-question">
              {copy.ask}
            </label>
            <textarea
              id="ai-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={copy.askPlaceholder}
              rows={4}
              className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:focus:border-orange-600 dark:focus:ring-orange-900/30"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {loading ? copy.thinking : copy.ask}
              </button>
            </div>
          </form>

          <div className="min-h-72 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
              <Sparkles className="h-4 w-4 text-orange-500" />
              {copy.answer}
            </div>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}
            {!error && result?.answer && (
              <AIResponseContent content={result.answer} />
            )}
            {!error && notice && (
              <div className="text-sm leading-7 text-gray-700 dark:text-gray-200">{notice}</div>
            )}
            {!error && actions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button key={action.id} type="button" onClick={() => handleGuidedAction(action)} className="rounded-md border border-orange-200 bg-orange-50/40 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 dark:border-orange-900/50 dark:bg-orange-900/10 dark:text-orange-300">
                    {action.label}
                  </button>
                ))}
              </div>
            )}
            {!error && pendingAction && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <p>{pendingAction.description}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => pendingAction.href && router.push(pendingAction.href)} className="rounded-md bg-gray-950 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">
                    {language === "th" ? "ยืนยันและเปิดหน้าตรวจสอบ" : "Confirm and open review page"}
                  </button>
                  <button type="button" onClick={() => setPendingAction(null)} className="rounded-md border border-amber-300 px-3 py-2 text-xs font-semibold dark:border-amber-800">
                    {language === "th" ? "ยกเลิก" : "Cancel"}
                  </button>
                </div>
              </div>
            )}
            {!error && !result && !notice && (
              <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-gray-400 dark:border-gray-800">
                {copy.noAnswer}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">{copy.snapshot}</h2>
          <MetricCard
            icon={<TrendingUp className="h-4 w-4" />}
            label={copy.salesDays}
            value={formatNumber(salesDays.length, language)}
          />
          <MetricCard
            icon={<Wallet className="h-4 w-4" />}
            label={copy.inventoryValue}
            value={formatCurrency(inventorySummary?.value ?? 0, language)}
          />
          <MetricCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label={copy.stockRisks}
            value={formatNumber(stockRisks.length, language)}
          />

          <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-950 dark:border-gray-800 dark:text-white">
              <PackageSearch className="h-4 w-4 text-orange-500" />
              {copy.stockRisks}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {stockRisks.slice(0, 5).map((item) => (
                <div key={item.name} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatNumber(item.stock, language)} {item.unit}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                        item.status === "out"
                          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                      }`}
                    >
                      {item.status === "out" ? copy.stockOut : copy.stockLow}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {copy.restock} {formatNumber(item.restock_estimate, language)} {item.unit}
                  </p>
                </div>
              ))}
              {stockRisks.length === 0 && (
                <div className="p-4 text-sm text-gray-400">{copy.noAnswer}</div>
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
