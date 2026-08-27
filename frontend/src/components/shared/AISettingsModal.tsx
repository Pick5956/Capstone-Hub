"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2, Wand2, X } from "lucide-react";
import { getAISettings, updateAISettings } from "@/src/lib/ai";

function copy(language: "th" | "en") {
  return language === "th"
    ? {
        settings: "ตั้งค่า AI",
        section: "การลงมือทำ",
        title: "ให้ผู้ช่วยลงมือทำ",
        toggleLabel: "อนุญาตให้ AI เปิด/ปิดขายเมนูให้",
        toggleHint: "เมื่อเปิด ผู้ช่วยจะทำตามคำสั่งได้ เช่น “ปิดขายเมนูต้มยำกุ้ง”",
        safety:
          "ทุกครั้งจะแสดงตัวอย่างการเปลี่ยนแปลงและรอคุณกดยืนยันก่อนเสมอ — AI ไม่เปลี่ยนข้อมูลเอง",
        unavailable:
          "ตอนนี้ความสามารถนี้ถูกปิดจากระบบส่วนกลาง เปิดสวิตช์ไว้ได้ แต่จะยังไม่มีผลจนกว่าระบบจะเปิดให้",
        on: "เปิด",
        off: "ปิด",
        cancel: "ยกเลิก",
        save: "บันทึก",
        loadError: "โหลดการตั้งค่าไม่สำเร็จ",
        saveError: "บันทึกไม่สำเร็จ",
      }
    : {
        settings: "AI settings",
        section: "Actions",
        title: "Let the assistant take actions",
        toggleLabel: "Allow the AI to open/close menus for you",
        toggleHint: 'When on, the assistant can act on commands like "close Tom Yum Kung".',
        safety:
          "Every change is shown as a preview and waits for your confirmation — the AI never changes data on its own.",
        unavailable:
          "This capability is currently off system-wide. You can leave the switch on, but it takes effect only once the system enables it.",
        on: "On",
        off: "Off",
        cancel: "Cancel",
        save: "Save",
        loadError: "Could not load settings",
        saveError: "Could not save",
      };
}

export default function AISettingsModal({
  open,
  onClose,
  language,
}: {
  open: boolean;
  onClose: () => void;
  language: "th" | "en";
}) {
  const t = copy(language);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [featureAvailable, setFeatureAvailable] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    getAISettings()
      .then((res) => {
        setEnabled(Boolean(res.data.actions_enabled));
        setFeatureAvailable(Boolean(res.data.feature_available));
      })
      .catch(() => setError(t.loadError))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await updateAISettings(enabled);
      onClose();
    } catch {
      setError(t.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar — one section today, structured to grow. */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/50 sm:flex">
          <p className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <Settings2 className="h-3.5 w-3.5" /> {t.settings}
          </p>
          <button className="mt-1 flex w-full items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
            <Wand2 className="h-4 w-4" /> {t.section}
          </button>
        </aside>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t.title}</h2>
            <button
              onClick={onClose}
              aria-label={t.cancel}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.toggleLabel}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t.toggleHint}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => setEnabled((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                      enabled ? "bg-orange-500" : "bg-gray-300 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                        enabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                  {t.safety}
                </p>

                {!featureAvailable && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                    {t.unavailable}
                  </p>
                )}
              </>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
            {error && <span className="mr-auto text-xs text-red-500">{error}</span>}
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t.cancel}
            </button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.save}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
