"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PLAN, RESTAURANTS, Restaurant, WorkspaceShell } from "./restaurantWorkspaceUi";

function RestaurantCard({
  restaurant,
  selected,
  onSelect,
}: {
  restaurant: Restaurant;
  selected: boolean;
  onSelect: () => void;
}) {
  const membershipStyle = {
    owner: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
    manager: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
    staff: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  }[restaurant.membershipType];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left border rounded-md bg-white dark:bg-gray-950 p-4 transition-colors ${
        selected
          ? "border-orange-500 ring-2 ring-orange-500/15"
          : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">{restaurant.name}</h3>
            {selected && (
              <span className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-orange-600 text-white shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400 truncate">{restaurant.branch} · {restaurant.type}</p>
        </div>
        <span className={`text-[11px] font-medium px-2 py-1 rounded-md ${membershipStyle}`}>
          {restaurant.role}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        <div className="rounded-md bg-gray-50 dark:bg-gray-900 px-3 py-2">
          <p className="text-gray-400">บทบาท</p>
          <p className="mt-0.5 font-medium text-gray-800 dark:text-gray-200 truncate">{restaurant.role}</p>
        </div>
        <div className="rounded-md bg-gray-50 dark:bg-gray-900 px-3 py-2">
          <p className="text-gray-400">สิทธิ์</p>
          <p className="mt-0.5 font-medium text-gray-800 dark:text-gray-200 truncate">{restaurant.permissions}</p>
        </div>
        <div className="rounded-md bg-gray-50 dark:bg-gray-900 px-3 py-2">
          <p className="text-gray-400">โต๊ะ</p>
          <p className="mt-0.5 font-medium text-gray-800 dark:text-gray-200">{restaurant.tables} โต๊ะ</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="truncate">{restaurant.address}</span>
        <span className="shrink-0">ทีม {restaurant.staff} คน</span>
      </div>
      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">เปิดล่าสุด {restaurant.lastOpened}</p>
    </button>
  );
}

function QuickAction({
  href,
  title,
  description,
  tone,
}: {
  href: string;
  title: string;
  description: string;
  tone: "orange" | "emerald";
}) {
  const cls =
    tone === "orange"
      ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
      : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300";

  return (
    <Link href={href} className="block rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4 hover:border-orange-300 dark:hover:border-orange-800 transition-colors">
      <div className={`h-9 w-9 rounded-md inline-flex items-center justify-center ${cls}`}>
        {tone === "orange" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
            <path d="M10 17l5-5-5-5M15 12H3" />
          </svg>
        )}
      </div>
      <h3 className="mt-3 text-[14px] font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{description}</p>
    </Link>
  );
}

function EmptyRestaurantsState() {
  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto h-12 w-12 rounded-md bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 inline-flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M3 7h18M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7" />
            <path d="M9 12h6M9 16h4" />
          </svg>
        </div>
        <h3 className="mt-4 text-[16px] font-semibold text-gray-900 dark:text-white">ยังไม่มีร้านในบัญชีนี้</h3>
        <p className="mt-2 text-[13px] text-gray-500 dark:text-gray-400">
          เริ่มได้สองทาง: ถ้าคุณเป็นเจ้าของร้านให้สร้างร้านแรก หรือถ้าเป็นพนักงานให้ใช้รหัสเชิญจากร้าน
        </p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Link
            href="/restaurants/new"
            className="h-10 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold inline-flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            สร้างร้านแรก
          </Link>
          <Link
            href="/restaurants/join"
            className="h-10 rounded-md border border-gray-200 dark:border-gray-700 text-[13px] font-semibold text-gray-700 dark:text-gray-200 inline-flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            เข้าร่วมร้าน
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantsPage() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(RESTAURANTS[0]?.id ?? "");
  const hasRestaurants = RESTAURANTS.length > 0;
  const selectedRestaurant = useMemo(
    () => RESTAURANTS.find((restaurant) => restaurant.id === selectedId),
    [selectedId]
  );
  const ownedCount = RESTAURANTS.filter((restaurant) => restaurant.membershipType === "owner").length;
  const joinedCount = RESTAURANTS.length - ownedCount;
  const isPlanFull = PLAN.usedRestaurants >= PLAN.maxRestaurants;

  return (
    <WorkspaceShell
      title="เลือกร้านที่ต้องการจัดการ"
      description="บัญชีเดียวดูแลได้หลายร้านหรือหลายสาขา ส่วนการสร้างร้านและการเข้าร่วมร้านแยกเป็นขั้นตอนเฉพาะ"
    >
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <section className="space-y-4">
          <div className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 rounded-md">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">ร้านของฉัน</h2>
                <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">รวมร้านที่เป็นเจ้าของ ผู้จัดการ หรือพนักงานจาก membership ของบัญชีนี้</p>
              </div>
              <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                {RESTAURANTS.length} ร้าน
              </span>
            </div>
            <div className="p-4 space-y-3">
              {hasRestaurants ? (
                RESTAURANTS.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    selected={restaurant.id === selectedId}
                    onSelect={() => setSelectedId(restaurant.id)}
                  />
                ))
              ) : (
                <EmptyRestaurantsState />
              )}
            </div>
          </div>

          {hasRestaurants && (
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 lg:mx-0 border-t lg:border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 lg:rounded-md backdrop-blur">
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] text-gray-500 dark:text-gray-400">ร้านที่เลือก</p>
                <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{selectedRestaurant?.name ?? "ยังไม่ได้เลือกร้าน"}</p>
              </div>
              <button
                type="button"
                disabled={!selectedRestaurant}
                onClick={() => router.push("/home")}
                className="h-10 px-4 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                เข้า dashboard ร้านนี้
              </button>
            </div>
          </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">แพ็กเกจปัจจุบัน</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{PLAN.name}</h2>
              </div>
              <span className={`text-[11px] font-medium px-2 py-1 rounded-md ${isPlanFull ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"}`}>
                {PLAN.usedRestaurants}/{PLAN.maxRestaurants} ร้าน
              </span>
            </div>
            <p className="mt-3 text-[12px] text-gray-500 dark:text-gray-400">Free เปิดได้ 1 ร้าน และสมาชิก 3 คนต่อร้าน</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-gray-50 dark:bg-gray-900 px-3 py-2">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">เป็นเจ้าของ</p>
                <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white">{ownedCount} ร้าน</p>
              </div>
              <div className="rounded-md bg-gray-50 dark:bg-gray-900 px-3 py-2">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">เข้าร่วม</p>
                <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white">{joinedCount} ร้าน</p>
              </div>
            </div>
            {isPlanFull && (
              <p className="mt-3 rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                ถึง limit ร้านแล้ว สร้างร้านเพิ่มต้องอัปเกรดแพ็กเกจ
              </p>
            )}
          </div>

          <QuickAction
            href="/restaurants/new"
            title="สร้างร้านใหม่"
            description="สำหรับเจ้าของร้านหรือผู้ดูแลที่ต้องการเปิดร้านหรือสาขาใหม่"
            tone="orange"
          />
          <QuickAction
            href="/restaurants/join"
            title="เข้าร่วมร้าน"
            description="สำหรับพนักงานที่ได้รับรหัสเชิญหรือลิงก์จากร้าน"
            tone="emerald"
          />
        </aside>
      </div>
    </WorkspaceShell>
  );
}
