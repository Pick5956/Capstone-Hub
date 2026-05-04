"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import ThemedTimeInput from "@/src/components/shared/ThemedTimeInput";
import { createSingleFlight } from "@/src/lib/singleFlight";
import { getRestaurant, updateRestaurant, uploadRestaurantLogo } from "@/src/lib/restaurant";
import type { Restaurant } from "@/src/types/restaurant";
import { RESTAURANT_TYPES, getRestaurantTypeLabel } from "@/src/app/restaurants/restaurantWorkspaceUi";

type SettingsTab = "account" | "restaurant" | "team" | "plan" | "notifications" | "security";

type RestaurantFormState = {
  name: string;
  branch_name: string;
  restaurant_type: string;
  phone: string;
  address: string;
  open_time: string;
  close_time: string;
  table_count: string;
  logo: string;
};

type RestaurantFormErrors = Partial<Record<"name" | "branch_name" | "phone" | "open_time" | "close_time" | "table_count" | "submit", string>>;

function normalizePhone(value: string) {
  return value.replace(/[^\d+\-\s]/g, "").slice(0, 24);
}

function validateTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toRestaurantFormState(restaurant: Restaurant, language: Language): RestaurantFormState {
  return {
    name: restaurant.name ?? "",
    branch_name: restaurant.branch_name?.trim() || (language === "th" ? "สาขาหลัก" : "Main branch"),
    restaurant_type: restaurant.restaurant_type?.trim() || RESTAURANT_TYPES[0],
    phone: restaurant.phone ?? "",
    address: restaurant.address ?? "",
    open_time: restaurant.open_time || "17:00",
    close_time: restaurant.close_time || "00:00",
    table_count: restaurant.table_count ? String(restaurant.table_count) : "12",
    logo: restaurant.logo ?? "",
  };
}

function getDisplayName(user: ReturnType<typeof useAuth>["user"], language: Language) {
  if (!user) return language === "th" ? "ผู้ใช้งาน" : "User";
  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part) => part && part !== "-");
  return parts.length ? parts.join(" ") : user.email;
}

function Panel({
  title,
  hint,
  children,
  right,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h2>
          {hint ? <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{hint}</p> : null}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  help,
  type = "text",
  disabled,
  inputMode,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  help?: string;
  type?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {type === "time" ? (
        <ThemedTimeInput value={value} onChange={(nextValue) => onChange?.(nextValue)} disabled={disabled} error={error} help={help} />
      ) : (
        <>
          <input
            type={type}
            value={value}
            placeholder={placeholder}
            inputMode={inputMode}
            disabled={disabled}
            readOnly={!onChange}
            onChange={(event) => onChange?.(event.target.value)}
            className={`h-9 w-full rounded-md border bg-white px-3 text-[13px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-white ${
              error
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/15 dark:border-red-900/60"
                : "border-gray-200 focus:border-orange-500 focus:ring-orange-500/15 dark:border-gray-700"
            }`}
          />
          {(error || help) && (
            <p className={`mt-1 text-[11px] ${error ? "text-red-600 dark:text-red-300" : "text-gray-500 dark:text-gray-400"}`}>
              {error || help}
            </p>
          )}
        </>
      )}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  error,
  help,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  help?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <textarea
        value={value}
        rows={3}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={!onChange}
        onChange={(event) => onChange?.(event.target.value)}
        className={`w-full rounded-md border bg-white px-3 py-2 text-[13px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-white ${
          error
            ? "border-red-300 focus:border-red-500 focus:ring-red-500/15 dark:border-red-900/60"
            : "border-gray-200 focus:border-orange-500 focus:ring-orange-500/15 dark:border-gray-700"
        }`}
      />
      {(error || help) && (
        <p className={`mt-1 text-[11px] ${error ? "text-red-600 dark:text-red-300" : "text-gray-500 dark:text-gray-400"}`}>
          {error || help}
        </p>
      )}
    </label>
  );
}

