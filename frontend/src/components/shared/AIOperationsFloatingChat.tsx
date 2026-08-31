"use client";

import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  PackageSearch,
  Send,
  TrendingUp,
  Wallet,
  X,
  BarChart2,
  Lightbulb,
  RotateCcw,
  ChevronDown
} from "lucide-react";
import SiriOrb from "@/src/components/ui/siri-orb";
import AIInputTools from "@/src/components/shared/AIInputTools";
import { askOperationsAI, cancelAIAction, cancelAIActionPlan, confirmAIAction, confirmAIActionPlan, deleteAIConversation, getOperationsSnapshot, normalizeAIAnswer, readAIOutage } from "@/src/lib/ai";
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
import { useTheme } from "@/src/providers/ThemeProvider";
import type { AIActionPlan, AIActionPreview, AIAskResponse, AIConversationMessage, AISnapshot } from "@/src/types/ai";
import AIActionPreviewCard from "@/src/components/shared/AIActionPreviewCard";
import InlineDbConfirmBar from "@/src/components/shared/InlineDbConfirmBar";
import AIOutageNotice, { type AIOutage } from "@/src/components/shared/AIOutageNotice";
import SafeAIResponseContent from "@/src/components/shared/SafeAIResponseContent";
import AIInlineConfirm from "@/src/components/shared/AIInlineConfirm";

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
          "สรุปร้าน",
          "เมนูขายดี",
          "วัตถุดิบใกล้หมด",
          "มูลค่าสต๊อก",
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
        clearChatConfirm: "เริ่มแชทใหม่จะลบบทสนทนานี้ทิ้งทั้งหมด และผู้ช่วยจะจำเรื่องที่คุยกันไว้ไม่ได้อีก",
        clearChatYes: "ลบแล้วเริ่มใหม่",
        clearChatNo: "ไม่ลบ",
        scrollToLatest: "ไปที่ข้อความล่าสุด",
      }
    : {
        openAssistant: "Open AI assistant",
        closeAssistant: "Close AI assistant",
        toggleTips: "Toggle suggested questions",
        hideTips: "Hide suggested questions",
        toggleStats: "Toggle restaurant stats",
        closeStats: "Close restaurant stats",
        clearChat: "New chat",
        clearChatConfirm: "Starting a new chat deletes this conversation, and the assistant will not remember any of it.",
        clearChatYes: "Delete and start over",
        clearChatNo: "Keep it",
        scrollToLatest: "Jump to the latest message",
      }, [language]);

  const [isOpen, setIsOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [hasOpenedStats, setHasOpenedStats] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [outage, setOutage] = useState<AIOutage | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [pendingActionPreview, setPendingActionPreview] = useState<AIActionPreview | null>(null);
  // Multi-item action plans (stock, menu, expense commands). This surface used to
  // ignore them entirely: the answer said "press confirm" and no confirm bar was
  // ever drawn, so a command typed here could never be carried out. It did not
  // show while phones were redirected to the full page, and became reachable the
  // moment the floating chat started opening as a sheet on mobile.
  const [pendingActionPlan, setPendingActionPlan] = useState<AIActionPlan | null>(null);
  const [actionConfirming, setActionConfirming] = useState(false);
  const [actionCancelling, setActionCancelling] = useState(false);
  const [actionPreviewError, setActionPreviewError] = useState("");
  const [latestSnapshot, setLatestSnapshot] = useState<AISnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>();
  const [conversationRequests] = useState(createRequestGeneration);
  const [snapshotRequests] = useState(createRequestGeneration);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Whether the thread is scrolled to its end. The jump button only earns its
  // place when it is not: shown always, it covers a message to offer a trip to
  // where the reader already is.
  const [atLatest, setAtLatest] = useState(true);
  // Clearing deletes the conversation on the server as well, and there is no
  // undo, so the button asks first. It used to wipe the thread on one stray tap.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const chatDialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatReturnFocusRef = useRef<HTMLElement | null>(null);
  const snapshotRequestedRef = useRef(false);
  const chatWriteSourceRef = useRef(Symbol("ai-floating-chat"));

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
    setPendingActionPlan(null);
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
    setPendingActionPlan(null);
    setActionConfirming(false);
    setActionCancelling(false);
    setActionPreviewError("");
    setMessages([{ id: "welcome", role: "assistant", content: copy.welcome, createdAt: new Date() }]);
  }, [conversationRequests, copy.welcome]);

  useEffect(() => subscribeToChatClear((clearedKey) => {
    if (clearedKey === storageKey) resetConversation();
  }), [resetConversation, storageKey]);

  // Start a fresh chat: drop the stored history and reset to the welcome message.
  // How far from the bottom still counts as "at the latest". A couple of lines of
  // slack, so the button does not flash on the half-pixel drift a smooth scroll
  // leaves behind.
  const scrollSlack = 48;

  const handleThreadScroll = () => {
    const area = scrollAreaRef.current;
    if (!area) return;
    setAtLatest(area.scrollHeight - area.scrollTop - area.clientHeight <= scrollSlack);
  };

  const jumpToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const handleClearChat = async () => {
    if (loading || actionConfirming || actionCancelling) return;
    setConfirmingClear(false);
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
    // The pending plan deliberately survives a new question. Clearing it here hid
    // the confirm bar while the server still held the plan, and the server answers
    // the next command with "there is still something waiting — confirm or cancel
    // it above" over a box that is no longer on screen. The owner could then
    // neither confirm nor cancel, and had to wait out the expiry. The bar carries
    // its own countdown and terminal states, so leaving it up is safe.
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
    // Kept for the outage card's retry button, and cleared here so a card from a
    // previous failure does not sit under a question that has since succeeded.
    setLastQuestion(trimmed);
    setOutage(null);
    setLoading(true);

    try {
      const response = await askOperationsAI(trimmed, conversationHistory(), conversationId);
      // The chat was cleared or switched restaurants while this was in flight —
      // drop the answer instead of appending it to a conversation it never joined.
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      const data: AIAskResponse = response.data;
      const answer = normalizeAIAnswer(data?.answer);
      if (!answer) throw new Error("AI response did not contain a valid answer");
      if (data.conversation_id) {
        setConversationId(data.conversation_id);
        saveConversationId(storageKey, data.conversation_id, chatWriteSourceRef.current);
      }
      
      const assistantMsg: Message = {
        id: data.turn_id ? `${data.turn_id}-assistant` : `ai-${Date.now()}`,
        role: "assistant",
        content: formatAIActionPreviewAnswer(answer, data.action_preview, language),
        createdAt: new Date(),
        actions: data.intent === "unclear"
          ? getUnclearRequestActions(activeMembership, language)
          : data.intent === "analysis"
            ? getGuidedActions(trimmed, answer, activeMembership, language, data.tool, data.scope_assumed)
            : undefined,
      };
      
      setMessages(prev => [...prev, assistantMsg]);

      if (data.action_preview) {
        setPendingActionPreview(data.action_preview);
      }

      if (data.action_plan) {
        setPendingActionPlan(data.action_plan);
      }
      
      if (data.snapshot) {
        snapshotRequests.invalidate();
        setSnapshotLoading(false);
        setLatestSnapshot((current) => selectOperationsSnapshot(current, data.snapshot));
      }
    } catch (err: unknown) {
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      console.error(err);
      // An outage is reported by the backend as a code, not as English words in
      // the message. This used to sniff the message for "429"/"quota"/"exhausted"
      // and the message arrives in Thai, so a quota outage never matched: the
      // owner saw a bare error line with no wait and no retry, while the full AI
      // page showed a proper card for the same failure.
      const reportedOutage = readAIOutage(err);
      if (reportedOutage) {
        setOutage(reportedOutage);
        return;
      }
      const errorMessage =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : "";

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

  // Plan confirm/cancel mirror the full AI page: the outcome is reported per item,
  // so a batch that partly failed says so instead of reading as a clean success.
  const handlePlanConfirm = async () => {
    const plan = pendingActionPlan;
    if (!plan) return;
    const response = await confirmAIActionPlan(plan.id, plan.confirmation_token);
    setMessages((previous) => [
      ...previous,
      {
        id: `plan-${response.data.plan_id}`,
        role: "assistant",
        content: response.data.message,
        createdAt: new Date(),
      },
    ]);
    // A confirmed plan changed the shop, so the cached snapshot behind the stats
    // panel is stale — drop it and let the next read refetch.
    snapshotRequests.invalidate();
    // HTTP 200 with nothing changed: the failure lives in the body, so it has to
    // be raised or the bar paints green over a plan that did nothing.
    if (response.data.succeeded === 0 && response.data.failed > 0) {
      throw new Error(response.data.message);
    }
  };

  const handlePlanCancel = () => {
    const plan = pendingActionPlan;
    if (!plan) return;
    cancelAIActionPlan(plan.id).catch(() => undefined);
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
        /* Phone sheet only: the message list dissolves into the canvas under the
           floating controls instead of ending at a hard edge. From sm up the panel
           has a real header bar, so no fade there. */
        @media (max-width: 639px) {
          .ai-sheet-fade {
            -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 3.25rem);
            mask-image: linear-gradient(to bottom, transparent 0, #000 3.25rem);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-message-slide {
            animation: none !important;
          }
        }
      `}</style>

      {/* Chat Window Panel.
          Phone: a bottom sheet that slides up in place (Meta-style) — tap the orb
          and the chat rises over the current page, no navigation. It sits flush to
          the bottom and leaves a peek of the page at the top. Slide is a transform
          so it reads as motion, not a fade.
          sm+: the docked bottom-right card, unchanged — sm:translate-y-0 cancels the
          sheet transform and it fades with opacity as before. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[var(--z-chat)] flex h-[88dvh] items-stretch transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        } ${isOpen ? "pointer-events-auto" : "pointer-events-none"} sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[380px] sm:translate-y-0 sm:transition-opacity md:w-[400px] ${
          isOpen ? "sm:opacity-100" : "sm:opacity-0"
        }`}
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
              <div className="flex flex-1 flex-col items-center justify-center py-10 text-gray-500">
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
                            <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-500">
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
                      <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-500">
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
            className="relative z-10 flex h-full w-full flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-gray-200 bg-[#faf8f2] shadow-xl shadow-gray-950/10 transition-shadow duration-200 dark:border-gray-800 dark:bg-gray-950 dark:shadow-black/30 sm:rounded-2xl sm:bg-white"
          >
          {/* No header bar at any width. The phone had one treatment and the desktop
              another — a titled, bordered bar — and the owner preferred the phone's:
              the panel is small enough that a bar naming what you just opened spends
              a row of it saying nothing. The controls float over the canvas instead,
              and the ones that only make sense on a wider screen keep their own
              width gates rather than living in a separate header. */}
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            {messages.length <= 1 && (
              <button
                type="button"
                aria-label={labels.toggleTips}
                aria-pressed={showTips}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTips(!showTips);
                }}
                className={`hidden h-8 w-8 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-all active:scale-95 sm:inline-flex ${
                  showTips
                    ? "border-orange-200 bg-orange-50/90 text-orange-600 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300"
                    : "border-gray-200/80 bg-white/80 text-gray-600 dark:border-gray-800/80 dark:bg-gray-900/70 dark:text-gray-300"
                }`}
              >
                <Lightbulb className="h-3.5 w-3.5" />
              </button>
            )}
            {messages.length > 1 && (
              <button
                type="button"
                aria-label={labels.toggleStats}
                aria-pressed={showStats}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!showStats) {
                    setHasOpenedStats(true);
                  }
                  setShowStats(!showStats);
                }}
                className={`hidden h-8 w-8 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-all active:scale-95 lg:inline-flex ${
                  showStats
                    ? "border-orange-200 bg-orange-50/90 text-orange-600 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300"
                    : "border-gray-200/80 bg-white/80 text-gray-600 dark:border-gray-800/80 dark:bg-gray-900/70 dark:text-gray-300"
                }`}
              >
                <BarChart2 className="h-3.5 w-3.5" />
              </button>
            )}
            {messages.length > 1 && (
              <button
                type="button"
                aria-label={labels.clearChat}
                disabled={loading || actionConfirming || actionCancelling}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingClear(true);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-600 shadow-sm backdrop-blur transition-all active:scale-95 disabled:opacity-50 dark:border-gray-800/80 dark:bg-gray-900/70 dark:text-gray-300"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              aria-label={labels.closeAssistant}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-600 shadow-sm backdrop-blur transition-all active:scale-95 dark:border-gray-800/80 dark:bg-gray-900/70 dark:text-gray-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Chat Messages Body with custom scrollbar and entry animation.
              Phone: extra top padding clears the floating controls, and the same
              top fade as the AI page lets content dissolve instead of being cut. */}
          <div
            ref={scrollAreaRef}
            onScroll={handleThreadScroll}
            className="ai-sheet-fade flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-14 space-y-4 scrollbar-thin sm:px-4 sm:pt-4"
          >
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
                  <div key={msg.id} className="ml-auto flex max-w-[96%] items-end justify-end gap-2.5 animate-message-slide sm:max-w-[90%]">
                    <div className="max-w-full break-words rounded-2xl rounded-br-md bg-gradient-to-br from-orange-500 to-amber-500 px-4 py-2.5 text-xs leading-relaxed text-white shadow-sm shadow-orange-500/25 sm:text-[13px]">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Assistant/AI message
              return (
                <div key={msg.id} className="flex max-w-full items-start gap-2.5 animate-message-slide sm:max-w-[90%]">
                  <SiriOrb size="30px" className="mt-0.5 shrink-0" animationDuration={8} />
                  <div className="min-w-0 break-words rounded-2xl rounded-tl-md bg-gray-100 px-4 py-2.5 text-xs leading-relaxed text-gray-800 shadow-sm dark:bg-gray-800/80 dark:text-gray-100 sm:text-[13px]">
                    <SafeAIResponseContent content={msg.content} compact language={language} />
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.actions.map((action) => (
                          <button
                            key={`${msg.id}-${action.id}`}
                            type="button"
                            onClick={() => handleAction(action)}
                            className="min-h-9 rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold text-orange-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md hover:shadow-orange-500/10 dark:border-orange-900/50 dark:bg-gray-950 dark:text-orange-300 dark:hover:border-orange-800"
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
              <div className="flex items-center gap-2.5 animate-message-slide">
                <SiriOrb size="30px" className="shrink-0" animationDuration={8} />
                <div
                  role="status"
                  aria-label={copy.thinking}
                  className="flex items-center rounded-2xl rounded-tl-md bg-gray-100 px-4 py-2.5 dark:bg-gray-800/80"
                >
                  <span className="ai-shimmer-text text-xs font-medium sm:text-[13px]">{copy.thinking}</span>
                </div>
              </div>
            )}
            {outage && (
              <AIOutageNotice
                language={language}
                outage={outage}
                retrying={loading}
                onRetry={() => {
                  const question = lastQuestion;
                  setOutage(null);
                  if (question) void handleSend(question);
                }}
              />
            )}
            {pendingActionPlan && pendingActionPlan.items.length > 0 && (
              <InlineDbConfirmBar
                key={pendingActionPlan.id}
                summary={pendingActionPlan.summary}
                items={pendingActionPlan.items.map((planItem) => ({
                  title: planItem.title,
                  change: planItem.change,
                  unit: planItem.unit,
                  sideEffects: planItem.side_effects,
                }))}
                warnings={pendingActionPlan.warnings}
                detail={language === "th"
                  ? `แก้ข้อมูลจริง ${pendingActionPlan.items.length} รายการ`
                  : `changes ${pendingActionPlan.items.length} record(s)`}
                expiresAt={pendingActionPlan.expires_at}
                onConfirm={handlePlanConfirm}
                onCancel={handlePlanCancel}
                language={language}
              />
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
                    className="min-h-10 w-full rounded-xl border border-gray-200 bg-white/70 px-3.5 py-2 text-left text-[12px] font-medium text-gray-700 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-700 hover:shadow-md hover:shadow-orange-500/10 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:border-orange-800 dark:hover:text-orange-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Asked before the thread is deleted, not after. The server copy goes
              too and there is no undo, so a stray tap on a small screen used to
              cost the whole conversation. */}
          {confirmingClear && (
            <div className="px-3 pb-2 sm:px-4">
              <AIInlineConfirm
                message={labels.clearChatConfirm}
                confirmLabel={labels.clearChatYes}
                cancelLabel={labels.clearChatNo}
                onConfirm={() => void handleClearChat()}
                onCancel={() => setConfirmingClear(false)}
                disabled={loading || actionConfirming || actionCancelling}
              />
            </div>
          )}

          {/* A way back to the newest message once the reader has scrolled up.
              It sits just above the input and only appears when there is
              somewhere to go, so it never covers a message the reader is on. */}
          {!atLatest && messages.length > 1 && (
            <div className="pointer-events-none relative z-20 h-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  jumpToLatest();
                }}
                aria-label={labels.scrollToLatest}
                title={labels.scrollToLatest}
                className="pointer-events-auto absolute -top-11 left-1/2 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200/80 bg-white/90 text-gray-600 shadow-md backdrop-blur transition-all hover:-translate-y-0.5 hover:text-orange-600 active:scale-95 dark:border-gray-700/80 dark:bg-gray-900/90 dark:text-gray-300 dark:hover:text-orange-300"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Input Form Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            onClick={(e) => e.stopPropagation()}
            /* Phone: the pill floats on the canvas with no bar or divider above it,
               matching the full AI page. sm+ keeps the bordered footer. */
            className="bg-transparent px-3 pb-3 pt-1 dark:bg-transparent sm:rounded-b-2xl sm:border-t sm:border-gray-200 sm:bg-white sm:p-3.5 sm:dark:border-gray-800 sm:dark:bg-gray-950"
          >
            <div className="flex items-end gap-2 rounded-[1.5rem] border border-gray-200 bg-white p-1.5 shadow-sm transition focus-within:border-orange-300 focus-within:shadow-md focus-within:shadow-orange-500/10 dark:border-gray-800 dark:bg-gray-900">
              <AIInputTools
                tools={["scan"]}
                language={language}
                disabled={loading || actionConfirming || actionCancelling}
                onInsertText={(text) => setInput((v) => (v.trim() ? `${v.trim()} ${text}` : text))}
              />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={copy.askPlaceholder}
                disabled={loading || actionConfirming || actionCancelling}
                aria-label={copy.askPlaceholder}
                className="min-h-9 min-w-0 flex-1 bg-transparent py-1.5 text-sm font-medium !text-gray-950 placeholder-gray-400 outline-none dark:!text-gray-50 dark:placeholder-gray-500"
              />
              <AIInputTools
                tools={["voice"]}
                language={language}
                disabled={loading || actionConfirming || actionCancelling}
                onInsertText={(text) => setInput((v) => (v.trim() ? `${v.trim()} ${text}` : text))}
              />
              <button
                type="submit"
                aria-label={copy.send}
                disabled={loading || actionConfirming || actionCancelling || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/30 transition-all hover:brightness-105 hover:shadow-md hover:shadow-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>

      {/* Floating Circular Trigger Button — fades out as the droplet expands over it.
          Tapping it opens the chat in place everywhere: a bottom sheet on a phone,
          the docked card on a larger screen. It no longer navigates away. */}
      <button
        type="button"
        aria-label={labels.openAssistant}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 z-[var(--z-chat)] flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-xl shadow-orange-500/30 transform-gpu transition-[opacity,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-orange-500/40 active:scale-[0.98] sm:bottom-6 sm:right-6 ${
          isOpen
            ? "opacity-0 scale-95 pointer-events-none"
            : "opacity-100 scale-100 pointer-events-auto"
        }`}
      >
        <SiriOrb size="66px" className="shrink-0" animationDuration={8} />
      </button>
    </>
  );
}
