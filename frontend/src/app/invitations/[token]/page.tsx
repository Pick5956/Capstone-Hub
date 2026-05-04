"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark, ThemeButton, useWorkspaceUser, formatUserName } from "../../restaurants/restaurantWorkspaceUi";
import { useAuth } from "@/src/providers/AuthProvider";
import { acceptInvitation, getInvitationByToken } from "@/src/lib/invitation";
import { restaurantRepository } from "../../repositories/restaurantRepository";
import type { Invitation } from "@/src/types/restaurant";
import { Skeleton, SkeletonText } from "@/src/components/shared/Skeleton";
import { createSingleFlight } from "@/src/lib/singleFlight";

const ROLE_LABEL: Record<string, string> = {
  owner: "เจ้าของร้าน",
  manager: "ผู้จัดการ",
  cashier: "แคชเชียร์",
  waiter: "พนักงานเสิร์ฟ",
  chef: "ครัว",
};

function roleLabel(invitation: Invitation | null) {
  const name = invitation?.role?.name ?? "";
  return ROLE_LABEL[name] ?? (name || "พนักงาน");
}

function formatExpiry(value?: string | null) {
  if (!value) return "ไม่กำหนด";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่กำหนด";
  return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function invitationStateLabel(invitation: Invitation | null, usable: boolean) {
  if (!invitation) return "กำลังตรวจสอบ";
  if (usable) return "พร้อมรับคำเชิญ";
  if (invitation.status === "accepted") return "ถูกใช้งานแล้ว";
  if (invitation.status === "revoked") return "ถูกยกเลิกแล้ว";
  if (invitation.status === "expired") return "หมดอายุแล้ว";
  return "ไม่สามารถใช้งานได้";
}

export default function InvitationAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { logout, openLoginModal, refreshMemberships } = useAuth();
  const user = useWorkspaceUser();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [usable, setUsable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const acceptOnceRef = useRef(createSingleFlight());

  const token = params.token;
  const statusLabel = useMemo(() => invitationStateLabel(invitation, usable), [invitation, usable]);
  const emailMismatch = Boolean(invitation?.email && user?.email && invitation.email.toLowerCase() !== user.email.toLowerCase());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getInvitationByToken(token)
      .then((res) => {
        if (!active) return;
        setInvitation(res.data.invitation);
        setUsable(res.data.usable);
      })
      .catch(() => {
        if (!active) return;
        setInvitation(null);
        setUsable(false);
        setError("ไม่พบคำเชิญนี้ หรือคำเชิญถูกลบไปแล้ว");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleAccept = async () => {
    if (!user) {
      openLoginModal();
      return;
    }
    if (!usable || emailMismatch) return;

    await acceptOnceRef.current(async () => {
      setAccepting(true);
      setError("");
      try {
        const res = await acceptInvitation(token);
        const membership = res.data.membership;
        restaurantRepository.setActiveId(membership.restaurant_id);
        await refreshMemberships();
        router.push("/home");
      } catch {
        setError("รับคำเชิญไม่สำเร็จ กรุณาตรวจสอบบัญชีหรือขอคำเชิญใหม่");
      } finally {
        setAccepting(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <BrandMark />
          <div className="flex items-center gap-2">
            <ThemeButton />
            {user ? (
              <button
                type="button"
                onClick={logout}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                ออกจากระบบ
              </button>
            ) : (
              <button
                type="button"
                onClick={openLoginModal}
                className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900"
              >
                เข้าสู่ระบบ
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Restaurant invitation</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">คำเชิญเข้าร่วมร้าน</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">ตรวจสอบรายละเอียดก่อนรับคำเชิญเข้าทีม</p>
          </div>

          <div className="space-y-4 p-5">
            {loading ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-full max-w-sm">
                    <Skeleton className="h-5 w-44" />
                    <SkeletonText lines={2} className="mt-3" />
                  </div>
                  <Skeleton className="h-7 w-28" />
                </div>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              </div>
            ) : invitation ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-gray-900 dark:text-white">{invitation.restaurant?.name ?? "ร้านอาหาร"}</p>
                    <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">{invitation.restaurant?.address || "ยังไม่ระบุที่อยู่"}</p>
                  </div>
                  <span className={`w-fit rounded-md px-2 py-1 text-[11px] font-medium ${
                    usable
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                  }`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 text-[12px] sm:grid-cols-3">
                  <div>
                    <p className="text-gray-400">บทบาท</p>
                    <p className="mt-0.5 font-medium text-gray-800 dark:text-gray-200">{roleLabel(invitation)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">หมดอายุ</p>
                    <p className="mt-0.5 font-medium text-gray-800 dark:text-gray-200">{formatExpiry(invitation.expires_at)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">อีเมลที่รับได้</p>
                    <p className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{invitation.email || "ทุกบัญชีที่มีลิงก์"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {user ? (
              <div className={`rounded-md border px-3 py-2 ${
                emailMismatch
                  ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
                  : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/15"
              }`}>
                <p className={`text-[12px] font-medium ${
                  emailMismatch ? "text-red-800 dark:text-red-300" : "text-emerald-900 dark:text-emerald-200"
                }`}>
                  {emailMismatch ? "บัญชีนี้ไม่ตรงกับอีเมลในคำเชิญ" : `พร้อมรับคำเชิญในชื่อ ${formatUserName(user)}`}
                </p>
                <p className={`mt-0.5 text-[11px] ${
                  emailMismatch ? "text-red-700/80 dark:text-red-300/80" : "text-emerald-800/80 dark:text-emerald-300/80"
                }`}>
                  {emailMismatch ? `คำเชิญนี้ระบุ ${invitation?.email}` : user.email}
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-900/15">
                <p className="text-[12px] font-medium text-amber-900 dark:text-amber-200">ต้องเข้าสู่ระบบก่อนรับคำเชิญ</p>
                <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">สมัครหรือ login ด้วย Google แล้วกดรับคำเชิญในหน้านี้ได้เลย</p>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={loading || !invitation || !usable || emailMismatch || accepting}
                onClick={handleAccept}
                className="h-10 flex-1 rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900"
              >
                {accepting ? "กำลังรับคำเชิญ..." : user ? "รับคำเชิญและเข้าร่วมร้าน" : "เข้าสู่ระบบเพื่อรับคำเชิญ"}
              </button>
              <Link
                href="/restaurants"
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-gray-200 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
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
