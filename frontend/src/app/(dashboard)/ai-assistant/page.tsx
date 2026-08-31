"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Bell, Bot, ChevronDown, Loader2, RotateCcw, Send, Settings, Square, X } from "lucide-react";
import { askOperationsAI, cancelAIAction, cancelAIActionPlan, confirmAIAction, confirmAIActionPlan, deleteAIConversation, normalizeAIAnswer, readAIOutage } from "@/src/lib/ai";
import AIOutageNotice, { type AIOutage } from "@/src/components/shared/AIOutageNotice";
import {
  formatAIActionPreviewAnswer,
  formatAIActionConfirmationMessage,
  getAIActionCancellationErrorMessage,
  getAIActionErrorMessage,
  isTerminalAIActionCancellationError,
} from "@/src/lib/aiActionPreview";
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
import type { AIActionPreview, AIActionPlan, AIConversationMessage, AIForecastResult, AIChartData } from "@/src/types/ai";
import AIActionPreviewCard from "@/src/components/shared/AIActionPreviewCard";
import InlineDbConfirmBar from "@/src/components/shared/InlineDbConfirmBar";
import AIInlineConfirm from "@/src/components/shared/AIInlineConfirm";
import AIInputTools from "@/src/components/shared/AIInputTools";
import AISettingsModal from "@/src/components/shared/AISettingsModal";
import ForecastChart from "@/src/components/shared/ForecastChart";
import AIChart from "@/src/components/shared/AIChart";
import AIInsightsPanel from "@/src/components/shared/AIInsightsPanel";
import HoverTip from "@/src/components/shared/HoverTip";
import SafeAIResponseContent from "@/src/components/shared/SafeAIResponseContent";
import VoiceWaveform from "@/src/components/shared/VoiceWaveform";
import SiriOrb from "@/src/components/ui/siri-orb";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  actions?: AIGuidedAction[];
  model?: string;
  forecast?: AIForecastResult;
  chart?: AIChartData;
};

type StoredMessage = Omit<Message, "createdAt"> & { createdAt?: string };

