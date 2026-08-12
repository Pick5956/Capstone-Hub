"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2, Mic, X } from "lucide-react";
import { extractReceipt } from "@/src/lib/ai";
import { createExpense, expenseCategories, type ExpenseCategory } from "@/src/lib/expense";
import type { AIReceiptDraft } from "@/src/types/ai";

// Two optional AI input helpers, kept in ONE self-contained component so they are
// trivially removable — drop <AIInputTools/> into any chat input bar, delete the
// line to remove, or set NEXT_PUBLIC_AI_TOOLS=off to disable everywhere:
//   🎤 Voice   → browser Web Speech API (free, no server quota) → fills the input
//   📷 Receipt → Gemini vision reads a bill → editable draft → saves to expenses
// The receipt flow only ever proposes a draft; the owner reviews/edits and
// confirms before anything is written (deterministic-first, human-confirms).

const AI_TOOLS_ENABLED = process.env.NEXT_PUBLIC_AI_TOOLS !== "off";

const categoryLabels: Record<string, { th: string; en: string }> = {
  ingredient: { th: "วัตถุดิบ", en: "Ingredient" },
  labor: { th: "ค่าแรง", en: "Labor" },
  rent: { th: "ค่าเช่า", en: "Rent" },
  utilities: { th: "ค่าน้ำ/ไฟ", en: "Utilities" },
  equipment: { th: "อุปกรณ์", en: "Equipment" },
  other: { th: "อื่นๆ", en: "Other" },
};

type Props = {
  onInsertText: (text: string) => void;
  language: "th" | "en";
  disabled?: boolean;
};

// Shrink a photo to a modest JPEG before upload — smaller = faster + cheaper +
// well within request limits, and plenty sharp for OCR.
async function fileToDownscaledBase64(file: File, maxDim = 1400): Promise<{ base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("read failed"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new window.Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("decode failed"));
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { base64: dataUrl.split(",")[1] ?? "", mime: file.type || "image/jpeg" };
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: out.split(",")[1] ?? "", mime: "image/jpeg" };
}

