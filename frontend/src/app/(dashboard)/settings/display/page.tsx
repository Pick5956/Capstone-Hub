"use client";

import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { SettingsPanel, SettingsShell } from "../_components/SettingsPrimitives";

type FontSize = "small" | "normal" | "large" | "extra-large";

const fontOptions: FontSize[] = ["small", "normal", "large", "extra-large"];

export default function DisplaySettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { fontSize, setFontSize } = useTheme();

  const copy = language === "th"
    ? {
        eyebrow: "Display",
        title: "ภาษาและการแสดงผล",
        subtitle: "ตั้งค่าประสบการณ์การอ่านของคุณ โดยไม่ปนกับข้อมูลบัญชีหรือข้อมูลร้าน",
        back: "ตั้งค่า",
        language: "ภาษา",
        languageHint: "ใช้กับข้อความหลักใน dashboard, POS และหน้าจอครัว",
        thai: "ไทย",
        english: "English",
        font: "ขนาดตัวอักษร",
        fontHint: "ตั้งค่าเฉพาะเครื่องนี้ เพื่อให้พนักงานอ่านและกดได้ถนัดขึ้น",
        small: "เล็ก",
        normal: "ปกติ",
        large: "ใหญ่",
        xl: "ใหญ่มาก",
      }
    : {
        eyebrow: "Display",
        title: "Language and display",
        subtitle: "Tune your reading experience without mixing it into account or restaurant setup.",
        back: "Settings",
        language: "Language",
        languageHint: "Applies to dashboard, POS, and kitchen interface copy.",
        thai: "Thai",
        english: "English",
        font: "Font size",
        fontHint: "Saved on this device so staff can read and tap comfortably.",
        small: "Small",
        normal: "Normal",
        large: "Large",
        xl: "Extra large",
      };

  const fontLabels: Record<FontSize, string> = {
    small: copy.small,
    normal: copy.normal,
    large: copy.large,
    "extra-large": copy.xl,
  };

  return (
    <SettingsShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} backLabel={copy.back}>
      <div className="max-w-2xl">
        <SettingsPanel title={copy.title} hint={copy.subtitle}>
          <div className="grid gap-5">
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
          </div>
        </SettingsPanel>
      </div>
    </SettingsShell>
  );
}
