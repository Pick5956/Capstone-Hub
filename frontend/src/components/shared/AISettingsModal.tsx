"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus, Settings2, Trash2, X } from "lucide-react";
import { getOperatingCalendar, updateOperatingCalendar } from "@/src/lib/ai";
import type { AICalendarException } from "@/src/types/ai";

const WEEKDAYS: Record<"th" | "en", string[]> = {
  // index 0 = Sunday .. 6 = Saturday, matching the backend
  th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

function copy(language: "th" | "en") {
  return language === "th"
    ? {
        settings: "ตั้งค่า AI",
        calendar: "ปฏิทินร้าน",
        title: "ปฏิทินเปิด-ปิดร้าน",
        desc: "ตั้งวันที่ร้านปิด เพื่อให้การทำนายยอดขายไม่คาดว่าจะขายได้ในวันที่ปิด",
        weekly: "วันปิดประจำสัปดาห์",
        weeklyHint: "กดเลือกวันที่ร้านปิดทุกสัปดาห์",
        exceptions: "วันปิดพิเศษ / วันหยุด",
        add: "เพิ่ม",
        noExceptions: "ยังไม่มีวันปิดพิเศษ",
        closedKind: "ปิด",
        openKind: "เปิดพิเศษ",
        cancel: "ยกเลิก",
        save: "บันทึก",
        loadError: "โหลดปฏิทินไม่สำเร็จ",
        saveError: "บันทึกไม่สำเร็จ",
      }
    : {
        settings: "AI settings",
        calendar: "Calendar",
        title: "Opening calendar",
        desc: "Set the days the shop is closed so the forecast never predicts sales on them.",
        weekly: "Weekly closed days",
        weeklyHint: "Tap the days the shop is closed every week",
        exceptions: "One-off closures / holidays",
        add: "Add",
        noExceptions: "No one-off closures yet",
        closedKind: "Closed",
        openKind: "Open (override)",
        cancel: "Cancel",
        save: "Save",
        loadError: "Could not load the calendar",
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
  const days = WEEKDAYS[language];

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [exceptions, setExceptions] = useState<AICalendarException[]>([]);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    getOperatingCalendar()
      .then((res) => {
        setClosed(new Set(res.data.closed_weekdays ?? []));
        setExceptions(res.data.exceptions ?? []);
      })
      .catch(() => setError(t.loadError))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggleDay = (d: number) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  const addException = () => {
    if (!newDate || exceptions.some((e) => e.date === newDate)) return;
    setExceptions((prev) =>
      [...prev, { date: newDate, kind: "closed" as const }].sort((a, b) => a.date.localeCompare(b.date)),
    );
    setNewDate("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await updateOperatingCalendar({ closed_weekdays: [...closed].sort(), exceptions });
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
            <CalendarDays className="h-4 w-4" /> {t.calendar}
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
                <p className="text-sm text-gray-500 dark:text-gray-400">{t.desc}</p>

                <section className="mt-4">
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">{t.weekly}</p>
                  <div className="flex flex-wrap gap-2">
                    {days.map((label, d) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        className={`h-10 min-w-[3rem] rounded-lg border px-2 text-sm font-medium transition ${
                          closed.has(d)
                            ? "border-orange-500 bg-orange-500 text-white shadow-sm shadow-orange-500/30"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">{t.weeklyHint}</p>
                </section>

                <section className="mt-6">
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">{t.exceptions}</p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                    <button
                      onClick={addException}
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <Plus className="h-4 w-4" /> {t.add}
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {exceptions.map((ex) => (
                      <li
                        key={ex.date}
                        className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-1.5 text-sm dark:border-gray-800"
                      >
                        <span className="text-gray-700 dark:text-gray-200">
                          {ex.date}{" "}
                          <span className="text-gray-400">· {ex.kind === "open" ? t.openKind : t.closedKind}</span>
                        </span>
                        <button
                          onClick={() => setExceptions((prev) => prev.filter((e) => e.date !== ex.date))}
                          aria-label="remove"
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                    {exceptions.length === 0 && <li className="px-1 text-xs text-gray-400">{t.noExceptions}</li>}
                  </ul>
                </section>
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
