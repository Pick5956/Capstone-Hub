"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CaseSensitive, Check, ChevronLeft, ChevronRight, Languages, LogOut, Moon, Sparkles, Sun } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import { useTheme, type FontSize } from "@/src/providers/ThemeProvider";
import UserAvatar from "@/src/components/shared/UserAvatar";

type Panel = "main" | "theme" | "language" | "font" | "assistant";

const fontSizeOptions: { value: FontSize; th: string; en: string }[] = [
  { value: "small", th: "เล็ก", en: "Small" },
  { value: "normal", th: "ปกติ", en: "Normal" },
  { value: "large", th: "ใหญ่", en: "Large" },
  { value: "extra-large", th: "ใหญ่มาก", en: "Extra large" },
];

function MenuButton({
  icon,
  label,
  value,
  onClick,
  danger = false,
  chevron = false,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-3 px-3 text-left text-[13px] hover:bg-gray-50 dark:hover:bg-gray-900 ${
        danger ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-100"
      }`}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center ${danger ? "text-red-500 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value ? <span className="max-w-24 truncate text-[12px] text-gray-500 dark:text-gray-400">{value}</span> : null}
      {chevron ? <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" /> : null}
    </button>
  );
}

function OptionButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-3 px-3 text-left text-[13px] hover:bg-gray-50 dark:hover:bg-gray-900 ${
        active ? "font-semibold text-gray-950 dark:text-white" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      <span className="grid h-5 w-5 place-items-center">{active ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}</span>
      <span>{label}</span>
    </button>
  );
}

export default function DashboardAccountMenu() {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { theme, fontSize, mounted, toggle, setFontSize, showAIAssistant, setShowAIAssistant } = useTheme();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("main");
  const rootRef = useRef<HTMLDivElement>(null);
  const isDark = mounted && theme === "dark";
  const displayName = user ? (user.nickname?.trim() || `${user.first_name} ${user.last_name === "-" ? "" : user.last_name}`.trim()) : language === "th" ? "ผู้ใช้งาน" : "User";
  const fontLabel = fontSizeOptions.find((option) => option.value === fontSize);

  const copy = language === "th"
    ? {
        account: "บัญชีผู้ใช้",
        profile: "ดูบัญชีของคุณ",
        theme: "ธีม",
        themeValue: isDark ? "มืด" : "สว่าง",
        language: "แสดงภาษา",
        languageValue: "ไทย",
        fontSize: "ขนาด UI",
        aiAssistant: "AI ผู้ช่วย",
        aiAssistantValue: showAIAssistant ? "เปิด" : "ปิด",
        aiAssistantOn: "เปิด",
        aiAssistantOff: "ปิด",
        logout: "ออกจากระบบ",
        back: "กลับ",
        light: "สว่าง",
        dark: "มืด",
      }
    : {
        account: "Account",
        profile: "View your account",
        theme: "Appearance",
        themeValue: isDark ? "Dark" : "Light",
        language: "Display language",
        languageValue: "English",
        fontSize: "UI size",
        aiAssistant: "AI assistant",
        aiAssistantValue: showAIAssistant ? "On" : "Off",
        aiAssistantOn: "On",
        aiAssistantOff: "Off",
        logout: "Log out",
        back: "Back",
        light: "Light",
        dark: "Dark",
      };

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPanel("main");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPanel("main");
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const selectLanguage = (next: Language) => {
    setLanguage(next);
    setPanel("main");
  };

  const selectFontSize = (next: FontSize) => {
    setFontSize(next);
    setPanel("main");
  };

  const switchTheme = (dark: boolean) => {
    if (dark !== isDark) toggle();
    setPanel("main");
  };

  const selectAssistantVisibility = (next: boolean) => {
    setShowAIAssistant(next);
    setPanel("main");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setPanel("main");
        }}
        aria-label={copy.account}
        aria-expanded={open}
        aria-haspopup="menu"
        className="ui-press inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
      >
        <UserAvatar src={user?.profile_image} name={displayName} size={30} className="h-8 w-8 text-[11px] text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-md border border-[#dfe3e8] bg-white py-2 shadow-xl shadow-gray-950/10 dark:border-[#253142] dark:bg-gray-950 dark:shadow-black/40">
          {panel === "main" ? (
            <>
              <div className="flex gap-3 px-3 pb-3">
                <UserAvatar src={user?.profile_image} name={displayName} size={36} className="h-9 w-9 text-[12px] text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-gray-950 dark:text-white">{displayName}</p>
                  <p className="truncate text-[12px] text-gray-500 dark:text-gray-400">{user?.email ?? ""}</p>
                  <Link href="/settings/account" onClick={() => setOpen(false)} className="mt-1 inline-flex text-[12px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
                    {copy.profile}
                  </Link>
                </div>
              </div>
              <div className="border-t border-[#dfe3e8] dark:border-[#253142]" />
              <MenuButton icon={isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} label={copy.theme} value={copy.themeValue} chevron onClick={() => setPanel("theme")} />
              <MenuButton icon={<Languages className="h-4 w-4" />} label={copy.language} value={copy.languageValue} chevron onClick={() => setPanel("language")} />
              <MenuButton icon={<CaseSensitive className="h-4 w-4" />} label={copy.fontSize} value={fontLabel ? (language === "th" ? fontLabel.th : fontLabel.en) : ""} chevron onClick={() => setPanel("font")} />
              <MenuButton icon={<Sparkles className="h-4 w-4" />} label={copy.aiAssistant} value={copy.aiAssistantValue} chevron onClick={() => setPanel("assistant")} />
              <div className="border-t border-[#dfe3e8] dark:border-[#253142]" />
              <MenuButton icon={<LogOut className="h-4 w-4" />} label={copy.logout} danger onClick={logout} />
            </>
          ) : null}

          {panel === "theme" ? (
            <>
              <button type="button" onClick={() => setPanel("main")} className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-gray-900">
                <ChevronLeft className="h-4 w-4" />
                {copy.theme}
              </button>
              <OptionButton label={copy.light} active={!isDark} onClick={() => switchTheme(false)} />
              <OptionButton label={copy.dark} active={isDark} onClick={() => switchTheme(true)} />
            </>
          ) : null}

          {panel === "language" ? (
            <>
              <button type="button" onClick={() => setPanel("main")} className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-gray-900">
                <ChevronLeft className="h-4 w-4" />
                {copy.language}
              </button>
              <OptionButton label="ไทย" active={language === "th"} onClick={() => selectLanguage("th")} />
              <OptionButton label="English" active={language === "en"} onClick={() => selectLanguage("en")} />
            </>
          ) : null}

          {panel === "font" ? (
            <>
              <button type="button" onClick={() => setPanel("main")} className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-gray-900">
                <ChevronLeft className="h-4 w-4" />
                {copy.fontSize}
              </button>
              {fontSizeOptions.map((option) => (
                <OptionButton key={option.value} label={language === "th" ? option.th : option.en} active={fontSize === option.value} onClick={() => selectFontSize(option.value)} />
              ))}
            </>
          ) : null}

          {panel === "assistant" ? (
            <>
              <button type="button" onClick={() => setPanel("main")} className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-gray-900">
                <ChevronLeft className="h-4 w-4" />
                {copy.aiAssistant}
              </button>
              <OptionButton label={copy.aiAssistantOn} active={showAIAssistant} onClick={() => selectAssistantVisibility(true)} />
              <OptionButton label={copy.aiAssistantOff} active={!showAIAssistant} onClick={() => selectAssistantVisibility(false)} />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
