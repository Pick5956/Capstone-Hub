"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { resetPassword } from "@/src/lib/auth";
import { useLanguage } from "@/src/providers/LanguageProvider";

const copyByLanguage = {
  th: {
    eyebrow: "Account recovery",
    title: "ตั้งรหัสผ่านใหม่",
    subtitle: "ลิงก์นี้ใช้ได้ช่วงเวลาจำกัด กรุณาตั้งรหัสผ่านใหม่เพื่อกลับเข้าใช้งาน Restaurant Hub",
    missingToken: "ลิงก์กู้รหัสผ่านไม่ถูกต้องหรือไม่มี token",
    password: "รหัสผ่านใหม่",
    confirmPassword: "ยืนยันรหัสผ่านใหม่",
    passwordPlaceholder: "อย่างน้อย 8 ตัวอักษร",
    submit: "บันทึกรหัสผ่านใหม่",
    submitting: "กำลังบันทึก...",
    mismatch: "รหัสผ่านไม่ตรงกัน",
    tooShort: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
    failed: "ตั้งรหัสผ่านใหม่ไม่สำเร็จ ลิงก์อาจหมดอายุแล้ว",
    success: "ตั้งรหัสผ่านใหม่สำเร็จแล้ว กลับไปเข้าสู่ระบบได้เลย",
    backHome: "กลับหน้าแรก",
  },
  en: {
    eyebrow: "Account recovery",
    title: "Set a new password",
    subtitle: "This link is time limited. Set a new password to get back into Restaurant Hub.",
    missingToken: "This reset link is invalid or missing a token.",
    password: "New password",
    confirmPassword: "Confirm new password",
    passwordPlaceholder: "At least 8 characters",
    submit: "Save new password",
    submitting: "Saving...",
    mismatch: "Passwords do not match.",
    tooShort: "Password must be at least 8 characters.",
    failed: "Could not reset password. This link may have expired.",
    success: "Password reset successfully. You can sign in again.",
    backHome: "Back to home",
  },
};

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { language } = useLanguage();
  const copy = language === "th" ? copyByLanguage.th : copyByLanguage.en;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : copy.missingToken);
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError(copy.missingToken);
      return;
    }
    if (password.length < 8) {
      setError(copy.tooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(copy.mismatch);
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(token, password);
      if (res) {
        setSuccess(copy.success);
        setPassword("");
        setConfirmPassword("");
      } else {
        setError(copy.failed);
      }
    } catch {
      setError(copy.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <section className="w-full overflow-hidden rounded-md border border-white/10 bg-gray-900 shadow-2xl">
          <div className="border-b border-white/10 px-5 py-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-400">{copy.eyebrow}</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight">{copy.title}</h1>
            <p className="mt-2 text-sm leading-6 text-gray-400">{copy.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-gray-300">{copy.password}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={copy.passwordPlaceholder}
                autoComplete="new-password"
                className="h-10 w-full rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-gray-300">{copy.confirmPassword}</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={copy.passwordPlaceholder}
                autoComplete="new-password"
                className="h-10 w-full rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15"
              />
            </label>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token}
              className="h-11 w-full rounded-md bg-white text-sm font-bold text-gray-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? copy.submitting : copy.submit}
            </button>

            <Link
              href="/"
              className="block rounded-md border border-white/10 px-3 py-2 text-center text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {copy.backHome}
            </Link>
          </form>
        </section>
      </div>
    </main>
  );
}
