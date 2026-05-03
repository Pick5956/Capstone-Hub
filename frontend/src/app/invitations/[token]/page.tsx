"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BrandMark, ThemeButton, useWorkspaceUser, formatUserName } from "../../restaurants/restaurantWorkspaceUi";
import { useAuth } from "@/src/providers/AuthProvider";

export default function InvitationAcceptPage() {
  const params = useParams<{ token: string }>();
  const { logout, openLoginModal } = useAuth();
  const user = useWorkspaceUser();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur">
        <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <ThemeButton />
            {user ? (
              <button
                type="button"
                onClick={logout}
                className="h-9 px-3 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                ออกจากระบบ
              </button>
            ) : (
              <button
                type="button"
                onClick={openLoginModal}
                className="h-9 px-3 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[12px] font-semibold hover:opacity-90 transition-opacity"
              >
                เข้าสู่ระบบ
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Restaurant invitation</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">คำเชิญเข้าร่วมร้าน</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">ลิงก์นี้ใช้สำหรับพนักงานรับคำเชิญจากร้าน</p>
          </div>

          <div className="p-5 space-y-4">
            <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">ครัวบ้านส้ม</p>
                  <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">สาขาหลัก · ร้านอาหารไทย</p>
                </div>
                <span className="w-fit rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  บทบาท: แคชเชียร์
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                <div>
                  <p className="text-gray-400">ผู้เชิญ</p>
                  <p className="mt-0.5 font-medium text-gray-800 dark:text-gray-200">คุณสมชาย</p>
                </div>
                <div>
                  <p className="text-gray-400">หมดอายุ</p>
                  <p className="mt-0.5 font-medium text-gray-800 dark:text-gray-200">อีก 48 ชั่วโมง</p>
                </div>
                <div>
                  <p className="text-gray-400">Token</p>
                  <p className="mt-0.5 font-mono font-medium text-gray-800 dark:text-gray-200 truncate">{params.token}</p>
                </div>
              </div>
            </div>

            {user ? (
              <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/15 px-3 py-2">
                <p className="text-[12px] font-medium text-emerald-900 dark:text-emerald-200">พร้อมรับคำเชิญในชื่อ {formatUserName(user)}</p>
                <p className="mt-0.5 text-[11px] text-emerald-800/80 dark:text-emerald-300/80">เมื่อผูก backend แล้ว ปุ่มนี้จะสร้าง membership ให้บัญชีนี้</p>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15 px-3 py-2">
                <p className="text-[12px] font-medium text-amber-900 dark:text-amber-200">ต้องเข้าสู่ระบบก่อนรับคำเชิญ</p>
                <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">ถ้ายังไม่มีบัญชี ให้สมัครหรือ login ด้วย Google แล้วกลับมาที่ลิงก์นี้</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={!user}
                className="h-10 flex-1 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                รับคำเชิญและเข้าร่วมร้าน
              </button>
              <Link
                href="/restaurants"
                className="h-10 flex-1 rounded-md border border-gray-200 dark:border-gray-700 text-[13px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors inline-flex items-center justify-center"
              >
                ไปหน้าเลือกร้าน
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

