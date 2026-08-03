"use client";

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { 
  AlertTriangle, 
  Bot, 
  Loader2, 
  PackageSearch, 
  Send, 
  TrendingUp, 
  Wallet, 
  X,
  BarChart2,
  Lightbulb,
  RotateCcw
} from "lucide-react";
import { askOperationsAI, cancelAIAction, confirmAIAction, deleteAIConversation, getOperationsSnapshot } from "@/src/lib/ai";
import {
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
} from "@/src/lib/aiChatStorage";
import { createRequestGeneration } from "@/src/lib/requestGeneration";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import type { AIActionPreview, AIAskResponse, AIConversationMessage, AISnapshot } from "@/src/types/ai";
import AIActionPreviewCard from "@/src/components/shared/AIActionPreviewCard";
import AIResponseContent from "@/src/components/shared/AIResponseContent";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  actions?: AIGuidedAction[];
};

type StoredMessage = Omit<Message, "createdAt"> & {
  createdAt?: string;
};

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
        title: "ผู้ช่วยวิเคราะห์ร้าน AI",
        subtitle: "ถามจากยอดขายและคลังวัตถุดิบล่าสุดของร้าน",
        welcome: "สวัสดีครับ! ยินดีต้อนรับสู่ผู้ช่วยวิเคราะห์ร้านอัจฉริยะ 🤖\n\nผมสามารถวิเคราะห์ประวัติยอดขาย คำนวณกำไร (Margin) ของแต่ละเมนู หรือตรวจสอบวัตถุดิบที่เสี่ยงหมดได้ทันที\n\nคุณมีเรื่องอะไรที่อยากปรึกษาผมในวันนี้ไหมครับ?",
        askPlaceholder: "พิมพ์คำถามของคุณที่นี่...",
        send: "ส่ง",
        thinking: "กำลังวิเคราะห์...",
        model: "โมเดล",
        snapshot: "ข้อมูลร้านค้าปัจจุบัน",
        salesDays: "วันที่มียอดขาย",
        inventoryValue: "มูลค่าคลังสินค้า",
        stockRisks: "วัตถุดิบเสี่ยงหมด",
        stockOut: "หมดสต็อก",
        stockLow: "ใกล้หมด",
        restock: "แนะนำเติม",
        toggleStats: "สถิติร้านค้า",
        toggleStatsTooltip: "เปิด/ปิด แผงควบคุมสถิติข้างเคียง",
        emptyStats: "กำลังโหลดข้อมูลสถิติ...",
        quickQuestions: [
          "สรุปสถานการณ์ร้านวันนี้ให้หน่อย",
          "พรุ่งนี้ควรเตรียมวัตถุดิบอะไรเพิ่ม?",
          "เมนูไหนขายดีและกระทบสต็อกมากที่สุด?",
          "มีความเสี่ยงวัตถุดิบขาดหรือซื้อเกินไหม?",
        ],
      }
    : {
        title: "AI Operations Assistant",
        subtitle: "Analyzing sales and real-time inventory levels",
        welcome: "Hello! Welcome to your Restaurant AI Assistant 🤖\n\nI can analyze your sales history, calculate item margins, or check inventory stock risk in real-time.\n\nWhat would you like me to analyze today?",
        askPlaceholder: "Type your question here...",
        send: "Send",
        thinking: "Analyzing...",
        model: "Model",
        snapshot: "Current Restaurant Stats",
        salesDays: "Sales Days",
        inventoryValue: "Inventory Value",
        stockRisks: "Stock Risks",
        stockOut: "Out",
        stockLow: "Low",
        restock: "Restock",
        toggleStats: "Store Stats",
        toggleStatsTooltip: "Toggle side statistics panel",
        emptyStats: "Loading statistics...",
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
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-950/25 dark:text-orange-300">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-0.5 truncate text-base font-semibold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function AIOperationsFloatingChat() {
  const { activeMembership, user } = useAuth();
  const { language } = useLanguage();
  const { showAIAssistant } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const copy = useMemo(() => buildCopy(language), [language]);
  const labels = useMemo(() => language === "th"
    ? {
        openAssistant: "เปิดผู้ช่วย AI",
        closeAssistant: "ปิดผู้ช่วย AI",
        toggleTips: "เปิดหรือปิดคำถามแนะนำ",
        hideTips: "ซ่อนคำถามแนะนำ",
        toggleStats: "เปิดหรือปิดสถิติร้าน",
        closeStats: "ปิดสถิติร้าน",
        clearChat: "เริ่มแชทใหม่",
      }
    : {
        openAssistant: "Open AI assistant",
        closeAssistant: "Close AI assistant",
        toggleTips: "Toggle suggested questions",
        hideTips: "Hide suggested questions",
        toggleStats: "Toggle restaurant stats",
        closeStats: "Close restaurant stats",
        clearChat: "New chat",
      }, [language]);

  const [isOpen, setIsOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [hasOpenedStats, setHasOpenedStats] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActionPreview, setPendingActionPreview] = useState<AIActionPreview | null>(null);
  const [actionConfirming, setActionConfirming] = useState(false);
  const [actionCancelling, setActionCancelling] = useState(false);
  const [actionPreviewError, setActionPreviewError] = useState("");
  const [latestSnapshot, setLatestSnapshot] = useState<AISnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>();
  const [conversationRequests] = useState(createRequestGeneration);
  const [snapshotRequests] = useState(createRequestGeneration);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatDialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatReturnFocusRef = useRef<HTMLElement | null>(null);
  const snapshotRequestedRef = useRef(false);

  const canAskAI = activeMembership?.role?.name === "owner";

  // Per-(restaurant, user) storage key, shared with the full /ai-assistant page.
  const storageKey = useMemo(
    () => chatStorageKey(activeMembership?.restaurant_id, user?.ID),
    [user, activeMembership],
  );

  // Load shared history for the current (restaurant, user) with TTL + cleanup.
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
        : [{ id: "welcome", role: "assistant", content: copy.welcome, createdAt: new Date() }]);
      setLoading(false);
      setHydratedStorageKey(storageKey);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [conversationRequests, storageKey, copy.welcome]);

  // Persist to the shared key; a lone welcome message is not persisted.
  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    saveMessages(storageKey, messages);
  }, [hydratedStorageKey, messages, storageKey]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      messagesEndRef.current.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!isOpen) return;
    chatReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
      chatReturnFocusRef.current?.focus();
      chatReturnFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    snapshotRequests.invalidate();
    snapshotRequestedRef.current = false;
    setLatestSnapshot(null);
    setSnapshotLoading(false);
  }, [canAskAI, snapshotRequests, storageKey]);

  // Load snapshot in the background once per restaurant/user scope when opened.
  useEffect(() => {
    if (!isOpen || !canAskAI || snapshotRequestedRef.current) return;
    snapshotRequestedRef.current = true;
    const snapshotGeneration = snapshotRequests.begin();
    setSnapshotLoading(true);
    getOperationsSnapshot()
      .then((response) => {
        if (snapshotRequests.isCurrent(snapshotGeneration) && response?.data) {
          setLatestSnapshot((current) => selectOperationsSnapshot(current, response.data));
        }
      })
      .catch((err) => {
        if (snapshotRequests.isCurrent(snapshotGeneration)) {
          snapshotRequestedRef.current = false;
          console.error("Failed to load initial operations snapshot:", err);
        }
      })
      .finally(() => {
        if (snapshotRequests.isCurrent(snapshotGeneration)) setSnapshotLoading(false);
      });
  }, [canAskAI, isOpen, snapshotRequests, storageKey]);

  const conversationHistory = (): AIConversationMessage[] =>
    messages
      .filter((message): message is Message & { role: "user" | "assistant" } => message.role !== "system")
      .slice(-6)
      .map((message) => ({ id: message.id, role: message.role, content: message.content }));

  const resetConversation = useCallback(() => {
    conversationRequests.invalidate();
    setShowTips(true);
    setLoading(false);
    // Also reached when the other chat surface clears: that surface's history is
    // gone, so this one must drop the shared server thread and any pending action.
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

  // Start a fresh chat: drop the stored history and reset to the welcome message.
  const handleClearChat = async () => {
    if (loading || actionConfirming || actionCancelling) return;
    if (pendingActionPreview && !(await discardPendingActionPreview())) return;
    const serverConversationId = conversationId ?? loadStoredConversationId(storageKey);
    if (canAskAI && serverConversationId) {
      void deleteAIConversation(serverConversationId).catch(() => undefined);
    }
    // clearStoredChat broadcasts, so both surfaces run resetConversation. With no
    // storage key there is nothing to broadcast — reset this surface directly.
    if (storageKey) clearStoredChat(storageKey);
    else resetConversation();
  };

  const handleAction = (action: AIGuidedAction) => {
    if (action.prompt) {
      handleSend(action.prompt);
      return;
    }
    if (!action.href) return;
    if (!action.requiresConfirmation) {
      router.push(action.href);
      return;
    }
    setMessages((previous) => [
      ...previous,
      {
        id: `confirm-${previous.length}`,
        role: "assistant",
        content: action.description ?? (language === "th" ? "กรุณาตรวจสอบก่อนดำเนินการต่อครับ" : "Please review before continuing."),
        createdAt: new Date(),
        actions: [
          {
            ...action,
            label: language === "th" ? `ยืนยัน: ${action.label}` : `Confirm: ${action.label}`,
            requiresConfirmation: false,
          },
        ],
      },
    ]);
  };

  const handleSend = async (textToSend = input) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading || actionConfirming || actionCancelling) return;
    if (pendingActionPreview && !(await discardPendingActionPreview())) return;

    setInput("");
    setPendingActionPreview(null);
    setActionPreviewError("");
    
    setMessages((previous) => [
      ...previous,
      { id: `user-${previous.length}`, role: "user", content: trimmed, createdAt: new Date() },
    ]);

    const navigation = resolveNavigationRequest(trimmed, activeMembership, language, pathname);
    if (navigation) {
      setMessages((previous) => [
        ...previous,
        {
          id: `nav-${previous.length}`,
          role: "assistant",
          content: navigation.message,
          createdAt: new Date(),
          actions: navigation.kind === "suggest"
            ? navigation.options.map((option) => ({ id: option.href, ...option }))
            : undefined,
        },
      ]);
      if (navigation.kind === "navigate" && !navigation.alreadyThere) {
        router.push(navigation.href);
      }
      return;
    }

    const clarification = resolveClarificationRequest(trimmed, activeMembership, language);
    if (clarification) {
      setMessages((previous) => [
        ...previous,
        {
          id: `clarify-${previous.length}`,
          role: "assistant",
          content: clarification.message,
          createdAt: new Date(),
          actions: clarification.actions,
        },
      ]);
      return;
    }

    if (!canAskAI) {
      setMessages((previous) => [
        ...previous,
        {
          id: `permission-${previous.length}`,
          role: "assistant",
          content: language === "th"
            ? "ผมช่วยพาไปหน้าเมนูที่คุณเข้าถึงได้ครับ ส่วนผู้ช่วย AI สำหรับข้อมูลร้านเปิดให้เจ้าของร้านเท่านั้น"
            : "I can guide you to pages you can access. The restaurant AI assistant is available to the owner only.",
          createdAt: new Date(),
        },
      ]);
      return;
    }

    const requestGeneration = conversationRequests.begin();
    setLoading(true);

    try {
      const response = await askOperationsAI(trimmed, conversationHistory(), conversationId);
      // The chat was cleared or switched restaurants while this was in flight —
      // drop the answer instead of appending it to a conversation it never joined.
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      const data: AIAskResponse = response.data;
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
        saveConversationId(storageKey, data.conversation_id);
      }
      
      const assistantMsg: Message = {
        id: data.turn_id ? `${data.turn_id}-assistant` : `ai-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        createdAt: new Date(),
        actions: data.intent === "unclear"
          ? getUnclearRequestActions(activeMembership, language)
          : data.intent === "analysis"
            ? getGuidedActions(trimmed, data.answer, activeMembership, language, data.tool)
            : undefined,
      };
      
      setMessages(prev => [...prev, assistantMsg]);

      if (data.action_preview) {
        setPendingActionPreview(data.action_preview);
      }
      
      if (data.snapshot) {
        snapshotRequests.invalidate();
        setSnapshotLoading(false);
        setLatestSnapshot((current) => selectOperationsSnapshot(current, data.snapshot));
      }
    } catch (err: unknown) {
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      console.error(err);
      let errorMessage =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : "";
          
      // Bulletproof local quota check
      if (errorMessage && (
        errorMessage.includes("429") || 
        errorMessage.includes("quota") || 
        errorMessage.includes("RESOURCE_EXHAUSTED") || 
        errorMessage.includes("exhausted")
      )) {
        errorMessage = language === "th"
          ? "โควต้าการใช้งาน AI ชั่วคราวของคุณหมดลงแล้วครับ กรุณารอประมาณ 1 นาทีแล้วลองใหม่อีกครั้งนะครับ (API Quota Exceeded)"
          : "Temporary AI quota exceeded. Please wait about 1 minute and try again! (API Quota Exceeded)";
      }
          
      setMessages((previous) => [
        ...previous,
        {
          id: `err-${previous.length}`,
          role: "system",
          content: errorMessage || copy.thinking.replace("กำลังวิเคราะห์...", "เกิดข้อผิดพลาดในการเชื่อมต่อกรุณาลองใหม่อีกครั้ง"),
          createdAt: new Date(),
        },
      ]);
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

  // Hide the floating widget on the dedicated AI assistant page to avoid two
  // chat surfaces at once (they share the same history).
  if (!activeMembership || !showAIAssistant || pathname === "/ai-assistant") return null;

  const salesDays = latestSnapshot?.sales_days ?? [];
  const stockRisks = latestSnapshot?.stock_risks ?? [];
  const inventorySummary = latestSnapshot?.inventory_summary;

  return (
    <>
      {/* Local motion keeps the floating assistant responsive without page-level choreography. */}
      <style>{`
        @keyframes messageSlideUp {
          0% { transform: translateY(8px); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-message-slide {
          animation: messageSlideUp 180ms cubic-bezier(0.2, 0, 0, 1) both;
        }
        .focus-glow:focus {
          border-color: rgb(249 115 22);
          box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-message-slide {
            animation: none !important;
          }
        }
      `}</style>

      {/* Chat Window Panel */}
      <div 
        className={`fixed inset-x-3 bottom-3 top-3 z-[var(--z-chat)] flex items-stretch origin-bottom-right transition-[opacity,transform] duration-200 ease-out ${
          isOpen
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-[0.98] pointer-events-none"
        } sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[380px] md:w-[400px]`}
      >
        {/* Stats drawer moves and scales as one surface so its cards enter together. */}
        <div 
          id="ai-operations-stats"
          className={`absolute inset-y-0 right-full mr-3 hidden w-[340px] flex-col rounded-md border border-gray-200 bg-white p-3 shadow-xl shadow-gray-950/10 transform-gpu origin-right transition-[opacity,transform] duration-200 ease-out dark:border-gray-800 dark:bg-gray-950 dark:shadow-black/30 lg:flex xl:w-[360px] ${
            showStats
              ? "translate-x-0 opacity-100 pointer-events-auto"
              : hasOpenedStats
                ? "pointer-events-none translate-x-2 opacity-0"
                : "pointer-events-none translate-x-2 opacity-0"
          }`}
        >
          <div className="flex h-full w-full shrink-0 flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-orange-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{copy.snapshot}</h3>
              </div>
              <button
                type="button"
                aria-label={labels.closeStats}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStats(false);
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {snapshotLoading && !latestSnapshot ? (
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                <p className="mt-3 text-xs">{copy.emptyStats}</p>
              </div>
            ) : (
              <div className="mt-4 flex-1 overflow-y-auto space-y-4 px-2 pr-2 scrollbar-thin">
                <div className="grid grid-cols-1 gap-2.5">
                  <MetricCard
                    icon={<TrendingUp className="h-4.5 w-4.5" />}
                    label={copy.salesDays}
                    value={formatNumber(salesDays.length, language)}
                  />
                  <MetricCard
                    icon={<Wallet className="h-4.5 w-4.5" />}
                    label={copy.inventoryValue}
                    value={formatCurrency(inventorySummary?.value ?? 0, language)}
                  />
                  <MetricCard
                    icon={<AlertTriangle className="h-4.5 w-4.5" />}
                    label={copy.stockRisks}
                    value={formatNumber(stockRisks.length, language)}
                  />
                </div>

                <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3.5 py-2.5 dark:border-gray-800 dark:bg-gray-900/40">
                    <PackageSearch className="h-4.5 w-4.5 text-orange-500" />
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{copy.stockRisks}</span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[220px] overflow-y-auto scrollbar-thin">
                    {stockRisks.map((item) => (
                      <div key={item.name} className="p-3 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-900/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{item.name}</p>
                            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                              {formatNumber(item.stock, language)} {item.unit}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wider ${
                              item.status === "out"
                                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                            }`}
                          >
                            {item.status === "out" ? copy.stockOut : copy.stockLow}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                          {copy.restock} <span className="font-semibold text-orange-600 dark:text-orange-400">{formatNumber(item.restock_estimate, language)}</span> {item.unit}
                        </p>
                      </div>
                    ))}
                    {stockRisks.length === 0 && (
                      <div className="p-4 text-center text-xs text-gray-400 dark:text-gray-500">
                        {language === "th" ? "ไม่มีสินค้าคลังเสี่ยงหมด" : "No high risk inventory items"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Overlay Box */}
        <div className="relative isolate flex h-full w-full shrink-0 rounded-md">
          <div
            ref={chatDialogRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby="ai-operations-chat-title"
            className="relative z-10 flex h-full w-full flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl shadow-gray-950/10 transition-shadow duration-200 dark:border-gray-800 dark:bg-gray-950 dark:shadow-black/30"
          >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/50 sm:px-4">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300">
                  <Bot className="h-5 w-5" />
                </span>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-gray-950"></span>
              </div>
              <div className="flex items-center">
                <h2 id="ai-operations-chat-title" className="text-sm font-semibold leading-none text-gray-900 dark:text-white">{copy.title}</h2>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Tips Toggle Button (Lightbulb) */}
              {messages.length <= 1 && (
                <button
                  type="button"
                  aria-label={labels.toggleTips}
                  aria-pressed={showTips}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTips(!showTips);
                  }}
                  title={language === "th" ? "เปิด/ปิดคำถามแนะนำ" : "Toggle Suggested Questions"}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors active:scale-[0.98] sm:h-10 sm:w-10 ${
                    showTips
                      ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
                      : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Lightbulb className="h-4.5 w-4.5" />
                </button>
              )}
              {/* Stats Panel Toggle Button with tactile scale click */}
              {canAskAI && (
                <button
                  type="button"
                  aria-label={labels.toggleStats}
                  aria-expanded={showStats}
                  aria-controls="ai-operations-stats"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!showStats) {
                      setHasOpenedStats(true);
                    }
                    setShowStats(!showStats);
                  }}
                  title={copy.toggleStatsTooltip}
                  className={`hidden h-11 w-11 items-center justify-center rounded-md transition-colors active:scale-[0.98] sm:h-10 sm:w-10 lg:inline-flex ${
                    showStats
                      ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
                      : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <BarChart2 className="h-4.5 w-4.5" />
                </button>
              )}
              {/* New Chat / Clear History */}
              {messages.length > 1 && (
                <button
                  type="button"
                  aria-label={labels.clearChat}
                  title={labels.clearChat}
                  disabled={loading || actionConfirming || actionCancelling}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleClearChat();
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white sm:h-10 sm:w-10"
                >
                  <RotateCcw className="h-4.5 w-4.5" />
                </button>
              )}
              {/* Close Panel */}
              <button
                type="button"
                aria-label={labels.closeAssistant}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white sm:h-10 sm:w-10"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Chat Messages Body with custom scrollbar and entry animation */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 scrollbar-thin">
            {messages.map((msg) => {
              if (msg.role === "system") {
                return (
                  <div key={msg.id} className="w-full text-center py-2 text-xs text-red-500 dark:text-red-400 font-medium animate-message-slide">
                    {msg.content}
                  </div>
                );
              }

              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex items-end gap-2.5 justify-end max-w-[90%] ml-auto animate-message-slide">
                    {/* User Message Bubble (Rounded on all sides) */}
                    <div className="max-w-full break-words rounded-md bg-gray-900 px-4 py-3 text-xs leading-relaxed text-white dark:bg-white dark:text-gray-900 sm:text-[13px]">
                      {msg.content}
                    </div>
                    {/* User Avatar */}
                    <div className="h-8 w-8 flex-none shrink-0 overflow-hidden rounded-full border border-gray-200 dark:border-gray-800">
                      {user?.profile_image ? (
                        <Image src={user.profile_image} width={32} height={32} unoptimized className="h-full w-full object-cover" alt="" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-orange-100 text-[11px] font-semibold text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 uppercase">
                          {user?.nickname?.charAt(0) || user?.first_name?.charAt(0) || "U"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Assistant/AI message
              return (
                <div key={msg.id} className="flex items-end gap-2.5 justify-start max-w-[90%] animate-message-slide">
                  {/* AI Avatar */}
                  <div className="flex h-8 w-8 flex-none shrink-0 items-center justify-center rounded-full border border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-950/50 dark:bg-orange-950/30 dark:text-orange-300">
                    <Bot className="h-4.5 w-4.5" />
                  </div>
                  {/* AI Message Bubble (Rounded on all sides) */}
                  <div className="max-w-full break-words rounded-md bg-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-800 dark:bg-gray-800 dark:text-gray-100 sm:text-[13px]">
                    <AIResponseContent content={msg.content} compact />
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.actions.map((action) => (
                          <button
                            key={`${msg.id}-${action.id}`}
                            type="button"
                            onClick={() => handleAction(action)}
                            className="min-h-10 rounded-md border border-orange-200 bg-white px-3 py-2 text-[11px] font-semibold text-orange-700 transition-colors hover:bg-gray-50 dark:border-orange-900/50 dark:bg-gray-950 dark:text-orange-300 dark:hover:bg-gray-900"
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
              <div className="flex items-end gap-2.5 justify-start max-w-[90%] animate-message-slide">
                {/* AI Avatar */}
                <div className="flex h-8 w-8 flex-none shrink-0 items-center justify-center rounded-full border border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-950/50 dark:bg-orange-950/30 dark:text-orange-300">
                  <Bot className="h-4.5 w-4.5" />
                </div>
                {/* Loading Bubble */}
                <div
                  role="status"
                  aria-label={copy.thinking}
                  className="flex items-center rounded-md bg-gray-100 px-3.5 py-3 text-xs leading-relaxed text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                >
                  <span className="sr-only">{copy.thinking}</span>
                  <span aria-hidden="true" className="flex items-center gap-1.5 text-orange-500 dark:text-orange-400">
                    <span className="ai-thinking-dot"></span>
                    <span className="ai-thinking-dot"></span>
                    <span className="ai-thinking-dot"></span>
                  </span>
                </div>
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

          {/* Quick Questions suggestion overlay with slide-up entrance */}
          {messages.length <= 1 && !loading && showTips && (
            <div className="animate-message-slide border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/40 sm:p-3.5">
              <div className="flex flex-col gap-2">
                {/* Tips Header with Close Button */}
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                    {language === "th" ? "💡 คำถามแนะนำ" : "💡 Suggested Questions"}
                  </span>
                  <button
                    type="button"
                    aria-label={labels.hideTips}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTips(false);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
                    title={language === "th" ? "ซ่อนคำแนะนำ" : "Hide Suggestions"}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {copy.quickQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSend(q);
                    }}
                    className="min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-[12px] font-semibold text-gray-700 transition-colors hover:border-orange-300 hover:bg-gray-50 hover:text-orange-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-orange-800 dark:hover:bg-gray-900 dark:hover:text-orange-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Form Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-b-md border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950 sm:p-3.5"
          >
            <div className="flex items-center gap-2.5">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={copy.askPlaceholder}
                disabled={loading || actionConfirming || actionCancelling}
                aria-label={copy.askPlaceholder}
                className="min-h-11 flex-1 rounded-md border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium !text-gray-950 placeholder-gray-500 outline-none transition-[border-color,box-shadow] focus-glow dark:border-gray-800 dark:bg-gray-900 dark:!text-gray-50 dark:placeholder-gray-400"
              />
              <button
                type="submit"
                aria-label={copy.send}
                disabled={loading || actionConfirming || actionCancelling || !input.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gray-950 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>

      {/* Floating Circular Trigger Button — fades out as the droplet expands over it */}
      <button
        type="button"
        aria-label={labels.openAssistant}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 z-[var(--z-chat)] flex h-14 w-14 items-center justify-center rounded-md border border-gray-800 bg-gray-950 text-white shadow-xl shadow-gray-950/15 transition-[opacity,transform,background-color] duration-200 ease-out hover:bg-gray-800 active:scale-[0.98] dark:border-white/10 dark:bg-white dark:text-gray-950 dark:shadow-black/30 dark:hover:bg-gray-200 sm:bottom-6 sm:right-6 ${
          isOpen 
            ? "opacity-0 scale-95 pointer-events-none"
            : "opacity-100 scale-100 pointer-events-auto"
        }`}
      >
        <span className="flex h-6 w-6 items-center justify-center">
          <Bot className="h-6 w-6" />
        </span>
      </button>
    </>
  );
}