function buildCopy(language: "th" | "en") {
  return language === "th"
    ? {
        title: "ผู้ช่วยวิเคราะห์ร้าน",
        askPlaceholder: "พิมพ์คำถามของคุณที่นี่...",
        ask: "ถาม AI",
        thinking: "กำลังวิเคราะห์",
        newChat: "เริ่มแชทใหม่",
        newChatConfirm: "เริ่มแชทใหม่จะลบบทสนทนานี้ทิ้งทั้งหมด และผู้ช่วยจะจำเรื่องที่คุยกันไว้ไม่ได้อีก",
        newChatYes: "ลบแล้วเริ่มใหม่",
        newChatNo: "ไม่ลบ",
        scrollToLatest: "ไปที่ข้อความล่าสุด",
        permissionDenied: "หน้านี้สำหรับเจ้าของร้านเท่านั้น",
        welcome: "สวัสดีครับ ผมเป็นผู้ช่วยวิเคราะห์ร้าน ถามผมได้เลยเรื่องยอดขาย กำไรเมนู หรือคลังวัตถุดิบครับ",
        error: "เรียก AI ไม่สำเร็จ",
        quickQuestions: [
          "สรุปร้าน",
          "เมนูขายดี",
          "วัตถุดิบใกล้หมด",
          "มูลค่าสต๊อก",
        ],
      }
    : {
        title: "Restaurant AI assistant",
        askPlaceholder: "Type your question here...",
        ask: "Ask AI",
        thinking: "Analyzing",
        newChat: "New chat",
        newChatConfirm: "Starting a new chat deletes this conversation, and the assistant will not remember any of it.",
        newChatYes: "Delete and start over",
        newChatNo: "Keep it",
        scrollToLatest: "Jump to the latest message",
        permissionDenied: "This page is for the restaurant owner only",
        welcome: "Hi! I'm your restaurant analysis assistant. Ask me about sales, menu profit, or ingredient stock.",
        error: "AI request failed",
        quickQuestions: [
          "Summarize today's restaurant situation.",
          "What ingredients should we prepare tomorrow?",
          "Which menu items sell well and affect stock the most?",
          "Are there stockout or overbuying risks?",
        ],
      };
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
  const [outage, setOutage] = useState<AIOutage | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [pendingAction, setPendingAction] = useState<AIGuidedAction | null>(null);
  const [pendingActionMsgId, setPendingActionMsgId] = useState<string | null>(null);
  const [pendingActionPreview, setPendingActionPreview] = useState<AIActionPreview | null>(null);
  // A multi-item plan (inventory commands) waiting for one confirmation.
  const [pendingActionPlan, setPendingActionPlan] = useState<AIActionPlan | null>(null);
  // The sentence that produced the pending change. "Ask again" puts it back in
  // the box so the owner edits one word instead of retyping the command.
  const [pendingActionQuestion, setPendingActionQuestion] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // The inline confirm bar owns its terminal state (done/cancelled/expired) and
  // stays mounted to show it. Once resolved, the preview must be dropped without
  // trying to cancel an already-executed action.
  const actionResolvedRef = useRef(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [insightsCount, setInsightsCount] = useState(0);
  const [actionConfirming, setActionConfirming] = useState(false);
  const [actionCancelling, setActionCancelling] = useState(false);
  const [actionPreviewError, setActionPreviewError] = useState("");
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>();
  const [conversationRequests] = useState(createRequestGeneration);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // The jump button only earns its place when the reader is not already at the
  // end; shown always, it covers a message to offer a trip to where they are.
  const [atLatest, setAtLatest] = useState(true);
  // Clearing deletes the server copy too and cannot be undone, so it asks first.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const voiceControlsRef = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const sendAfterVoiceRef = useRef(false);
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

  // Lock the page (body/html) from scrolling while the AI view is mounted. This
  // view sizes itself to the dynamic viewport and does its own inner scrolling,
  // so any body scroll is unwanted — on mobile Safari it lets the user drag the
  // whole app up and expose a strip of blank background below the input. The
  // desktop shell already locks the html at lg; this covers phones. Restored on
  // unmount so every other page scrolls normally.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

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
    setPendingActionPlan(null);
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
    setOutage(null);
    setLastQuestion(trimmed);
    setPendingAction(null);
    setPendingActionPreview(null);
    setPendingActionPlan(null);
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
      if (data.action_preview) {
        actionResolvedRef.current = false;
        setPendingActionPreview(data.action_preview);
        setPendingActionQuestion(trimmed);
      }
      if (data.action_plan) {
        actionResolvedRef.current = false;
        setPendingActionPlan(data.action_plan);
        setPendingActionQuestion(trimmed);
      }
      const actions =
        data.intent === "unclear"
          ? getUnclearRequestActions(activeMembership, language)
          : data.intent === "analysis"
            ? getGuidedActions(trimmed, answer, activeMembership, language, data.tool, data.scope_assumed)
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
          forecast: data.forecast,
          chart: data.chart,
        },
      ]);
    } catch (err: unknown) {
      if (!conversationRequests.isCurrent(requestGeneration)) return;
      // An outage gets its own card with the wait and a retry button, instead of
      // the generic red strip that reads as though the question was at fault.
      const reportedOutage = readAIOutage(err);
      if (reportedOutage) {
        setOutage(reportedOutage);
        return;
      }
      const message =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : "";
      setError(message || copy.error);
    } finally {
      if (conversationRequests.isCurrent(requestGeneration)) setLoading(false);
    }
  };

  // Dictated text lands here. The send button sets a flag before stopping, so the
  // transcript can go straight out instead of waiting in the box for a second click.
  const handleVoiceText = (text: string) => {
    const merged = input.trim() ? `${input.trim()} ${text}` : text;
    if (sendAfterVoiceRef.current) {
      sendAfterVoiceRef.current = false;
      setInput("");
      void submitQuestion(merged);
      return;
    }
    setInput(merged);
  };

  const handleListeningChange = (listening: boolean) => {
    setVoiceListening(listening);
    // Runs after the transcript callback, so this only clears an unused flag
    // (e.g. send was pressed but nothing was recognised).
    if (!listening) sendAfterVoiceRef.current = false;
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
    // Already confirmed/cancelled/expired via the inline bar — just drop it, never
    // cancel an action that already ran.
    if (actionResolvedRef.current) {
      actionResolvedRef.current = false;
      setPendingActionPreview(null);
    setPendingActionPlan(null);
      return true;
    }
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

  // Inline confirm bar (reversible one-row writes). The bar owns its own
  // pending → done | cancelled | expired display, so these only run the API and
  // let onResolved mark the preview done; the bar stays until reissue or the
  // next message.
  const availabilityLabel = (available: boolean) =>
    language === "th" ? (available ? "เปิดขาย" : "ปิดขาย") : available ? "Available" : "Unavailable";

  const handleInlineActionConfirm = async () => {
    const preview = pendingActionPreview;
    if (!preview) return;
    // Toggling a menu's availability does not move the analysis snapshot (sales,
    // margins, stock risks are unaffected), so there is nothing to refresh here —
    // the bar shows "done" on success and rethrows on failure.
    await confirmAIAction(preview.id, preview.confirmation_token);
  };

  const handleInlineActionCancel = () => {
    const preview = pendingActionPreview;
    if (!preview) return;
    cancelAIAction(preview.id).catch(() => undefined);
  };

  const handlePlanConfirm = async () => {
    const plan = pendingActionPlan;
    if (!plan) return;
    const response = await confirmAIActionPlan(plan.id, plan.confirmation_token);
    // The outcome is reported per item, so a batch that partly failed says so
    // instead of reading as a clean success.
    setMessages((previous) => [
      ...previous,
      {
        id: `plan-${response.data.plan_id}`,
        role: "assistant",
        content: response.data.message,
        createdAt: new Date(),
      },
    ]);
    // A request that arrives and changes nothing still returns HTTP 200 — the
    // failure is in the body. Without this the bar read "saved, takes effect now"
    // in green over a plan where every item failed. Throwing hands the backend's
    // own words to the bar, which shows them and stays on the confirm button so
    // the owner can try again.
    if (response.data.succeeded === 0 && response.data.failed > 0) {
      throw new Error(response.data.message);
    }
  };

  const handlePlanCancel = () => {
    const plan = pendingActionPlan;
    if (!plan) return;
    cancelAIActionPlan(plan.id).catch(() => undefined);
  };

  // Put the original sentence back in the input, cursor at the end, so the owner
  // changes the part that was wrong instead of retyping the whole command.
  const reissuePendingCommand = () => {
    const question = pendingActionQuestion;
    if (!question) return;
    setInput(question);
    requestAnimationFrame(() => {
      const box = inputRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(question.length, question.length);
    });
  };

  const handlePlanReissue = () => {
    actionResolvedRef.current = false;
    setPendingActionPlan(null);
    reissuePendingCommand();
  };

  const handleInlineActionReissue = () => {
    actionResolvedRef.current = false;
    setPendingActionPreview(null);
    setPendingActionPlan(null);
    reissuePendingCommand();
  };

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
        <section className="rounded-md border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <Bot className="mx-auto h-10 w-10 text-gray-500" />
          <h1 className="mt-4 text-lg font-semibold text-gray-950 dark:text-white">{copy.permissionDenied}</h1>
        </section>
      </main>
    );
  }

  const isEmpty = messages.length <= 1;

  return (
    <main className="ai-aura-bg relative flex h-[calc(100dvh-3.5rem)] min-h-0 w-full flex-col overflow-hidden bg-[#faf8f2] px-2 pt-2 pb-3 sm:px-6 lg:h-[calc(100vh-20px)] lg:px-8 lg:pt-3 lg:pb-4 dark:bg-transparent">
      {/* Sunset Boulevard aura — full-bleed behind the whole page (light theme only) */}
      <div className="ai-aura-layer ai-aura-layer-1 dark:hidden" aria-hidden="true" />
      <div className="ai-aura-layer ai-aura-layer-2 dark:hidden" aria-hidden="true" />
      <section className="relative flex min-h-0 flex-1">
        {/* Conversation — full width */}
        <div className="relative flex min-h-0 flex-1 flex-col bg-transparent dark:bg-gray-900">
          {/* Floating controls (top-right) — minimal & glassy so the chat stays full-screen */}
          <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
            {/* Insights live behind a bell, the control everyone already reads as
                "there is something new for you". The badge carries the count, so
                the button needs no label to be understood. */}
            <HoverTip label={language === "th" ? "ควรรู้วันนี้" : "Insights"} placement="bottom">
              <button
                type="button"
                onClick={() => setDrawerOpen((open) => !open)}
                aria-label={
                  language === "th"
                    ? `ควรรู้วันนี้${insightsCount > 0 ? ` ${insightsCount} เรื่อง` : ""}`
                    : `Insights${insightsCount > 0 ? `, ${insightsCount} items` : ""}`
                }
                className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-600 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-700 hover:shadow-md dark:border-gray-800/80 dark:bg-gray-900/70 dark:text-gray-300 dark:hover:border-orange-800 dark:hover:text-orange-300"
              >
                <Bell className="h-3.5 w-3.5" />
                {insightsCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#faf8f2] dark:ring-gray-950">
                    {insightsCount}
                  </span>
                )}
              </button>
            </HoverTip>
            <HoverTip label={copy.newChat} placement="bottom">
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                disabled={loading || actionConfirming || actionCancelling}
                aria-label={copy.newChat}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-600 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:text-gray-900 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800/80 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </HoverTip>
            <HoverTip
              label={language === "th" ? "ตั้งค่า AI" : "AI settings"}
              placement="bottom"
            >
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label={language === "th" ? "ตั้งค่า AI" : "AI settings"}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-600 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:text-gray-900 hover:shadow-md dark:border-gray-800/80 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:text-white"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </HoverTip>
          </div>
          <AISettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} language={language} />
          {/* Messages — scroll area bleeds to the window's right edge so its
              scrollbar sits flush; pr-8 keeps the bubbles off the scrollbar. */}
          <div
            ref={scrollAreaRef}
            onScroll={() => {
              const area = scrollAreaRef.current;
              if (!area) return;
              // A couple of lines of slack, so the button does not flash on the
              // half-pixel drift a smooth scroll leaves behind.
              setAtLatest(area.scrollHeight - area.scrollTop - area.clientHeight <= 48);
            }}
            className={`ai-scroll relative flex-1 min-h-0 space-y-4 px-1 pb-4 pt-14 sm:px-5 sm:pb-5 lg:-mr-8 lg:pr-8 ${
              /* Nothing to scroll through yet — don't show a scrollbar on a fresh chat */
              isEmpty && !loading ? "overflow-hidden" : "overflow-y-auto"
            }`}
            style={{
              /* Top fade: content dissolves into the aura instead of being cut by a
                 hard edge or hidden abruptly behind the floating controls. The
                 background stays visible through the fade, so nothing looks covered. */
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0, #000 3.25rem)",
              maskImage: "linear-gradient(to bottom, transparent 0, #000 3.25rem)",
            }}
          >
            {isEmpty && !loading ? (
              /* Absolute fill, not h-full: h-full resolves against the scroll box's
                 content area, so this container's own padding pushed it 72px past
                 the viewport — which both squashed the orb and created a scrollbar
                 on a fresh chat. */
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
                <SiriOrb
                  size="128px"
                  className="shrink-0 drop-shadow-[0_15px_50px_rgba(249,115,22,0.4)]"
                  active={voiceListening}
                  level={voiceLevel}
                />
                <div className="shrink-0">
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
                  <div key={msg.id} className="ml-auto flex max-w-[96%] items-end justify-end gap-2.5 sm:max-w-[85%]">
                    <div className="break-words rounded-2xl rounded-br-md bg-gradient-to-br from-orange-500 to-amber-500 px-4 py-2.5 text-xs leading-relaxed text-white shadow-sm shadow-orange-500/25 sm:text-[13px]">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex max-w-full items-start gap-2 sm:max-w-[90%] sm:gap-2.5">
                  <SiriOrb size="30px" className="mt-0.5 shrink-0" />
                  <div className="min-w-0 rounded-2xl rounded-tl-md bg-gray-100 px-4 py-2.5 text-xs leading-relaxed text-gray-800 shadow-sm dark:bg-gray-800/80 dark:text-gray-100 sm:text-[13px]">
                    <SafeAIResponseContent content={msg.content} compact language={language} />
                    {msg.forecast && msg.forecast.forecast.length > 0 && (
                      <ForecastChart data={msg.forecast} language={language} />
                    )}
                    {msg.chart && msg.chart.categories.length > 0 && (
                      <AIChart data={msg.chart} language={language} />
                    )}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.actions.map((action) => (
                          <button
                            key={`${msg.id}-${action.id}`}
                            type="button"
                            onClick={() => handleGuidedAction(action, msg.id)}
                            className="rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-orange-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md hover:shadow-orange-500/10 dark:border-orange-900/50 dark:bg-gray-900 dark:text-orange-300 dark:hover:border-orange-800"
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

            {outage && (
              <AIOutageNotice
                language={language}
                outage={outage}
                retrying={loading}
                onRetry={() => {
                  const question = lastQuestion;
                  setOutage(null);
                  if (question) void submitQuestion(question);
                }}
              />
            )}

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
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
                onReissue={handlePlanReissue}
                onResolved={() => { actionResolvedRef.current = true; }}
                language={language}
              />
            )}

            {pendingActionPreview && (
              pendingActionPreview.action_type === "set_menu_availability" ? (
                <InlineDbConfirmBar
                  key={pendingActionPreview.id}
                  itemName={pendingActionPreview.target.name}
                  fromLabel={availabilityLabel(pendingActionPreview.current.is_available)}
                  toLabel={availabilityLabel(pendingActionPreview.requested.is_available)}
                  detail={language === "th" ? "แก้ข้อมูลจริง 1 รายการ" : "changes 1 record"}
                  expiresAt={pendingActionPreview.expires_at}
                  onConfirm={handleInlineActionConfirm}
                  onCancel={handleInlineActionCancel}
                  onReissue={handleInlineActionReissue}
                  onResolved={() => { actionResolvedRef.current = true; }}
                  language={language}
                />
              ) : (
                <AIActionPreviewCard
                  preview={pendingActionPreview}
                  language={language}
                  confirming={actionConfirming}
                  cancelling={actionCancelling}
                  error={actionPreviewError}
                  onConfirm={handleConfirmActionPreview}
                  onCancel={handleCancelActionPreview}
                />
              )
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Dictation spotlight — the big orb rises over the conversation while
              the mic is live, so the empty state isn't the only place it reacts. */}
          {voiceListening && !isEmpty && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/45 backdrop-blur-[2px] dark:bg-gray-900/55">
              <div className="flex flex-col items-center gap-4">
                <SiriOrb
                  size="150px"
                  className="shrink-0 drop-shadow-[0_15px_50px_rgba(249,115,22,0.45)]"
                  active
                  level={voiceLevel}
                />
                <span className="rounded-full bg-white/85 px-3.5 py-1.5 text-xs font-semibold text-orange-600 shadow-sm dark:bg-gray-800/85 dark:text-orange-400">
                  {language === "th" ? "กำลังฟัง… พูดได้เลยครับ" : "Listening… go ahead"}
                </span>
              </div>
            </div>
          )}

          {/* Quick questions (only before the conversation starts) — rounded pills */}
          {isEmpty && !loading && (
            <div className="px-3 pb-2">
              <div className="flex flex-wrap justify-center gap-2">
                {copy.quickQuestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => submitQuestion(item)}
                    className="rounded-full border border-gray-200 bg-white/60 px-4 py-2 text-left text-xs font-medium text-gray-700 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-700 hover:shadow-md hover:shadow-orange-500/10 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-300 dark:hover:border-orange-800 dark:hover:text-orange-300"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Asked before the thread is deleted, not after: the server copy goes
              with it and there is no undo. */}
          {confirmingClear && (
            <div className="mx-auto w-full max-w-2xl px-3 pb-1">
              <AIInlineConfirm
                message={copy.newChatConfirm}
                confirmLabel={copy.newChatYes}
                cancelLabel={copy.newChatNo}
                onConfirm={() => {
                  setConfirmingClear(false);
                  void handleClearChat();
                }}
                onCancel={() => setConfirmingClear(false)}
                disabled={loading || actionConfirming || actionCancelling}
              />
            </div>
          )}

          {/* A way back to the newest message once the reader has scrolled up. */}
          {!atLatest && messages.length > 1 && (
            <div className="pointer-events-none relative z-20 h-0">
              <button
                type="button"
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
                aria-label={copy.scrollToLatest}
                title={copy.scrollToLatest}
                className="pointer-events-auto absolute -top-11 left-1/2 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200/80 bg-white/90 text-gray-600 shadow-md backdrop-blur transition-all hover:-translate-y-0.5 hover:text-orange-600 active:scale-95 dark:border-gray-700/80 dark:bg-gray-900/90 dark:text-gray-300 dark:hover:text-orange-300"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Input at the bottom — rounded pill, capped and centred */}
          <form
            className="mx-auto w-full max-w-2xl p-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitQuestion();
            }}
          >
            <div
              className={`flex items-end gap-2 rounded-[1.75rem] border p-2 shadow-sm transition ${
                voiceListening
                  ? "border-orange-200 bg-orange-50/60 pl-2 dark:border-orange-900/50 dark:bg-orange-950/20"
                  : "border-gray-200 bg-white pl-2 focus-within:border-orange-300 focus-within:shadow-md focus-within:shadow-orange-500/10 dark:border-gray-800 dark:bg-gray-800"
              }`}
            >
              {/* Scan / tools — far-left slot, only when not dictating */}
              {!voiceListening && (
                <AIInputTools
                  tools={["scan"]}
                  language={language}
                  disabled={loading || actionConfirming || actionCancelling}
                  onInsertText={handleVoiceText}
                />
              )}
              {/* Discard the take — left slot, like a voice memo's cancel */}
              {voiceListening && (
                <HoverTip label={language === "th" ? "ยกเลิก ไม่เอาเสียงนี้" : "Cancel, discard this take"}>
                  <button
                    type="button"
                    onClick={() => voiceControlsRef.current?.cancel()}
                    aria-label={language === "th" ? "ยกเลิกการอัด" : "Cancel recording"}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-all hover:border-gray-300 hover:text-gray-800 active:scale-95 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </HoverTip>
              )}
              {voiceListening ? (
                /* Dictation mode: the live waveform takes over the text field */
                <VoiceWaveform level={voiceLevel} className="min-h-[2.25rem] min-w-0 flex-1 px-1" />
              ) : (
                <textarea
                  ref={inputRef}
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
                  className="max-h-40 min-h-[2.25rem] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-500 dark:text-white"
                />
              )}
              {/* Kept mounted while dictating (it owns the mic session), just hidden */}
              <div className={voiceListening ? "hidden" : "contents"}>
                <AIInputTools
                  tools={["voice"]}
                  language={language}
                  disabled={loading || actionConfirming || actionCancelling}
                  onInsertText={handleVoiceText}
                  onListeningChange={handleListeningChange}
                  onVoiceLevel={setVoiceLevel}
                  voiceControlsRef={voiceControlsRef}
                />
              </div>
              {voiceListening ? (
                <>
                  <HoverTip label={language === "th" ? "หยุด แล้วเอาข้อความไปแก้ก่อนส่ง" : "Stop and review before sending"}>
                    <button
                      type="button"
                      onClick={() => voiceControlsRef.current?.stop()}
                      aria-label={language === "th" ? "หยุดอัด" : "Stop recording"}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-all hover:border-gray-300 hover:text-gray-900 active:scale-95 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:text-white"
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                  </HoverTip>
                  <HoverTip label={language === "th" ? "หยุดแล้วส่งให้ AI ทันที" : "Stop and send to AI right away"}>
                    <button
                      type="button"
                      onClick={() => {
                        sendAfterVoiceRef.current = true;
                        voiceControlsRef.current?.stop();
                      }}
                      aria-label={language === "th" ? "หยุดแล้วส่งเลย" : "Stop and send"}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/30 transition-all hover:brightness-105 hover:shadow-md active:scale-95"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  </HoverTip>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={loading || actionConfirming || actionCancelling || !input.trim()}
                  aria-label={copy.ask}
                  title={copy.ask}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/30 transition-all hover:brightness-105 hover:shadow-md hover:shadow-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Dim overlay — click to dismiss. Full-viewport on a phone (the panel
          covers the screen there); a light scrim on a desktop, where the panel
          is a popover and the page behind it stays visible. */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-[59] bg-black/30 backdrop-blur-[1px] dark:bg-black/50 sm:absolute sm:bg-black/15 sm:backdrop-blur-0 sm:dark:bg-black/30"
            aria-hidden
          />
        )}

        {/* Insights — two different objects, not one object resized.
            Phone: a full-screen sheet that slides up, because a 340px rail on a
            390px screen was a sliver of a page rather than a page.
            Desktop: a rounded card that hangs off the bell it came from, so the
            chat stays visible and the panel reads as belonging to that button.
            The right/top offsets match the bell's own (main's padding + its
            right-3/top-3) so the card's edge lines up with the control. */}
        <aside
          /* Phone: the sheet stops at the app bar rather than running under it.
             inset-0 covered the bar geometrically but the bar paints from a
             higher stacking context, so it sat on top of the panel's own title
             row and hid the close button. Starting below it also keeps the bell
             and the menu reachable while the panel is open. */
          className={`fixed inset-x-0 bottom-0 top-14 z-[60] flex flex-col bg-white shadow-2xl transition-all duration-300 ease-out dark:bg-gray-900 sm:absolute sm:left-auto sm:bottom-auto sm:right-9 sm:top-16 sm:w-[380px] sm:max-h-[min(32rem,calc(100%-6rem))] sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-gray-950/20 sm:dark:border-gray-800 lg:right-11 ${
            drawerOpen
              ? "translate-y-0 opacity-100 sm:scale-100"
              : "pointer-events-none translate-y-full opacity-0 sm:translate-y-0 sm:scale-95"
          }`}
          aria-hidden={!drawerOpen}
        >
          {/* No chrome of its own: the close control rides the panel's own title
              row. A bar holding nothing but an X was a thick empty band above the
              heading — two rows of furniture for one list. */}
          <div className="ai-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
            <AIInsightsPanel
              language={language}
              onCount={setInsightsCount}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </aside>
    </main>
  );
}
