"use client";

import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { SettingsPanel, SettingsShell } from "../_components/SettingsPrimitives";

type FontSize = "small" | "normal" | "large" | "extra-large";

const fontOptions: FontSize[] = ["small", "normal", "large", "extra-large"];

export default function DisplaySettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { fontSize, setFontSize, showAIAssistant, setShowAIAssistant } = useTheme();

  const copy = language === "th"
    ? {
        eyebrow: "Display",
        title: "ภาษาและการแสดงผล",
        subtitle: "ตั้งค่าประสบการณ์การอ่านของคุณ โดยไม่ปนกับข้อมูลบัญชีหรือข้อมูลร้าน",
        back: "ตั้งค่า",
        language: "ภาษา",
        languageHint: "ใช้กับข้อความหลักในหน้าภาพรวม งานรับออเดอร์ และหน้าจอครัว",
        thai: "ไทย",
        english: "English",
        font: "ขนาดตัวอักษร",
        fontHint: "ตั้งค่าเฉพาะเครื่องนี้ เพื่อให้พนักงานอ่านและกดได้ถนัดขึ้น",
        small: "เล็ก",
        normal: "ปกติ",
        large: "ใหญ่",
        xl: "ใหญ่มาก",
        aiAssistant: "ผู้ช่วยวิเคราะห์ร้าน AI",
        aiAssistantHint: "แสดงปุ่มแชทผู้ช่วย AI ลอย (ปุ่มสีส้มขวาล่าง) บนหน้าจอของเครื่องนี้",
      }
    : {
        eyebrow: "Display",
        title: "Language and display",
        subtitle: "Tune your reading experience without mixing it into account or restaurant setup.",
        back: "Settings",
        language: "Language",
        languageHint: "Applies to overview, order-taking, and kitchen interface copy.",
        thai: "Thai",
        english: "English",
        font: "Font size",
        fontHint: "Saved on this device so staff can read and tap comfortably.",
        small: "Small",
        normal: "Normal",
        large: "Large",
        xl: "Extra large",
        aiAssistant: "AI Operations Assistant",
        aiAssistantHint: "Show the floating AI assistant chat button (orange button in bottom right) on this device.",
      };

  const fontLabels: Record<FontSize, string> = {
    small: copy.small,
    normal: copy.normal,
    large: copy.large,
    "extra-large": copy.xl,
  };

  return (
    <SettingsShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} backLabel={copy.back} hideHeader>
      <div className="max-w-2xl">
        <SettingsPanel title={copy.title} hint={copy.subtitle}>
          <div className="grid gap-6">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.language}</span>
              <ThemedSelect
                value={language}
                onChange={(nextValue) => setLanguage(nextValue as Language)}
                options={[
                  { value: "th", label: copy.thai },
                  { value: "en", label: copy.english },
                ]}
              />
              <p className="mt-1.5 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{copy.languageHint}</p>
            </label>

            <div>
              <p className="mb-1.5 text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.font}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {fontOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFontSize(option)}
                    className={`ui-press h-11 rounded-md border px-3 text-[13px] font-semibold transition-colors ${
                      fontSize === option
                        ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
                    }`}
                  >
                    {fontLabels[option]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{copy.fontHint}</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-150 p-4 dark:border-gray-800/80 bg-gray-50/30 dark:bg-gray-900/10 hover:border-gray-200 transition-all duration-300">
              <div className="pr-4">
                <span className="mb-1 block text-[13px] font-semibold text-gray-800 dark:text-gray-200">{copy.aiAssistant}</span>
                <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{copy.aiAssistantHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAIAssistant(!showAIAssistant)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 active:scale-95 ${
                  showAIAssistant
                    ? "bg-orange-500 shadow-sm shadow-orange-500/10"
                    : "bg-gray-200 dark:bg-gray-800"
                }`}
                role="switch"
                aria-checked={showAIAssistant}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-out ${
                    showAIAssistant ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </SettingsPanel>
      </div>
    </SettingsShell>
  );
}
