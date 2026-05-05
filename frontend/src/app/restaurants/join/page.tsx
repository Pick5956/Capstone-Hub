"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { BackToRestaurants, WorkspaceShell } from "../restaurantWorkspaceUi";

function InvitePreview() {
  const { language } = useLanguage();

  const copy = language === "th"
    ? {
        preview: "ตัวอย่างคำเชิญ",
        restaurant: "ครัวบ้านส้ม",
        subtitle: "สาขาหลัก · ร้านอาหารไทย",
        role: "แคชเชียร์",
        body: "ผู้จัดการร้านส่งลิงก์เชิญให้คุณเข้าร่วมทีม เพื่อดูออเดอร์ โต๊ะ และการชำระเงิน",
      }
    : {
        preview: "Invitation preview",
        restaurant: "Baan Som Kitchen",
        subtitle: "Main branch · Thai restaurant",
        role: "Cashier",
        body: "A manager sends this invitation link so you can join the team and access orders, tables, and payments.",
      };

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{copy.preview}</p>
      <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.restaurant}</p>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{copy.subtitle}</p>
          </div>
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            {copy.role}
          </span>
        </div>
        <p className="mt-3 text-[12px] text-gray-600 dark:text-gray-400">{copy.body}</p>
        <p className="mt-2 max-w-full break-all rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          https://localhost:3000/invitations/AbCdEfGhIjKlMnOpQrStUvWxYz12_345
        </p>
      </div>
    </div>
  );
}

function extractInvitationToken(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const invitationIndex = parts.findIndex((part) => part === "invitations");
    if (invitationIndex >= 0 && parts[invitationIndex + 1]) {
      return parts[invitationIndex + 1];
    }
  } catch {
    // Fall through to raw token parsing.
  }

  const candidate = trimmed
    .split(/[?#\s]/)[0]
    .split("/")
    .filter(Boolean)
    .pop() ?? trimmed;

  return candidate.trim();
}

function isLikelyInvitationToken(value: string) {
  return /^[A-Za-z0-9_-]{24,128}$/.test(value);
}

export default function JoinRestaurantPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const [invitationInput, setInvitationInput] = useState("");
  const [error, setError] = useState("");

  const copy = language === "th"
    ? {
        pageTitle: "เข้าร่วมร้าน",
        pageDescription: "สำหรับพนักงานที่ได้รับลิงก์เชิญหรือ token คำเชิญจากเจ้าของร้านหรือผู้จัดการ",
        panelTitle: "วางลิงก์เชิญ",
        panelDescription: "ใช้ลิงก์จากหน้า พนักงาน ของร้าน หรือวางเฉพาะ token ท้ายลิงก์ก็ได้",
        inputLabel: "ลิงก์เชิญหรือ token",
        inputPlaceholder: "เช่น https://localhost:3000/invitations/AbCdEf... หรือ AbCdEf...",
        openButton: "เปิดคำเชิญ",
        pasteButton: "วางจากคลิปบอร์ด",
        flowTitle: "Flow ใหม่ของ Phase B",
        flowDescription: "ระบบจะพาไปหน้า `/invitations/[token]` เพื่อตรวจสิทธิ์ อีเมล วันหมดอายุ และรับคำเชิญก่อนสร้าง membership",
        nextTitle: "หลังจากเปิดคำเชิญแล้วจะเกิดอะไรขึ้น?",
        nextSteps: [
          "ระบบแสดงชื่อร้าน บทบาท และวันหมดอายุของคำเชิญ",
          "ถ้ายังไม่ login ให้เข้าสู่ระบบก่อนในหน้าเดียวกัน",
          "กดรับคำเชิญแล้วระบบตั้งร้านนี้เป็น active restaurant ให้อัตโนมัติ",
        ],
        validationRequired: "กรุณาวางลิงก์เชิญหรือ token คำเชิญ",
        validationInvalid: "รูปแบบลิงก์หรือ token ไม่ถูกต้อง",
        clipboardError: "อ่านคลิปบอร์ดไม่ได้ กรุณาวางลิงก์เชิญเอง",
      }
    : {
        pageTitle: "Join a restaurant",
        pageDescription: "For staff members who received an invitation link or token from an owner or manager.",
        panelTitle: "Paste an invitation link",
        panelDescription: "Use the link from the restaurant team page, or paste only the token at the end of the link.",
        inputLabel: "Invitation link or token",
        inputPlaceholder: "For example, https://localhost:3000/invitations/AbCdEf... or AbCdEf...",
        openButton: "Open invitation",
        pasteButton: "Paste from clipboard",
        flowTitle: "New Phase B flow",
        flowDescription: "The system takes you to `/invitations/[token]` to verify permissions, email, expiry, and then accept the invitation before creating the membership.",
        nextTitle: "What happens after opening the invitation?",
        nextSteps: [
          "The system shows the restaurant name, role, and invitation expiry.",
          "If you are not signed in, you can sign in on the same page.",
          "After accepting, that restaurant becomes your active restaurant automatically.",
        ],
        validationRequired: "Please paste an invitation link or token.",
        validationInvalid: "The invitation link or token format is invalid.",
        clipboardError: "Clipboard access failed. Please paste the invitation manually.",
      };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const token = extractInvitationToken(invitationInput);
    if (!token) {
      setError(copy.validationRequired);
      return;
    }
    if (!isLikelyInvitationToken(token)) {
      setError(copy.validationInvalid);
      return;
    }

    router.push(`/invitations/${token}`);
  };

  const pasteInvite = async () => {
    setError("");
    try {
      const text = await navigator.clipboard.readText();
      setInvitationInput(text.trim());
    } catch {
      setError(copy.clipboardError);
    }
  };

  return (
    <WorkspaceShell title={copy.pageTitle} description={copy.pageDescription}>
      <div className="mt-6">
        <BackToRestaurants />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.panelTitle}</h2>
            <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{copy.panelDescription}</p>
          </div>

          <form onSubmit={submit} className="space-y-4 p-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.inputLabel}</span>
              <textarea
                value={invitationInput}
                onChange={(event) => setInvitationInput(event.target.value)}
                rows={4}
                placeholder={copy.inputPlaceholder}
                className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="submit"
                className="h-10 rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900"
              >
                {copy.openButton}
              </button>
              <button
                type="button"
                onClick={pasteInvite}
                className="h-10 rounded-md border border-gray-200 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {copy.pasteButton}
              </button>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900/50 dark:bg-sky-900/15">
              <p className="text-[12px] font-medium text-sky-900 dark:text-sky-200">{copy.flowTitle}</p>
              <p className="mt-0.5 text-[11px] text-sky-800/80 dark:text-sky-300/80">{copy.flowDescription}</p>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <InvitePreview />
          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">{copy.nextTitle}</h3>
            <ul className="mt-2 space-y-1.5 text-[12px] text-gray-500 dark:text-gray-400">
              {copy.nextSteps.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
