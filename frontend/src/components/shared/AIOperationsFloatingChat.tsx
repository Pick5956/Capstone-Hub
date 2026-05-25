"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
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
  Lightbulb
} from "lucide-react";
import { askOperationsAI, getOperationsSnapshot } from "@/src/lib/ai";
import { resolveClarificationRequest } from "@/src/lib/aiClarification";
import { getGuidedActions, type AIGuidedAction } from "@/src/lib/aiGuidedActions";
import { resolveNavigationRequest } from "@/src/lib/aiNavigation";
import { can } from "@/src/lib/rbac";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import type { AIAskResponse, AIConversationMessage, AISnapshot } from "@/src/types/ai";
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
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5 transition-all dark:border-gray-800/40 dark:bg-gray-900/40">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-gray-400 dark:text-gray-500">{label}</p>
          <p className="mt-0.5 truncate text-base font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function AIOperationsFloatingChat() {
  const { activeMembership, user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const copy = useMemo(() => buildCopy(language), [language]);

  const [isOpen, setIsOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [latestSnapshot, setLatestSnapshot] = useState<AISnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const snapshotRequestedRef = useRef(false);

  const canAskAI = can(activeMembership, "view_reports") || can(activeMembership, "manage_inventory");

  // Load saved messages on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("restaurant_ai_chat");
      if (saved) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const rehydrated = parsed.map((m) => {
              const stored = m as StoredMessage;
              return {
              ...m,
              createdAt: stored.createdAt ? new Date(stored.createdAt) : new Date(),
              };
            });
            setMessages(rehydrated);
            return;
          }
        } catch (e) {
          console.error("Failed to parse saved chat messages:", e);
        }
      }
      
      // Default initial welcome message if no history
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: copy.welcome,
          createdAt: new Date(),
        },
      ]);
    }
  }, [copy.welcome]);

  // Save messages to localStorage when updated
  useEffect(() => {
    if (typeof window !== "undefined" && messages.length > 0) {
      localStorage.setItem("restaurant_ai_chat", JSON.stringify(messages));
    }
  }, [messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // Load snapshot in the background when the chat box is first opened
  useEffect(() => {
    if (!isOpen || !canAskAI || snapshotRequestedRef.current) return;
    snapshotRequestedRef.current = true;
    setSnapshotLoading(true);
    getOperationsSnapshot()
      .then((response) => {
        if (response?.data) {
          setLatestSnapshot(response.data);
        }
      })
      .catch((err) => {
        snapshotRequestedRef.current = false;
        console.error("Failed to load initial operations snapshot:", err);
      })
      .finally(() => setSnapshotLoading(false));
  }, [canAskAI, isOpen]);

  const conversationHistory = (): AIConversationMessage[] =>
    messages
      .filter((message): message is Message & { role: "user" | "assistant" } => message.role !== "system")
      .slice(-6)
      .map((message) => ({ role: message.role, content: message.content }));

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
        id: `confirm-${Date.now()}`,
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
    if (!trimmed || loading) return;

    setInput("");
    
    // Add user message
    const userMsgId = `user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: trimmed,
      createdAt: new Date(),
    };
    
    setMessages(prev => [...prev, userMsg]);

    const navigation = resolveNavigationRequest(trimmed, activeMembership, language, pathname);
    if (navigation) {
      const assistantMsg: Message = {
        id: `nav-${Date.now()}`,
        role: "assistant",
        content: navigation.message,
        createdAt: new Date(),
        actions: navigation.kind === "suggest"
          ? navigation.options.map((option) => ({ id: option.href, ...option }))
          : undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);
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
          id: `clarify-${Date.now()}`,
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
          id: `permission-${Date.now()}`,
          role: "assistant",
          content: language === "th"
            ? "ผมช่วยพาไปหน้าเมนูที่คุณเข้าถึงได้ครับ ส่วนการวิเคราะห์ยอดขายและคลังต้องใช้สิทธิ์ผู้จัดการหรือเจ้าของร้าน"
            : "I can guide you to pages you can access. Sales and inventory analysis requires manager or owner access.",
          createdAt: new Date(),
        },
      ]);
      return;
    }

    setLoading(true);

    try {
      const response = await askOperationsAI(trimmed, conversationHistory());
      const data: AIAskResponse = response.data;
      
      const assistantMsg: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        createdAt: new Date(),
        actions: getGuidedActions(trimmed, data.answer, activeMembership, language),
      };
      
      setMessages(prev => [...prev, assistantMsg]);
      
      if (data.snapshot) {
        setLatestSnapshot(data.snapshot);
      }
    } catch (err: unknown) {
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
          
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: "system",
        content: errorMessage || copy.thinking.replace("กำลังวิเคราะห์...", "เกิดข้อผิดพลาดในการเชื่อมต่อกรุณาลองใหม่อีกครั้ง"),
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  if (!activeMembership) return null;

  const salesDays = latestSnapshot?.sales_days ?? [];
  const stockRisks = latestSnapshot?.stock_risks ?? [];
  const inventorySummary = latestSnapshot?.inventory_summary;

  return (
    <>
      {/* Premium Keyframes and Animations style tag */}
      <style>{`
        @keyframes botFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes messageSlideUp {
          0% { transform: translateY(16px) scale(0.97); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-bot-float {
          animation: botFloat 3s ease-in-out infinite;
        }
        .animate-pulse-glow {
          animation: pulseGlow 2.5s ease-in-out infinite;
        }
        .animate-message-slide {
          animation: messageSlideUp 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          will-change: transform, opacity;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        @keyframes inputGlow {
          0%, 100% { 
            box-shadow: 0 0 4px rgba(249, 115, 22, 0.25), 0 1px 2px rgba(0, 0, 0, 0.05); 
            border-color: rgba(249, 115, 22, 0.5); 
          }
          50% { 
            box-shadow: 0 0 12px rgba(249, 115, 22, 0.6), 0 2px 4px rgba(249, 115, 22, 0.1); 
            border-color: rgba(234, 88, 12, 0.85); 
          }
        }
        .focus-glow:focus {
          animation: inputGlow 2s infinite ease-in-out;
        }
      `}</style>

      {/* Chat Window Panel */}
      <div 
        className={`fixed top-4 bottom-4 right-4 sm:top-4 sm:bottom-6 sm:right-6 left-4 sm:left-auto z-[9998] flex items-stretch gap-4 origin-bottom-right transition-all duration-500 ${
          isOpen
            ? "opacity-100 scale-100 pointer-events-auto ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            : "opacity-0 scale-90 pointer-events-none ease-[cubic-bezier(0.25,1,0.5,1)]"
        } ${
          showStats 
            ? "sm:w-[380px] md:w-[776px]" 
            : "sm:w-[380px] md:w-[400px]"
        }`}
      >
        {/* Collapsible Stats Side Drawer (Desktop Only) - Smooth width/slide transition */}
        <div 
          className={`hidden md:flex flex-col rounded-2xl bg-white/95 shadow-2xl backdrop-blur-md dark:bg-gray-950/95 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            showStats 
              ? "w-[360px] p-4 border border-gray-200/60 dark:border-gray-800/60 opacity-100 translate-x-0 mr-1" 
              : "w-0 p-0 border-0 opacity-0 -translate-x-6 pointer-events-none overflow-hidden mr-0"
          }`}
        >
          {/* Inner fixed width container to prevent squishing text/layouts during transitions */}
          <div className="w-[328px] shrink-0 flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-orange-500 animate-pulse" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{copy.snapshot}</h3>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStats(false);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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

                <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-3.5 py-2.5 bg-gray-50/50 dark:bg-gray-900/20">
                    <PackageSearch className="h-4.5 w-4.5 text-orange-500" />
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{copy.stockRisks}</span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[220px] overflow-y-auto scrollbar-thin">
                    {stockRisks.map((item) => (
                      <div key={item.name} className="p-3 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-900/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-gray-900 dark:text-white">{item.name}</p>
                            <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                              {formatNumber(item.stock, language)} {item.unit}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${
                              item.status === "out"
                                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                            }`}
                          >
                            {item.status === "out" ? copy.stockOut : copy.stockLow}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                          {copy.restock} <span className="font-bold text-orange-600 dark:text-orange-400">{formatNumber(item.restock_estimate, language)}</span> {item.unit}
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
        <div className="flex h-full w-full sm:w-[380px] md:w-[400px] shrink-0 flex-col rounded-2xl border border-gray-200/60 bg-white/95 shadow-[0_20px_50px_-12px_rgba(249,115,22,0.18)] dark:shadow-[0_20px_50px_-12px_rgba(249,115,22,0.08)] backdrop-blur-md dark:border-gray-800/60 dark:bg-gray-950/95 overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-orange-500/10 to-amber-500/5 px-4 py-3.5 dark:border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-md animate-bot-float">
                  <Bot className="h-5 w-5" />
                </span>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500 dark:border-gray-950"></span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{copy.title}</h2>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-none mt-0.5">{copy.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Tips Toggle Button (Lightbulb) */}
              {messages.length <= 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTips(!showTips);
                  }}
                  title={language === "th" ? "เปิด/ปิดคำถามแนะนำ" : "Toggle Suggested Questions"}
                  className={`rounded-lg p-2 transition-all duration-300 active:scale-110 ${
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStats(!showStats);
                  }}
                  title={copy.toggleStatsTooltip}
                  className={`hidden rounded-lg p-2 md:inline-flex transition-all duration-300 active:scale-110 ${
                    showStats
                      ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
                      : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <BarChart2 className="h-4.5 w-4.5" />
                </button>
              )}
              {/* Close Panel */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Chat Messages Body with custom scrollbar and entry animation */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 scrollbar-thin">
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
                    <div className="rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white text-xs sm:text-[13px] px-4 py-3 shadow-sm leading-relaxed max-w-full break-words">
                      {msg.content}
                    </div>
                    {/* User Avatar */}
                    <div className="h-8 w-8 rounded-full shrink-0 overflow-hidden border border-orange-100 dark:border-gray-800/80 shadow-sm flex-none">
                      {user?.profile_image ? (
                        <Image src={user.profile_image} width={32} height={32} unoptimized className="h-full w-full object-cover" alt="" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-orange-100 text-[11px] font-bold text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 uppercase">
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
                  <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shrink-0 border border-orange-100 dark:border-gray-800/40 shadow-sm flex-none">
                    <Bot className="h-4.5 w-4.5" />
                  </div>
                  {/* AI Message Bubble (Rounded on all sides) */}
                  <div className="rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs sm:text-[13px] px-4 py-3 shadow-sm leading-relaxed max-w-full break-words">
                    <AIResponseContent content={msg.content} compact />
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.actions.map((action) => (
                          <button
                            key={`${msg.id}-${action.id}`}
                            type="button"
                            onClick={() => handleAction(action)}
                            className="rounded-xl border border-orange-200 bg-white px-3 py-2 text-[11px] font-semibold text-orange-700 transition hover:bg-orange-50 dark:border-orange-900/50 dark:bg-gray-950 dark:text-orange-300 dark:hover:bg-orange-950/20"
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
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shrink-0 border border-orange-100 dark:border-gray-800/40 shadow-sm flex-none">
                  <Bot className="h-4.5 w-4.5" />
                </div>
                {/* Loading Bubble */}
                <div className="rounded-2xl bg-gray-100 px-3.5 py-2.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400 flex items-center gap-2 shadow-sm leading-relaxed">
                  <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
                  <span>{copy.thinking}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions suggestion overlay with slide-up entrance */}
          {messages.length <= 1 && !loading && showTips && (
            <div className="border-t border-gray-100 bg-gray-50/50 p-3.5 dark:border-gray-800/60 dark:bg-gray-900/10 animate-message-slide">
              <div className="flex flex-col gap-2">
                {/* Tips Header with Close Button */}
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {language === "th" ? "💡 คำถามแนะนำ" : "💡 Suggested Questions"}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTips(false);
                    }}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors cursor-pointer"
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
                    className="w-full text-left rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 transition-all dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-orange-800 dark:hover:bg-orange-950/20 dark:hover:text-orange-400 shadow-sm cursor-pointer"
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
            className="border-t border-gray-100 p-3.5 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-b-2xl"
          >
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={copy.askPlaceholder}
                disabled={loading}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium placeholder-gray-400 outline-none transition focus-glow dark:border-gray-800 dark:bg-gray-900 dark:placeholder-gray-400 shadow-sm !text-gray-950 dark:!text-gray-50 cursor-text"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white hover:bg-gray-800 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 shadow-md cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Floating Circular Trigger Button — fades out as the droplet expands over it */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 group flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-2xl hover:scale-105 active:scale-95 cursor-pointer z-[9999] hover:shadow-orange-500/20 dark:hover:shadow-orange-600/30 border border-orange-400/20 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          isOpen 
            ? "opacity-0 scale-75 pointer-events-none" 
            : "opacity-100 scale-100 pointer-events-auto"
        }`}
      >
        {/* Breathing Glow Ring Effect */}
        <span className="absolute -inset-0.5 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 opacity-60 blur-sm group-hover:opacity-80 transition duration-200 animate-pulse-glow"></span>
        
        {/* Icon container with hover animation */}
        <span className="relative flex h-6 w-6 items-center justify-center">
          <Bot className="h-6 w-6 text-white group-hover:rotate-12 transition-transform duration-300" />
        </span>
      </button>
    </>
  );
}
