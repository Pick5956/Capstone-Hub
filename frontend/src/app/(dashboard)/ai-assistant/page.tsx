"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bot, Loader2, PackageSearch, RotateCcw, Send, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { askOperationsAI, getOperationsSnapshot } from "@/src/lib/ai";
import { getUnclearRequestActions, resolveClarificationRequest } from "@/src/lib/aiClarification";
import { getGuidedActions, type AIGuidedAction } from "@/src/lib/aiGuidedActions";
import { resolveNavigationRequest } from "@/src/lib/aiNavigation";
import { chatStorageKey, clearStoredChat, loadStoredMessages, purgeStaleChats, saveMessages } from "@/src/lib/aiChatStorage";
import { can } from "@/src/lib/rbac";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { AISnapshot, AIConversationMessage } from "@/src/types/ai";
import AIResponseContent from "@/src/components/shared/AIResponseContent";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  actions?: AIGuidedAction[];
  model?: string;
};

type StoredMessage = Omit<Message, "createdAt"> & { createdAt?: string };

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
        askPlaceholder: "พิมพ์คำถามของคุณที่นี่...",
        ask: "ถาม AI",
        thinking: "กำลังวิเคราะห์",
        newChat: "เริ่มแชทใหม่",
        snapshot: "ข้อมูลที่ใช้วิเคราะห์",
        salesDays: "วันที่มียอดขาย",
        inventoryValue: "มูลค่าคงคลัง",
        stockRisks: "รายการเสี่ยง",
        permissionDenied: "หน้านี้สำหรับเจ้าของร้านหรือผู้จัดการ",
        empty: "เลือกคำถามลัดหรือพิมพ์คำถามเพื่อเริ่มวิเคราะห์",
        welcome: "สวัสดีครับ ผมเป็นผู้ช่วยวิเคราะห์ร้าน ถามผมได้เลยเรื่องยอดขาย กำไรเมนู หรือคลังวัตถุดิบครับ",
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
        askPlaceholder: "Type your question here...",
        ask: "Ask AI",
        thinking: "Analyzing",
        newChat: "New chat",
        snapshot: "Analysis snapshot",
        salesDays: "Sales days",
        inventoryValue: "Inventory value",
        stockRisks: "Stock risks",
        permissionDenied: "This page is for owners or managers",
        empty: "Pick a quick question or type one to start",
        welcome: "Hi! I'm your restaurant analysis assistant. Ask me about sales, menu profit, or ingredient stock.",
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

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold text-gray-950 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function AIAssistantPage() {
  const { activeMembership, user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const copy = useMemo(() => buildCopy(language), [language]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<AIGuidedAction | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<AISnapshot | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const snapshotRequestedRef = useRef(false);
  const canUseAI = can(activeMembership, "view_reports") || can(activeMembership, "manage_inventory");

  const storageKey = useMemo(
    () => chatStorageKey(activeMembership?.restaurant_id, user?.ID),
    [activeMembership, user],
  );

  const welcomeMessage = (): Message => ({ id: "welcome", role: "assistant", content: copy.welcome, createdAt: new Date() });

  // Load shared history (same key as the floating chat) with cleanup + TTL.
  useEffect(() => {
    purgeStaleChats(storageKey);
    const stored = loadStoredMessages<StoredMessage>(storageKey);
    if (stored && stored.length > 0) {
      setMessages(stored.map((m) => ({ ...m, createdAt: m.createdAt ? new Date(m.createdAt) : new Date() })));
    } else {
      setMessages([welcomeMessage()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, copy.welcome]);

  useEffect(() => {
    saveMessages(storageKey, messages);
  }, [messages, storageKey]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading]);

  // Populate the sidebar snapshot on first load.
  useEffect(() => {
    if (!canUseAI || snapshotRequestedRef.current) return;
    snapshotRequestedRef.current = true;
    getOperationsSnapshot()
      .then((response) => response?.data && setLatestSnapshot(response.data))
      .catch(() => {
        snapshotRequestedRef.current = false;
      });
  }, [canUseAI]);

  const conversationHistory = (): AIConversationMessage[] =>
    messages
      .filter((m): m is Message & { role: "user" | "assistant" } => m.role !== "system")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

  const handleClearChat = () => {
    clearStoredChat(storageKey);
    setError("");
    setPendingAction(null);
    setMessages([welcomeMessage()]);
  };

  const submitQuestion = async (nextQuestion = input) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || loading) return;
    setInput("");
    setError("");
    setPendingAction(null);

    const history = conversationHistory();
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", content: trimmed, createdAt: new Date() }]);

    const navigation = resolveNavigationRequest(trimmed, activeMembership, language, pathname);
    if (navigation) {
      setMessages((prev) => [
        ...prev,
        {
          id: `nav-${Date.now()}`,
          role: "assistant",
          content: navigation.message,
          createdAt: new Date(),
          actions: navigation.kind === "suggest" ? navigation.options.map((o) => ({ id: o.href, ...o })) : undefined,
        },
      ]);
      if (navigation.kind === "navigate" && !navigation.alreadyThere) router.push(navigation.href);
      return;
    }

    const clarification = resolveClarificationRequest(trimmed, activeMembership, language);
    if (clarification) {
      setMessages((prev) => [
        ...prev,
        { id: `clarify-${Date.now()}`, role: "assistant", content: clarification.message, createdAt: new Date(), actions: clarification.actions },
      ]);
      return;
    }

    setLoading(true);
    try {
      const response = await askOperationsAI(trimmed, history);
      const data = response.data;
      if (data.snapshot) setLatestSnapshot(data.snapshot);
      const actions =
        data.intent === "unclear"
          ? getUnclearRequestActions(activeMembership, language)
          : data.intent === "analysis"
            ? getGuidedActions(trimmed, data.answer, activeMembership, language, data.tool)
            : [];
      setMessages((prev) => [
        ...prev,
        { id: `ai-${Date.now()}`, role: "assistant", content: data.answer, createdAt: new Date(), actions, model: data.model },
      ]);
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

  const salesDays = latestSnapshot?.sales_days ?? [];
  const stockRisks = latestSnapshot?.stock_risks ?? [];
  const inventorySummary = latestSnapshot?.inventory_summary;
  const isEmpty = messages.length <= 1;

  return (
    <main className="flex h-[calc(100dvh-3.5rem)] min-h-0 w-full flex-col overflow-hidden px-4 pt-2 pb-3 sm:px-6 lg:h-[calc(100dvh-var(--dashboard-shell-row))] lg:px-8 lg:pt-3 lg:pb-4">
      <section className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Conversation column */}
        <div className="flex min-h-0 flex-col bg-white dark:bg-gray-950">
          {/* Card header */}
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-950/50 dark:bg-orange-950/30 dark:text-orange-300">
                <Bot className="h-4 w-4" />
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                {language === "th" ? "ผู้ช่วยพร้อมวิเคราะห์" : "Assistant ready"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearChat}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{copy.newChat}</span>
            </button>
          </div>
          {/* Messages */}
          <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="ml-auto flex max-w-[85%] items-end justify-end gap-2.5">
                    <div className="break-words rounded-2xl rounded-br-sm bg-gray-900 px-4 py-2.5 text-sm leading-relaxed text-white dark:bg-white dark:text-gray-900">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex max-w-[90%] items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-950/50 dark:bg-orange-950/30 dark:text-orange-300">
                    <Bot className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                    <AIResponseContent content={msg.content} compact />
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.actions.map((action) => (
                          <button
                            key={`${msg.id}-${action.id}`}
                            type="button"
                            onClick={() => handleGuidedAction(action)}
                            className="rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-gray-50 dark:border-orange-900/50 dark:bg-gray-950 dark:text-orange-300 dark:hover:bg-gray-900"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-950/50 dark:bg-orange-950/30 dark:text-orange-300">
                  <Bot className="h-4.5 w-4.5" />
                </span>
                <div className="flex items-center rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 dark:bg-gray-800" role="status" aria-label={copy.thinking}>
                  <span className="flex items-center gap-1.5 text-orange-500 dark:text-orange-400">
                    <span className="ai-thinking-dot"></span>
                    <span className="ai-thinking-dot"></span>
                    <span className="ai-thinking-dot"></span>
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            {pendingAction && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
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

            <div ref={messagesEndRef} />
          </div>

          {/* Quick questions (only before the conversation starts) */}
          {isEmpty && !loading && (
            <div className="border-t border-gray-200 p-3 dark:border-gray-800">
              <div className="flex flex-wrap gap-2">
                {copy.quickQuestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => submitQuestion(item)}
                    className="rounded-md border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700 transition-colors hover:border-orange-300 hover:bg-gray-50 hover:text-orange-700 dark:border-gray-800 dark:text-gray-300 dark:hover:border-orange-800 dark:hover:bg-gray-900 dark:hover:text-orange-300"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input at the bottom */}
          <form
            className="flex items-end gap-2.5 border-t border-gray-200 p-3 dark:border-gray-800"
            onSubmit={(event) => {
              event.preventDefault();
              submitQuestion();
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitQuestion();
                }
              }}
              placeholder={copy.askPlaceholder}
              rows={1}
              className="max-h-40 min-h-11 flex-1 resize-none rounded-md border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:focus:border-orange-600 dark:focus:ring-orange-900/30"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label={copy.ask}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gray-950 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>

        {/* Snapshot sidebar */}
        <aside className="hidden min-h-0 space-y-3 overflow-y-auto lg:block">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
            <Sparkles className="h-4 w-4 text-orange-500" />
            {copy.snapshot}
          </h2>
          <MetricCard icon={<TrendingUp className="h-4 w-4" />} label={copy.salesDays} value={formatNumber(salesDays.length, language)} />
          <MetricCard icon={<Wallet className="h-4 w-4" />} label={copy.inventoryValue} value={formatCurrency(inventorySummary?.value ?? 0, language)} />
          <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label={copy.stockRisks} value={formatNumber(stockRisks.length, language)} />

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
              {stockRisks.length === 0 && <div className="p-4 text-sm text-gray-400">{copy.empty}</div>}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