function AccountSettings() {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { fontSize, setFontSize } = useTheme();
  const displayName = getDisplayName(user, language);
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const copy = language === "th"
    ? {
        accountTitle: "ข้อมูลบัญชี",
        accountHint: "ข้อมูลนี้ใช้แสดงกับทีมและกิจกรรมในระบบ",
        firstName: "ชื่อ",
        lastName: "นามสกุล",
        email: "อีเมล",
        phone: "เบอร์โทร",
        emptyEmail: "ยังไม่มีอีเมล",
        prefsTitle: "ค่ากำหนดส่วนตัว",
        prefsHint: "มีผลกับบัญชีนี้เท่านั้น",
        language: "ภาษา",
        timeZone: "โซนเวลา",
        firstPage: "หน้าแรกหลังเลือกร้าน",
        timeFormat: "รูปแบบเวลา",
        home: "ภาพรวมร้าน",
        orders: "ออเดอร์",
        reports: "รายงาน",
        kitchenQueue: "คิวครัว",
        fontTitle: "ขนาดตัวอักษร",
        fontHint: "ปรับให้เหมาะกับการอ่านบนอุปกรณ์ของคุณ",
      }
    : {
        accountTitle: "Account details",
        accountHint: "This information appears in team and activity contexts.",
        firstName: "First name",
        lastName: "Last name",
        email: "Email",
        phone: "Phone",
        emptyEmail: "No email",
        prefsTitle: "Personal preferences",
        prefsHint: "These settings only affect your account.",
        language: "Language",
        timeZone: "Time zone",
        firstPage: "First page after selecting a restaurant",
        timeFormat: "Time format",
        home: "Restaurant overview",
        orders: "Orders",
        reports: "Reports",
        kitchenQueue: "Kitchen queue",
        fontTitle: "Font size",
        fontHint: "Adjust the reading size for your device.",
      };

  const fontOptions = [
    { id: "small" as const, label: language === "th" ? "เล็ก" : "Small" },
    { id: "normal" as const, label: language === "th" ? "ปกติ" : "Normal" },
    { id: "large" as const, label: language === "th" ? "ใหญ่" : "Large" },
    { id: "extra-large" as const, label: language === "th" ? "ใหญ่มาก" : "Extra large" },
  ];

  return (
    <div className="space-y-4">
      <Panel title={copy.accountTitle} hint={copy.accountHint}>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-orange-700 dark:bg-orange-900/25 dark:text-orange-300">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-gray-900 dark:text-white">{displayName}</p>
            <p className="mt-0.5 truncate text-[12px] text-gray-500 dark:text-gray-400">{user?.email ?? copy.emptyEmail}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={copy.firstName} value={user?.first_name ?? ""} />
          <Field label={copy.lastName} value={user?.last_name === "-" ? "" : user?.last_name ?? ""} />
          <Field label={copy.email} value={user?.email ?? ""} />
          <Field label={copy.phone} value={user?.phone ?? ""} />
        </div>
      </Panel>

      <Panel title={copy.prefsTitle} hint={copy.prefsHint}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.language}</span>
            <ThemedSelect
              value={language}
              onChange={(nextValue) => setLanguage(nextValue as Language)}
              options={[
                { value: "th", label: "ไทย" },
                { value: "en", label: "English" },
              ]}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.timeZone}</span>
            <ThemedSelect value="Asia/Bangkok" onChange={() => {}} options={[{ value: "Asia/Bangkok", label: "Asia/Bangkok" }]} disabled />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.firstPage}</span>
            <ThemedSelect
              value="home"
              onChange={() => {}}
              disabled
              options={[
                { value: "home", label: copy.home },
                { value: "orders", label: copy.orders },
                { value: "kitchen", label: copy.kitchenQueue },
                { value: "reports", label: copy.reports },
              ]}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.timeFormat}</span>
            <ThemedSelect
              value="24"
              onChange={() => {}}
              disabled
              options={[
                { value: "24", label: "24:00" },
                { value: "12", label: "12:00 AM/PM" },
              ]}
            />
          </label>
        </div>
      </Panel>

      <Panel title={copy.fontTitle} hint={copy.fontHint}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {fontOptions.map((option) => {
            const active = fontSize === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFontSize(option.id)}
                className={`h-10 rounded-md border text-[12px] font-medium transition-colors ${
                  active
                    ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function RestaurantSettings() {
  const { activeMembership, refreshMemberships } = useAuth();
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveOnceRef = useRef(createSingleFlight());
  const uploadOnceRef = useRef(createSingleFlight());
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [form, setForm] = useState<RestaurantFormState>(() => toRestaurantFormState({} as Restaurant, language));
  const [errors, setErrors] = useState<RestaurantFormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  const copy = language === "th"
    ? {
        title: "ข้อมูลร้าน",
        hint: "บันทึกชื่อร้าน สาขา ประเภทร้าน เวลาเปิดปิด และข้อมูลติดต่อที่ใช้จริง",
        loading: "กำลังโหลดข้อมูลร้าน...",
        noRestaurantTitle: "ยังไม่มีร้านที่เลือกอยู่",
        noRestaurantBody: "กลับไปหน้าเลือกร้านก่อน แล้วค่อยเข้ามาตั้งค่าร้านอีกครั้ง",
        noRestaurantLink: "ไปหน้าเลือกร้าน",
        logoTitle: "โลโก้ร้าน",
        uploadLogo: "อัปโหลดโลโก้",
        uploadBusy: "กำลังอัปโหลด...",
        removeLogo: "ไม่มีโลโก้",
        name: "ชื่อร้าน",
        branch: "ชื่อสาขา",
        branchHelp: "ถ้ามีร้านเดียวใช้สาขาหลักได้",
        type: "ประเภทร้าน",
        phone: "เบอร์ร้าน",
        address: "ที่อยู่ร้าน",
        openTime: "เวลาเปิด",
        closeTime: "เวลาปิด",
        tableCount: "จำนวนโต๊ะตั้งต้น",
        saveSuccess: "บันทึกข้อมูลร้านแล้ว",
        saveError: "บันทึกข้อมูลร้านไม่สำเร็จ",
        uploadError: "อัปโหลดโลโก้ไม่สำเร็จ",
        validateName: "กรุณากรอกชื่อร้าน",
        validateBranch: "กรุณากรอกชื่อสาขา",
        validatePhone: "เบอร์โทรควรมีอย่างน้อย 9 หลัก",
        validateOpen: "เวลาเปิดต้องอยู่ในรูปแบบ HH:mm",
        validateClose: "เวลาปิดต้องอยู่ในรูปแบบ HH:mm",
        validateTables: "จำนวนโต๊ะต้องอยู่ระหว่าง 1 ถึง 500",
        namePlaceholder: "เช่น ครัวบ้านส้ม",
        branchPlaceholder: "สาขาหลัก",
        phonePlaceholder: "044-000-000",
        addressPlaceholder: "ที่อยู่สำหรับใบเสร็จและข้อมูลร้าน",
      }
    : {
        title: "Restaurant profile",
        hint: "Save the live restaurant name, branch, type, hours, and contact details.",
        loading: "Loading restaurant details...",
        noRestaurantTitle: "No active restaurant selected",
        noRestaurantBody: "Go back to the restaurant selector first, then return here to manage the profile.",
        noRestaurantLink: "Go to restaurant selector",
        logoTitle: "Restaurant logo",
        uploadLogo: "Upload logo",
        uploadBusy: "Uploading...",
        removeLogo: "No logo yet",
        name: "Restaurant name",
        branch: "Branch name",
        branchHelp: "Use Main branch if this is your only location.",
        type: "Restaurant type",
        phone: "Restaurant phone",
        address: "Restaurant address",
        openTime: "Open time",
        closeTime: "Close time",
        tableCount: "Starting tables",
        saveSuccess: "Restaurant details saved.",
        saveError: "Could not save restaurant details.",
        uploadError: "Could not upload the logo.",
        validateName: "Please enter the restaurant name.",
        validateBranch: "Please enter the branch name.",
        validatePhone: "The phone number should have at least 9 digits.",
        validateOpen: "Open time must use the HH:mm format.",
        validateClose: "Close time must use the HH:mm format.",
        validateTables: "The table count must be between 1 and 500.",
        namePlaceholder: "For example, Baan Som Kitchen",
        branchPlaceholder: "Main branch",
        phonePlaceholder: "044-000-000",
        addressPlaceholder: "Address for receipts and restaurant information",
      };

  const restaurantId = activeMembership?.restaurant_id;

  useEffect(() => {
    if (!restaurantId) {
      setRestaurant(null);
      setForm(toRestaurantFormState({} as Restaurant, language));
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    getRestaurant(restaurantId)
      .then((res) => {
        if (!active) return;
        setRestaurant(res.data);
        setForm(toRestaurantFormState(res.data, language));
      })
      .catch(() => {
        if (!active) return;
        setErrors({ submit: copy.saveError });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [copy.saveError, language, restaurantId]);

  const setField = (field: keyof RestaurantFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSavedMessage("");
  };

  const validate = () => {
    const next: RestaurantFormErrors = {};
    const tableCount = Number.parseInt(form.table_count, 10);
    if (!form.name.trim()) next.name = copy.validateName;
    if (!form.branch_name.trim()) next.branch_name = copy.validateBranch;
    if (form.phone.trim() && form.phone.replace(/\D/g, "").length < 9) next.phone = copy.validatePhone;
    if (!validateTime(form.open_time)) next.open_time = copy.validateOpen;
    if (!validateTime(form.close_time)) next.close_time = copy.validateClose;
    if (!Number.isFinite(tableCount) || tableCount < 1 || tableCount > 500) next.table_count = copy.validateTables;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavedMessage("");
    setErrors({});
    if (!restaurantId || !validate()) return;

    await saveOnceRef.current(async () => {
      setSaving(true);
      try {
        const res = await updateRestaurant(restaurantId, {
          name: form.name.trim(),
          branch_name: form.branch_name.trim(),
          restaurant_type: form.restaurant_type,
          phone: form.phone.trim(),
          address: form.address.trim(),
          open_time: form.open_time,
          close_time: form.close_time,
          table_count: Number.parseInt(form.table_count, 10),
        });
        setRestaurant(res.data.restaurant);
        setForm(toRestaurantFormState(res.data.restaurant, language));
        setSavedMessage(copy.saveSuccess);
        await refreshMemberships();
      } catch {
        setErrors({ submit: copy.saveError });
      } finally {
        setSaving(false);
      }
    });
  };

  const handleUploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !restaurantId) return;

    await uploadOnceRef.current(async () => {
      setUploading(true);
      setSavedMessage("");
      try {
        const res = await uploadRestaurantLogo(restaurantId, file);
        setForm((current) => ({ ...current, logo: res.data.restaurant.logo ?? "" }));
        setRestaurant((current) => (current ? { ...current, logo: res.data.restaurant.logo } : current));
        setSavedMessage(copy.saveSuccess);
        await refreshMemberships();
      } catch {
        setErrors({ submit: copy.uploadError });
      } finally {
        setUploading(false);
      }
    });
  };

  if (!restaurantId) {
    return (
      <Panel title={copy.noRestaurantTitle} hint={copy.noRestaurantBody}>
        <Link href="/restaurants" className="inline-flex h-9 items-center rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900">
          {copy.noRestaurantLink}
        </Link>
      </Panel>
    );
  }

  return (
    <Panel title={copy.title} hint={copy.hint}>
      {loading ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-6 text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
          {copy.loading}
        </div>
      ) : (
        <form id="restaurant-settings-form" onSubmit={handleSave} className="space-y-4">
          <div className="flex flex-col gap-4 rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/60 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
                {form.logo ? (
                  <Image src={form.logo} alt={form.name || copy.title} width={64} height={64} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[11px] font-semibold">{copy.removeLogo}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{copy.logoTitle}</p>
                <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
                  {restaurant?.name || form.name || copy.title}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {uploading ? copy.uploadBusy : copy.uploadLogo}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={copy.name}
              value={form.name}
              onChange={(value) => setField("name", value)}
              placeholder={copy.namePlaceholder}
              error={errors.name}
            />
            <Field
              label={copy.branch}
              value={form.branch_name}
              onChange={(value) => setField("branch_name", value)}
              placeholder={copy.branchPlaceholder}
              error={errors.branch_name}
              help={copy.branchHelp}
            />
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.type}</span>
              <ThemedSelect
                value={form.restaurant_type}
                onChange={(value) => setField("restaurant_type", value)}
                options={RESTAURANT_TYPES.map((item) => ({
                  value: item,
                  label: getRestaurantTypeLabel(item, language),
                }))}
              />
            </label>
            <Field
              label={copy.phone}
              value={form.phone}
              onChange={(value) => setField("phone", normalizePhone(value))}
              placeholder={copy.phonePlaceholder}
              error={errors.phone}
              inputMode="tel"
            />
            <Field
              label={copy.tableCount}
              value={form.table_count}
              onChange={(value) => setField("table_count", value)}
              error={errors.table_count}
              inputMode="numeric"
            />
            <Field label={copy.openTime} type="time" value={form.open_time} onChange={(value) => setField("open_time", value)} error={errors.open_time} />
            <Field label={copy.closeTime} type="time" value={form.close_time} onChange={(value) => setField("close_time", value)} error={errors.close_time} />
            <div className="sm:col-span-2">
              <TextAreaField
                label={copy.address}
                value={form.address}
                onChange={(value) => setField("address", value)}
                placeholder={copy.addressPlaceholder}
              />
            </div>
          </div>

          {(errors.submit || savedMessage) && (
            <div
              className={`rounded-md border px-3 py-2 text-[12px] ${
                errors.submit
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
              }`}
            >
              {errors.submit || savedMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="hidden"
          />
        </form>
      )}
    </Panel>
  );
}

function TeamSettings() {
  const { language } = useLanguage();
  const copy = language === "th"
    ? {
        title: "ทีมและสิทธิ์",
        hint: "การเชิญสมาชิกและจัดการบทบาทอยู่ที่หน้าพนักงาน",
        body: "ไปที่หน้าพนักงานเพื่อสร้าง invitation token, เปลี่ยนบทบาท, ระงับสมาชิก, และดู audit log ของร้าน",
        button: "เปิดหน้าพนักงาน",
      }
    : {
        title: "Team and permissions",
        hint: "Invitations and role management live on the staff page.",
        body: "Open the staff page to create invitation tokens, change roles, suspend members, and review the restaurant audit log.",
        button: "Open staff page",
      };

  return (
    <Panel
      title={copy.title}
      hint={copy.hint}
      right={
        <Link href="/staff" className="inline-flex h-8 items-center rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900">
          {copy.button}
        </Link>
      }
    >
      <p className="text-[12px] text-gray-500 dark:text-gray-400">{copy.body}</p>
    </Panel>
  );
}

function PlanSettings() {
  const { language } = useLanguage();
  const copy = language === "th"
    ? {
        title: "แพ็กเกจปัจจุบัน",
        hint: "ส่วนนี้ยังเป็น mock UI ก่อนเชื่อมระบบ subscription จริง",
        active: "ใช้งานอยู่",
        body: "แพ็กเกจ Free เหมาะกับการเริ่มตั้งค่าร้านแรก ทดลองออเดอร์ โต๊ะ และการจัดการทีม",
        limits: [
          ["ร้าน", "1"],
          ["สมาชิก", "3"],
          ["โต๊ะ", "20"],
          ["รายงานย้อนหลัง", "7 วัน"],
        ],
      }
    : {
        title: "Current plan",
        hint: "This section is still a mock until the real subscription system is connected.",
        active: "Active",
        body: "The Free plan is suitable for setting up the first restaurant and trying orders, tables, and team management.",
        limits: [
          ["Restaurants", "1"],
          ["Members", "3"],
          ["Tables", "20"],
          ["Report history", "7 days"],
        ],
      };

  return (
    <Panel title={copy.title} hint={copy.hint}>
      <div className="flex items-center gap-2">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Free</h3>
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          {copy.active}
        </span>
      </div>
      <p className="mt-2 text-[13px] text-gray-600 dark:text-gray-400">{copy.body}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {copy.limits.map(([label, value]) => (
          <div key={label} className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/60">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function NotificationSettings() {
  const { language } = useLanguage();
  const copy = language === "th"
    ? {
        title: "แจ้งเตือนงานหน้าร้าน",
        hint: "เลือกเหตุการณ์ที่ควรแสดงเป็นลำดับแรกให้ผู้จัดการเห็น",
        items: ["ออเดอร์เกินเวลา", "วัตถุดิบใกล้หมด", "โต๊ะรอชำระเงินนาน", "สรุปยอดปิดกะ"],
      }
    : {
        title: "Restaurant notifications",
        hint: "Choose the events that should surface first for managers.",
        items: ["Overdue orders", "Low inventory", "Tables waiting too long to pay", "End-of-shift summary"],
      };

  return (
    <Panel title={copy.title} hint={copy.hint}>
      <div className="grid grid-cols-1 gap-2">
        {copy.items.map((item) => (
          <div key={item} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-300">
            {item}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SecuritySettings() {
  const { language } = useLanguage();
  const copy = language === "th"
    ? {
        title: "ความปลอดภัย",
        hint: "จัดการวิธีเข้าสู่ระบบของบัญชีนี้",
        actions: ["เปลี่ยนรหัสผ่าน", "เชื่อมต่อ Google", "ยืนยันตัวตนสองชั้น", "แจ้งเตือน login ใหม่"],
      }
    : {
        title: "Security",
        hint: "Manage how this account signs in.",
        actions: ["Change password", "Connect Google", "Two-factor authentication", "New login alerts"],
      };

  return (
    <Panel title={copy.title} hint={copy.hint}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {copy.actions.map((item) => (
          <div key={item} className="rounded-md border border-gray-200 px-3 py-3 text-[12px] font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">
            {item}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function SettingsPage() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");

  const copy = language === "th"
    ? {
        pageTitle: "ตั้งค่า",
        pageSubtitle: "บัญชี ร้าน ทีม แพ็กเกจ และความปลอดภัย",
        saveRestaurant: "บันทึกข้อมูลร้าน",
        selectRestaurantTab: "เลือกแท็บร้านเพื่อบันทึก",
        mobileLabel: "หมวดที่เลือก",
      }
    : {
        pageTitle: "Settings",
        pageSubtitle: "Account, restaurant, team, plan, and security",
        saveRestaurant: "Save restaurant details",
        selectRestaurantTab: "Select the restaurant tab to save",
        mobileLabel: "Selected section",
      };

  const tabs = useMemo(
    () => [
      { id: "account" as const, label: language === "th" ? "บัญชี" : "Account" },
      { id: "restaurant" as const, label: language === "th" ? "ร้าน" : "Restaurant" },
      { id: "team" as const, label: language === "th" ? "ทีม" : "Team" },
      { id: "plan" as const, label: language === "th" ? "แพ็กเกจ" : "Plan" },
      { id: "notifications" as const, label: language === "th" ? "แจ้งเตือน" : "Notifications" },
      { id: "security" as const, label: language === "th" ? "ความปลอดภัย" : "Security" },
    ],
    [language]
  );

  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "";
  const restaurantTabActive = activeTab === "restaurant";

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="flex h-14 items-center justify-between gap-3 px-5 md:px-7">
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-semibold tracking-tight">{copy.pageTitle}</h1>
            <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{copy.pageSubtitle}</p>
          </div>
          <button
            type={restaurantTabActive ? "submit" : "button"}
            form={restaurantTabActive ? "restaurant-settings-form" : undefined}
            disabled={!restaurantTabActive}
            className={`h-8 rounded-md px-3 text-[12px] font-semibold transition-opacity ${
              restaurantTabActive
                ? "bg-gray-900 text-white hover:opacity-90 dark:bg-white dark:text-gray-900"
                : "bg-gray-100 text-gray-400 dark:bg-gray-900 dark:text-gray-500"
            }`}
          >
            {restaurantTabActive ? copy.saveRestaurant : copy.selectRestaurantTab}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-screen-2xl px-5 py-5 md:px-7">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900 lg:sticky lg:top-[76px] lg:self-start">
            <div className="mb-2 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 lg:hidden">
              {copy.mobileLabel}: {activeLabel}
            </div>
            <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {tabs.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0">
            {activeTab === "account" ? <AccountSettings /> : null}
            {activeTab === "restaurant" ? <RestaurantSettings /> : null}
            {activeTab === "team" ? <TeamSettings /> : null}
            {activeTab === "plan" ? <PlanSettings /> : null}
            {activeTab === "notifications" ? <NotificationSettings /> : null}
            {activeTab === "security" ? <SecuritySettings /> : null}
          </main>
        </div>
      </div>
    </div>
  );
}
