"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import { restaurantRepository } from "../repositories/restaurantRepository";
import type { Membership } from "@/src/types/restaurant";
import { PLAN, WorkspaceShell, getRestaurantTypeLabel } from "./restaurantWorkspaceUi";
import { RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";
import { getDefaultWorkspaceRoute, getWorkModeHint, getWorkModeName } from "@/src/lib/workMode";

const ROLE_LABEL: Record<string, Record<Language, string>> = {
  owner: { th: "เจ้าของร้าน", en: "Owner" },
  manager: { th: "ผู้จัดการ", en: "Manager" },
  cashier: { th: "แคชเชียร์", en: "Cashier" },
  waiter: { th: "พนักงานเสิร์ฟ", en: "Waiter" },
  chef: { th: "ครัว", en: "Kitchen" },
};

const ROLE_TONE: Record<string, string> = {
  owner: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  manager: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  cashier: "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300",
  waiter: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  chef: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
};

function roleNameOf(membership: Membership) {
  return membership.role?.name ?? "waiter";
}

function roleLabelOf(membership: Membership, language: Language) {
  return ROLE_LABEL[roleNameOf(membership)]?.[language] ?? roleNameOf(membership);
}

function canManageInvites(membership: Membership) {
  const roleName = roleNameOf(membership);
  return roleName === "owner" || roleName === "manager";
}

function permissionLabelOf(membership: Membership, language: Language) {
  if (membership.role?.permissions === `["*"]`) return language === "th" ? "ทุกเมนู" : "All sections";
  try {
    const permissions = JSON.parse(membership.role?.permissions ?? "[]") as string[];
    return permissions.length ? `${permissions.length} ${language === "th" ? "สิทธิ์" : "permissions"}` : language === "th" ? "พื้นฐาน" : "Basic";
  } catch {
    return language === "th" ? "พื้นฐาน" : "Basic";
  }
}

function RestaurantCard({
  membership,
  selected,
  onSelect,
}: {
  membership: Membership;
  selected: boolean;
  onSelect: () => void;
}) {
  const { language } = useLanguage();
  const restaurant = membership.restaurant;
  const roleName = roleNameOf(membership);
  const membershipStyle = ROLE_TONE[roleName] ?? ROLE_TONE.waiter;
  const roleLabel = roleLabelOf(membership, language);
  const branchName = restaurant?.branch_name?.trim() || (language === "th" ? "สาขาหลัก" : "Main branch");
  const restaurantType = getRestaurantTypeLabel(restaurant?.restaurant_type?.trim() || "ร้านอาหาร", language);
  const hours = restaurant?.open_time && restaurant?.close_time
    ? `${restaurant.open_time}-${restaurant.close_time}`
    : language === "th" ? "ยังไม่ระบุเวลา" : "Hours not set";
  const tableCount = restaurant?.table_count ? `${restaurant.table_count} ${language === "th" ? "โต๊ะ" : "tables"}` : language === "th" ? "ยังไม่ระบุโต๊ะ" : "Tables not set";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border bg-white p-4 text-left transition-colors dark:bg-gray-950 ${
        selected
          ? "border-orange-500 ring-2 ring-orange-500/15"
          : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
            {restaurant?.logo ? (
              <Image
                src={restaurant.logo}
                alt={`${language === "th" ? "โลโก้ร้าน" : "Restaurant logo"} ${restaurant?.name ?? (language === "th" ? "ร้านอาหาร" : "Restaurant")}`}
                width={40}
                height={40}
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
                <path d="M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3M21 15v7" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[15px] font-semibold text-gray-900 dark:text-white">
                {restaurant?.name ?? (language === "th" ? "ร้านอาหาร" : "Restaurant")}
              </h3>
              {selected && (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-[12px] text-gray-500 dark:text-gray-400">
              {branchName} · {restaurantType}
            </p>
            <p className="mt-1 truncate text-[12px] text-gray-500 dark:text-gray-400">
              {restaurant?.phone || (language === "th" ? "ยังไม่ระบุเบอร์" : "No phone")} · {language === "th" ? "เข้าร่วมเมื่อ" : "Joined on"}{" "}
              {new Date(membership.joined_at).toLocaleDateString(language === "th" ? "th-TH" : "en-US")}
            </p>
          </div>
        </div>
        <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${membershipStyle}`}>
          {roleLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
          <p className="text-gray-400">{language === "th" ? "บทบาท" : "Role"}</p>
          <p className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{roleLabel}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
          <p className="text-gray-400">{language === "th" ? "ประเภท" : "Type"}</p>
          <p className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{restaurantType}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
          <p className="text-gray-400">{language === "th" ? "สิทธิ์" : "Permissions"}</p>
          <p className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{permissionLabelOf(membership, language)}</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
          <p className="text-gray-400">{language === "th" ? "เวลา/โต๊ะ" : "Hours / tables"}</p>
          <p className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{hours} · {tableCount}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
          <p className="text-gray-400">{language === "th" ? "สาขา" : "Branch"}</p>
          <p className="mt-0.5 truncate font-medium text-gray-800 dark:text-gray-200">{branchName}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="truncate">{restaurant?.address || (language === "th" ? "ยังไม่ระบุที่อยู่" : "No address")}</span>
        {canManageInvites(membership) && <span className="shrink-0">{language === "th" ? "จัดการคำเชิญได้" : "Can manage invites"}</span>}
      </div>
      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">Restaurant ID {membership.restaurant_id}</p>
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
      ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300";

  return (
    <Link
      href={href}
      className="block rounded-md border border-gray-200 bg-white p-4 transition-colors hover:border-orange-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-orange-800"
    >
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${cls}`}>
        {tone === "orange" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
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
  const { language } = useLanguage();

  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M3 7h18M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
            <path d="M9 12h6M9 16h4" />
          </svg>
        </div>
        <h3 className="mt-4 text-[16px] font-semibold text-gray-900 dark:text-white">
          {language === "th" ? "ยังไม่มีร้านในบัญชีนี้" : "This account has no restaurants yet"}
        </h3>
        <p className="mt-2 text-[13px] text-gray-500 dark:text-gray-400">
          {language === "th"
            ? "เริ่มได้สองทาง: ถ้าคุณเป็นเจ้าของร้านให้สร้างร้านแรก หรือถ้าเป็นพนักงานให้เปิดลิงก์คำเชิญจากร้าน"
            : "You can start in two ways: create the first restaurant if you own it, or open an invitation link if you were invited as staff."}
        </p>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href="/restaurants/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900"
          >
            {language === "th" ? "สร้างร้านแรก" : "Create first restaurant"}
          </Link>
          <Link
            href="/restaurants/join"
            className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {language === "th" ? "เปิดลิงก์เชิญ" : "Open invite link"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const { memberships, activeMembership, loading, setActiveRestaurant, refreshMemberships } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(
    activeMembership?.restaurant_id ?? memberships[0]?.restaurant_id ?? null
  );
  const hasRestaurants = memberships.length > 0;

  useEffect(() => {
    refreshMemberships();
  }, [refreshMemberships]);

  const effectiveSelectedId = selectedId && memberships.some((membership) => membership.restaurant_id === selectedId)
    ? selectedId
    : activeMembership?.restaurant_id ?? memberships[0]?.restaurant_id ?? null;

  const selectedRestaurant = useMemo(
    () => memberships.find((membership) => membership.restaurant_id === effectiveSelectedId) ?? null,
    [memberships, effectiveSelectedId]
  );
  const ownedCount = memberships.filter((membership) => roleNameOf(membership) === "owner").length;
  const joinedCount = memberships.length - ownedCount;
  const usedRestaurants = memberships.length;
  const isPlanFull = usedRestaurants >= PLAN.maxRestaurants;

  const enterDashboard = () => {
    if (!selectedRestaurant) return;
    restaurantRepository.setActiveId(selectedRestaurant.restaurant_id);
    setActiveRestaurant(selectedRestaurant.restaurant_id);
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next?.startsWith("/") ? next : getDefaultWorkspaceRoute(selectedRestaurant));
  };

  return (
    <WorkspaceShell
      title={language === "th" ? "เลือกร้านที่ต้องการจัดการ" : "Choose a restaurant to manage"}
      description={language === "th"
        ? "บัญชีเดียวดูแลได้หลายร้านหรือหลายสาขา ส่วนการสร้างร้านและการเข้าร่วมร้านแยกเป็นขั้นตอนเฉพาะ"
        : "One account can manage multiple restaurants or branches. Creating a restaurant and joining one are separate flows."}
    >
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{language === "th" ? "ร้านของฉัน" : "My restaurants"}</h2>
                <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
                  {language === "th"
                    ? "รวมร้านที่เป็นเจ้าของ ผู้จัดการ หรือพนักงานจาก membership ของบัญชีนี้"
                    : "Lists every restaurant where this account is an owner, manager, or staff member."}
                </p>
              </div>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                {memberships.length} {language === "th" ? "ร้าน" : "restaurants"}
              </span>
            </div>
            <div className="space-y-3 p-4">
              {loading ? (
                <>
                  <RestaurantCardSkeleton />
                  <RestaurantCardSkeleton />
                  <RestaurantCardSkeleton />
                </>
              ) : hasRestaurants ? (
                memberships.map((membership) => (
                  <RestaurantCard
                    key={membership.ID}
                    membership={membership}
                    selected={membership.restaurant_id === effectiveSelectedId}
                    onSelect={() => setSelectedId(membership.restaurant_id)}
                  />
                ))
              ) : (
                <EmptyRestaurantsState />
              )}
            </div>
          </div>

          {hasRestaurants && (
            <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:-mx-6 lg:mx-0 lg:rounded-md lg:border">
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[12px] text-gray-500 dark:text-gray-400">{language === "th" ? "ร้านที่เลือก" : "Selected restaurant"}</p>
                  <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">
                    {selectedRestaurant?.restaurant?.name ?? (language === "th" ? "ยังไม่ได้เลือกร้าน" : "No restaurant selected")}
                  </p>
                  {selectedRestaurant && (
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                      {getWorkModeName(selectedRestaurant, language)} · {getWorkModeHint(selectedRestaurant, language)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!selectedRestaurant}
                  onClick={enterDashboard}
                  className="h-10 rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900"
                >
                  {selectedRestaurant ? getWorkModeName(selectedRestaurant, language) : language === "th" ? "เข้าโหมดทำงาน" : "Open workspace"}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                  {language === "th" ? "แพ็กเกจปัจจุบัน" : "Current plan"}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{PLAN.name}</h2>
              </div>
              <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                isPlanFull
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
              }`}>
                {usedRestaurants}/{PLAN.maxRestaurants} {language === "th" ? "ร้าน" : "restaurants"}
              </span>
            </div>
            <p className="mt-3 text-[12px] text-gray-500 dark:text-gray-400">
              {language === "th"
                ? "Free เปิดได้ 1 ร้าน และสมาชิก 3 คนต่อร้าน"
                : "Free supports 1 restaurant and 3 members per restaurant."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{language === "th" ? "เป็นเจ้าของ" : "Owned"}</p>
                <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white">{ownedCount} {language === "th" ? "ร้าน" : "restaurants"}</p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{language === "th" ? "เข้าร่วม" : "Joined"}</p>
                <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white">{joinedCount} {language === "th" ? "ร้าน" : "restaurants"}</p>
              </div>
            </div>
            {isPlanFull && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300">
                {language === "th"
                  ? "ถึง limit ร้านแล้ว สร้างร้านเพิ่มต้องอัปเกรดแพ็กเกจ"
                  : "You have reached the restaurant limit. Upgrade the plan to create more restaurants."}
              </p>
            )}
          </div>

          <QuickAction
            href="/restaurants/new"
            title={language === "th" ? "สร้างร้านใหม่" : "Create restaurant"}
            description={language === "th"
              ? "สำหรับเจ้าของร้านหรือผู้ดูแลที่ต้องการเปิดร้านหรือสาขาใหม่"
              : "For owners or admins who want to create a new restaurant or branch."}
            tone="orange"
          />
          <QuickAction
            href="/restaurants/join"
            title={language === "th" ? "เปิดลิงก์เชิญ" : "Open invite link"}
            description={language === "th"
              ? "สำหรับพนักงานที่ได้รับลิงก์หรือ token คำเชิญจากร้าน"
              : "For staff who received an invitation link or token from a restaurant."}
            tone="emerald"
          />
        </aside>
      </div>
    </WorkspaceShell>
  );
}
