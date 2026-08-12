"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bot, Loader2, RotateCcw, Send, Sparkles, TrendingUp, Wallet, X } from "lucide-react";
import { askOperationsAI, cancelAIAction, confirmAIAction, deleteAIConversation, getOperationsSnapshot, normalizeAIAnswer } from "@/src/lib/ai";
import {
  formatAIActionPreviewAnswer,
  formatAIActionConfirmationMessage,
  getAIActionCancellationErrorMessage,
  getAIActionErrorMessage,
  isTerminalAIActionCancellationError,
} from "@/src/lib/aiActionPreview";
import { selectOperationsSnapshot } from "@/src/lib/aiSnapshot";
import { getUnclearRequestActions, resolveClarificationRequest } from "@/src/lib/aiClarification";
import { getGuidedActions, type AIGuidedAction } from "@/src/lib/aiGuidedActions";
import { resolveNavigationRequest } from "@/src/lib/aiNavigation";
import {
  chatStorageKey,
  clearStoredChat,
  loadStoredConversationId,
  loadStoredMessages,
  purgeStaleChats,
  saveConversationId,
  saveMessages,
  subscribeToChatClear,
  subscribeToChatWrites,
} from "@/src/lib/aiChatStorage";
import { createRequestGeneration } from "@/src/lib/requestGeneration";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { AIActionPreview, AISnapshot, AIConversationMessage } from "@/src/types/ai";
import AIActionPreviewCard from "@/src/components/shared/AIActionPreviewCard";
import AIInlineConfirm from "@/src/components/shared/AIInlineConfirm";
import AIInputTools from "@/src/components/shared/AIInputTools";
import AIInsightsPanel from "@/src/components/shared/AIInsightsPanel";
import SafeAIResponseContent from "@/src/components/shared/SafeAIResponseContent";
import SiriOrb from "@/src/components/ui/siri-orb";

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
        permissionDenied: "หน้านี้สำหรับเจ้าของร้านเท่านั้น",
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
        permissionDenied: "This page is for the restaurant owner only",
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<AIGuidedAction | null>(null);
  const [pendingActionMsgId, setPendingActionMsgId] = useState<string | null>(null);
  const [pendingActionPreview, setPendingActionPreview] = useState<AIActionPreview | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [insightsCount, setInsightsCount] = useState(0);
  const [actionConfirming, setActionConfirming] = useState(false);
  const [actionCancelling, setActionCancelling] = useState(false);
  const [actionPreviewError, setActionPreviewError] = useState("");
  const [latestSnapshot, setLatestSnapshot] = useState<AISnapshot | null>(null);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>();
  const [conversationRequests] = useState(createRequestGeneration);
  const [snapshotRequests] = useState(createRequestGeneration);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const snapshotRequestedRef = useRef(false);
  const chatWriteSourceRef = useRef(Symbol("ai-assistant-page"));
  const canUseAI = activeMembership?.role?.name === "owner";

  const storageKey = useMemo(
    () => chatStorageKey(activeMembership?.restaurant_id, user?.ID),
    [activeMembership, user],
  );

  const welcomeMessage = (): Message => ({ id: "welcome", role: "assistant", content: copy.welcome, createdAt: new Date() });

  // Load shared history (same key as the floating chat) with cleanup + TTL.
  useEffect(() => {
    conversationRequests.invalidate();
    // Drop the previous key's server conversation and pending action right away:
    // a send between this render and the deferred load must not reuse them.
    setConversationId(null);
    setPendingActionPreview(null);
    setActionConfirming(false);
    setActionCancelling(false);
    setActionPreviewError("");
    const loadTimer = window.setTimeout(() => {
      purgeStaleChats(storageKey);
      setConversationId(loadStoredConversationId(storageKey));
      const stored = loadStoredMessages<StoredMessage>(storageKey);
      setMessages(stored && stored.length > 0
        ? stored.map((m) => ({ ...m, createdAt: m.createdAt ? new Date(m.createdAt) : new Date() }))
        : [welcomeMessage()]);
      setLoading(false);
      setHydratedStorageKey(storageKey);
    }, 0);
    return () => window.clearTimeout(loadTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, copy.welcome]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    saveMessages(storageKey, messages, chatWriteSourceRef.current);
  }, [hydratedStorageKey, messages, storageKey]);

  useEffect(() => subscribeToChatWrites(storageKey, chatWriteSourceRef.current, (write) => {
    if (write.kind === "conversation") {
      setConversationId(write.conversationId);
      return;
    }
    const stored = write.messages as StoredMessage[];
    setMessages(stored.map((message) => ({
      ...message,
      createdAt: message.createdAt ? new Date(message.createdAt) : new Date(),
    })));
  }), [storageKey]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading]);

  useEffect(() => {
    snapshotRequests.invalidate();
    snapshotRequestedRef.current = false;
    setLatestSnapshot(null);
  }, [canUseAI, snapshotRequests, storageKey]);

  // Populate the sidebar snapshot once for each restaurant/user scope.
  useEffect(() => {
    if (!canUseAI || snapshotRequestedRef.current) return;
    snapshotRequestedRef.current = true;
    const snapshotGeneration = snapshotRequests.begin();
    getOperationsSnapshot()
      .then((response) => {
        if (snapshotRequests.isCurrent(snapshotGeneration) && response?.data) {
          setLatestSnapshot((current) => selectOperationsSnapshot(current, response.data));
        }
      })
      .catch(() => {
        if (snapshotRequests.isCurrent(snapshotGeneration)) snapshotRequestedRef.current = false;
      });
  }, [canUseAI, snapshotRequests, storageKey]);

  const conversationHistory = (): AIConversationMessage[] =>
    messages
      .filter((m): m is Message & { role: "user" | "assistant" } => m.role !== "system")
      .slice(-6)
      .map((m) => ({ id: m.id, role: m.role, content: m.content }));

  const resetConversation = useCallback(() => {
    conversationRequests.invalidate();
    setError("");
    setLoading(false);
    setPendingAction(null);
    // Also reached when the floating chat clears: that surface's history is
    // gone, so this one must drop the shared server thread and pending action.
    setConversationId(null);
    setPendingActionPreview(null);
    setActionConfirming(false);
    setActionCancelling(false);
    setActionPreviewError("");
    setMessages([{ id: "welcome", role: "assistant", content: copy.welcome, createdAt: new Date() }]);
  }, [conversationRequests, copy.welcome]);

  useEffect(() => subscribeToChatClear((clearedKey) => {
    if (clearedKey === storageKey) resetConversation();
  }), [resetConversation, storageKey]);

  const handleClearChat = async () => {
    if (loading || actionConfirming || actionCancelling) return;
    if (pendingActionPreview && !(await discardPendingActionPreview())) return;
    const serverConversationId = conversationId ?? loadStoredConversationId(storageKey);
    if (serverConversationId) {
      void deleteAIConversation(serverConversationId).catch(() => undefined);
    }
    // clearStoredChat broadcasts, so both surfaces run resetConversation. With no
    // storage key there is nothing to broadcast — reset this surface directly.
    if (storageKey) clearStoredChat(storageKey);
    else resetConversation();
  };

  const submitQuestion = async (nextQuestion = input) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || loading || actionConfirming || actionCancelling) return;
    if (pendingActionPreview && !(await discardPendingActionPreview())) return;
    setInput("");
    setError("");
    setPendingAction(null);
    setPendingActionPreview(null);
    setActionPreviewError("");

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

    const requestGeneration = conversationRequests.begin();
    setLoading(true);
    try {
      const response = await askOperationsAI(trimmed, history, conversationId);
      // The chat was cleared or switched restaurants while this was in flight —
      // drop the answer instead of appending it to a conversation it never joined.
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      const data = response.data;
      const answer = normalizeAIAnswer(data?.answer);
      if (!answer) throw new Error("AI response did not contain a valid answer");
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
        saveConversationId(storageKey, data.conversation_id, chatWriteSourceRef.current);
      }
      if (data.snapshot) {
        snapshotRequests.invalidate();
        setLatestSnapshot((current) => selectOperationsSnapshot(current, data.snapshot));
      }
      if (data.action_preview) setPendingActionPreview(data.action_preview);
      const actions =
        data.intent === "unclear"
          ? getUnclearRequestActions(activeMembership, language)
          : data.intent === "analysis"
            ? getGuidedActions(trimmed, answer, activeMembership, language, data.tool)
            : [];
      setMessages((prev) => [
        ...prev,
        {
          id: data.turn_id ? `${data.turn_id}-assistant` : `ai-${Date.now()}`,
          role: "assistant",
          content: formatAIActionPreviewAnswer(answer, data.action_preview, language),
          createdAt: new Date(),
          actions,
          model: data.model,
        },
      ]);
    } catch (err: unknown) {
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      const message =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : "";
      setError(message || copy.error);
    } finally {
      if (conversationRequests.isCurrent(requestGeneration)) setLoading(false);
    }
  };

  const handleConfirmActionPreview = async () => {
    const preview = pendingActionPreview;
    if (!preview || actionConfirming || actionCancelling) return;

    const requestGeneration = conversationRequests.begin();
    setActionConfirming(true);
    setActionPreviewError("");
    try {
      const response = await confirmAIAction(preview.id, preview.confirmation_token);
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      setPendingActionPreview((current) => current?.id === preview.id ? null : current);
      setMessages((previous) => [
        ...previous,
        {
          id: `action-${response.data.action_id}`,
          role: "assistant",
          content: formatAIActionConfirmationMessage(response.data, language),
          createdAt: new Date(),
        },
      ]);
      const snapshotGeneration = snapshotRequests.begin();
      getOperationsSnapshot()
        .then((snapshotResponse) => {
          if (
            conversationRequests.isCurrent(requestGeneration)
            && snapshotRequests.isCurrent(snapshotGeneration)
            && snapshotResponse?.data
          ) {
            setLatestSnapshot((current) => selectOperationsSnapshot(current, snapshotResponse.data));
          }
        })
        .catch(() => undefined);
    } catch (actionError: unknown) {
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      setActionPreviewError(getAIActionErrorMessage(actionError, language));
    } finally {
      if (conversationRequests.isCurrent(requestGeneration)) setActionConfirming(false);
    }
  };

  async function discardPendingActionPreview(): Promise<boolean> {
    const preview = pendingActionPreview;
    if (!preview) return true;
    if (actionConfirming || actionCancelling) return false;

    const requestGeneration = conversationRequests.begin();
    setActionCancelling(true);
    setActionPreviewError("");
    try {
      await cancelAIAction(preview.id);
      if (!conversationRequests.isCurrent(requestGeneration)) return false;
      setPendingActionPreview((current) => current?.id === preview.id ? null : current);
      return true;
    } catch (cancellationError: unknown) {
      if (!conversationRequests.isCurrent(requestGeneration)) return false;
      if (isTerminalAIActionCancellationError(cancellationError)) {
        setPendingActionPreview((current) => current?.id === preview.id ? null : current);
        const snapshotGeneration = snapshotRequests.begin();
        getOperationsSnapshot()
          .then((snapshotResponse) => {
            if (
              conversationRequests.isCurrent(requestGeneration)
              && snapshotRequests.isCurrent(snapshotGeneration)
              && snapshotResponse?.data
            ) {
              setLatestSnapshot((current) => selectOperationsSnapshot(current, snapshotResponse.data));
            }
          })
          .catch(() => undefined);
        return true;
      }
      setActionPreviewError(getAIActionCancellationErrorMessage(language));
      return false;
    } finally {
      if (conversationRequests.isCurrent(requestGeneration)) setActionCancelling(false);
    }
  }

  async function handleCancelActionPreview() {
    await discardPendingActionPreview();
  }

  const handleGuidedAction = (action: AIGuidedAction, msgId?: string) => {
    if (action.prompt) {
      submitQuestion(action.prompt);
      return;
    }
    if (!action.href) return;
    if (action.requiresConfirmation) {
      setPendingAction(action);
      setPendingActionMsgId(msgId ?? null);
      return;
    }
    router.push(action.href);
  };

  const dismissPendingAction = () => {
    setPendingAction(null);
    setPendingActionMsgId(null);
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
    <main className="relative flex h-[calc(100dvh-3.5rem)] min-h-0 w-full flex-col overflow-hidden px-4 pt-2 pb-3 sm:px-6 lg:h-[calc(100dvh-var(--dashboard-shell-row))] lg:px-8 lg:pt-3 lg:pb-4">
      <section className="relative flex min-h-0 flex-1">
        {/* Conversation — full width */}
        <div className="relative flex min-h-0 flex-1 flex-col bg-white dark:bg-gray-950">
          {/* Floating controls (top-right) — minimal & glassy so the chat stays full-screen */}
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-label={language === "th" ? "ควรรู้วันนี้" : "Insights"}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-700 hover:shadow-md dark:border-gray-800/80 dark:bg-gray-900/70 dark:text-gray-200 dark:hover:border-orange-800"
            >
              <Sparkles className="h-3.5 w-3.5 text-orange-500" />
              <span className="hidden sm:inline">{language === "th" ? "ควรรู้วันนี้" : "Insights"}</span>
              {insightsCount > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 px-1 text-[10px] font-bold text-white">
                  {insightsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleClearChat()}
              disabled={loading || actionConfirming || actionCancelling}
              aria-label={copy.newChat}
              title={copy.newChat}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-600 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:text-gray-900 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800/80 dark:bg-gray-900/70 dark:text-gray-300 dark:hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Messages — scroll area bleeds to the window's right edge so its
              scrollbar sits flush; pr-8 keeps the bubbles off the scrollbar. */}
          <div className="ai-scroll flex-1 min-h-0 space-y-4 overflow-y-auto px-4 pb-4 pt-14 sm:px-5 sm:pb-5 lg:-mr-8 lg:pr-8">
            {isEmpty && !loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
                <SiriOrb size="128px" className="drop-shadow-[0_15px_50px_rgba(249,115,22,0.4)]" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-950 dark:text-white">{copy.title}</h2>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    {copy.welcome}
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="ml-auto flex max-w-[85%] items-end justify-end gap-2.5">
                    <div className="break-words rounded-2xl rounded-br-md bg-gradient-to-br from-orange-500 to-amber-500 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm shadow-orange-500/25">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex max-w-[90%] items-start gap-2.5">
                  <SiriOrb size="30px" className="mt-0.5 shrink-0" />
                  <div className="min-w-0 rounded-2xl rounded-tl-md bg-gray-100 px-4 py-2.5 text-sm text-gray-800 shadow-sm dark:bg-gray-800/80 dark:text-gray-100">
                    <SafeAIResponseContent content={msg.content} compact language={language} />
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.actions.map((action) => (
                          <button
                            key={`${msg.id}-${action.id}`}
                            type="button"
                            onClick={() => handleGuidedAction(action, msg.id)}
                            className="rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-orange-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md hover:shadow-orange-500/10 dark:border-orange-900/50 dark:bg-gray-950 dark:text-orange-300 dark:hover:border-orange-800"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {pendingAction && pendingActionMsgId === msg.id && (
                      <AIInlineConfirm
                        message={pendingAction.description ?? (language === "th" ? "กรุณาตรวจสอบก่อนดำเนินการต่อครับ" : "Please review before continuing.")}
                        confirmLabel={language === "th" ? "ยืนยันและเปิดหน้าตรวจสอบ" : "Confirm and open review page"}
                        cancelLabel={language === "th" ? "ยกเลิก" : "Cancel"}
                        onConfirm={() => {
                          const href = pendingAction.href;
                          dismissPendingAction();
                          if (href) router.push(href);
                        }}
                        onCancel={dismissPendingAction}
                      />
                    )}
                  </div>
                </div>
              );
              })
            )}

            {loading && (
              <div className="flex items-center gap-2.5">
                <SiriOrb size="30px" className="shrink-0" />
                <div
                  className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-gray-100 px-4 py-2.5 dark:bg-gray-800/80"
                  role="status"
                  aria-label={copy.thinking}
                >
                  <span className="ai-shimmer-text text-sm font-medium">{copy.thinking}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            {pendingActionPreview && (
              <AIActionPreviewCard
                preview={pendingActionPreview}
                language={language}
                confirming={actionConfirming}
                cancelling={actionCancelling}
                error={actionPreviewError}
                onConfirm={handleConfirmActionPreview}
                onCancel={handleCancelActionPreview}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick questions (only before the conversation starts) — rounded pills */}
          {isEmpty && !loading && (
            <div className="px-3 pb-2">
              <div className="flex flex-wrap justify-center gap-2">
                {copy.quickQuestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => submitQuestion(item)}
                    className="rounded-full border border-gray-200 bg-white/60 px-4 py-2 text-left text-xs font-medium text-gray-700 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-700 hover:shadow-md hover:shadow-orange-500/10 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:border-orange-800 dark:hover:text-orange-300"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input at the bottom — rounded pill */}
          <form
            className="p-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitQuestion();
            }}
          >
            <div className="flex items-end gap-2 rounded-[1.75rem] border border-gray-200 bg-white p-2 pl-4 shadow-sm transition focus-within:border-orange-300 focus-within:shadow-md focus-within:shadow-orange-500/10 dark:border-gray-800 dark:bg-gray-900">
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
                className="max-h-40 min-h-[2.25rem] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
              />
              <AIInputTools
                language={language}
                disabled={loading || actionConfirming || actionCancelling}
                onInsertText={(text) => setInput((v) => (v.trim() ? `${v.trim()} ${text}` : text))}
              />
              <button
                type="submit"
                disabled={loading || actionConfirming || actionCancelling || !input.trim()}
                aria-label={copy.ask}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 px-4 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition-all hover:brightness-105 hover:shadow-md hover:shadow-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">{copy.ask}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Dim overlay — click to dismiss the insights drawer */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 z-30 bg-black/20 backdrop-blur-[1px] dark:bg-black/40"
            aria-hidden
          />
        )}

        {/* Insights drawer — slides in from the right, off-screen until toggled */}
        <aside
          className={`absolute inset-y-0 right-0 z-40 flex w-[340px] max-w-[88vw] flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-gray-800 dark:bg-gray-950 ${
            drawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
          aria-hidden={!drawerOpen}
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
              <Sparkles className="h-4 w-4 text-orange-500" />
              {language === "th" ? "ข้อมูลร้านวันนี้" : "Shop insights"}
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={language === "th" ? "ปิด" : "Close"}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="ai-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <AIInsightsPanel language={language} onCount={setInsightsCount} />
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
            <Sparkles className="h-4 w-4 text-orange-500" />
            {copy.snapshot}
          </h2>
          <MetricCard icon={<TrendingUp className="h-4 w-4" />} label={copy.salesDays} value={formatNumber(salesDays.length, language)} />
          <MetricCard icon={<Wallet className="h-4 w-4" />} label={copy.inventoryValue} value={formatCurrency(inventorySummary?.value ?? 0, language)} />
          <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label={copy.stockRisks} value={formatNumber(stockRisks.length, language)} />
          </div>
        </aside>
    </main>
  );
}