export default function AIInputTools({ onInsertText, language, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<AIReceiptDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  if (!AI_TOOLS_ENABLED) return null;

  const t = (th: string, en: string) => (language === "th" ? th : en);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRecognition: any =
    typeof window !== "undefined"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : undefined;

  const toggleVoice = () => {
    if (!SpeechRecognition) {
      setError(t("เบราว์เซอร์นี้ยังไม่รองรับการพูด (ลองใช้ Chrome / Android)", "Voice isn't supported here — try Chrome / Android"));
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = language === "th" ? "th-TH" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const text = e?.results?.[0]?.[0]?.transcript?.trim();
      if (text) onInsertText(text);
    };
    recognitionRef.current = rec;
    setError(null);
    rec.start();
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);
    setSaved(false);
    setScanning(true);
    try {
      const { base64, mime } = await fileToDownscaledBase64(file);
      const res = await extractReceipt(base64, mime);
      setDraft(res.data.draft);
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (err as any)?.response?.status;
      setError(
        status === 429
          ? t("โควตาสแกนเต็มชั่วคราว ลองใหม่ในสักครู่", "Scan quota is full right now — try again shortly")
          : t("อ่านบิลไม่สำเร็จ ลองถ่ายใหม่ให้ชัดขึ้น", "Couldn't read the receipt — try a clearer photo"),
      );
    } finally {
      setScanning(false);
    }
  };

  const patchDraft = (patch: Partial<AIReceiptDraft>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const spent =
        draft.spent_at && /^\d{4}-\d{2}-\d{2}$/.test(draft.spent_at)
          ? draft.spent_at
          : new Date().toISOString().slice(0, 10);
      const category = (expenseCategories as readonly string[]).includes(draft.category)
        ? (draft.category as ExpenseCategory)
        : "other";
      const note = [draft.vendor, draft.note].filter(Boolean).join(" — ");
      await createExpense({ category, amount: Number(draft.amount) || 0, spent_at: spent, note });
      setSaved(true);
      window.setTimeout(() => {
        setDraft(null);
        setSaved(false);
      }, 1200);
    } catch {
      setError(t("บันทึกรายจ่ายไม่สำเร็จ", "Failed to save the expense"));
    } finally {
      setSaving(false);
    }
  };

  const iconBtn =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-all hover:-translate-y-0.5 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-orange-950/30 dark:hover:text-orange-400";

  return (
    <>
      <button
        type="button"
        onClick={toggleVoice}
        disabled={disabled}
        aria-label={t("พูดเพื่อพิมพ์", "Speak to type")}
        title={t("พูดเพื่อพิมพ์", "Speak to type")}
        className={
          listening
            ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm shadow-red-500/40 animate-pulse"
            : iconBtn
        }
      >
        <Mic className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || scanning}
        aria-label={t("สแกนบิลลงรายจ่าย", "Scan a bill into expenses")}
        title={t("สแกนบิลลงรายจ่าย", "Scan a bill into expenses")}
        className={iconBtn}
      >
        {scanning ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> : <Camera className="h-4 w-4" />}
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPickImage} className="hidden" />

      {/* Receipt draft — review & edit before saving */}
      {draft && (
        <div
          className="fixed inset-0 flex items-end justify-center bg-black/40 p-4 backdrop-blur-[1px] sm:items-center"
          style={{ zIndex: 100 }}
          onClick={() => !saving && setDraft(null)}
        >
          <div
            className="ai-reveal-down w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
                <Camera className="h-4 w-4 text-orange-500" />
                {t("ตรวจก่อนบันทึกรายจ่าย", "Review before saving")}
              </span>
              <button
                type="button"
                onClick={() => !saving && setDraft(null)}
                aria-label={t("ปิด", "Close")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              {draft.confidence === "low" && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  {t("ภาพอ่านยาก ช่วยตรวจตัวเลขให้ดีก่อนนะครับ", "Image was hard to read — please double-check the numbers")}
                </p>
              )}

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{t("หมวด", "Category")}</span>
                <select
                  value={(expenseCategories as readonly string[]).includes(draft.category) ? draft.category : "other"}
                  onChange={(e) => patchDraft({ category: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                >
                  {expenseCategories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabels[c] ? categoryLabels[c][language] : c}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{t("จำนวนเงิน (บาท)", "Amount (THB)")}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={Number.isFinite(draft.amount) ? draft.amount : 0}
                    onChange={(e) => patchDraft({ amount: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-orange-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{t("วันที่", "Date")}</span>
                  <input
                    type="date"
                    value={/^\d{4}-\d{2}-\d{2}$/.test(draft.spent_at) ? draft.spent_at : new Date().toISOString().slice(0, 10)}
                    onChange={(e) => patchDraft({ spent_at: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{t("ร้าน / รายละเอียด", "Vendor / note")}</span>
                <input
                  type="text"
                  value={[draft.vendor, draft.note].filter(Boolean).join(" — ")}
                  onChange={(e) => patchDraft({ vendor: e.target.value, note: "" })}
                  placeholder={t("เช่น ตลาดสด — ผัก", "e.g. Market — vegetables")}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                />
              </label>

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="button"
                onClick={saveDraft}
                disabled={saving || saved}
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/30 transition-all hover:brightness-105 hover:shadow-md disabled:opacity-60"
              >
                {saved ? (
                  <><Check className="h-4 w-4" /> {t("บันทึกแล้ว", "Saved")}</>
                ) : saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {t("กำลังบันทึก...", "Saving...")}</>
                ) : (
                  t("บันทึกลงรายจ่าย", "Save to expenses")
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transient error (voice unsupported / scan failed) when no modal is open */}
      {error && !draft && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-xs text-white shadow-lg dark:bg-white dark:text-gray-900" style={{ zIndex: 100 }}>
          <button type="button" onClick={() => setError(null)} className="flex items-center gap-2">
            {error} <X className="h-3.5 w-3.5 opacity-70" />
          </button>
        </div>
      )}
    </>
  );
}
