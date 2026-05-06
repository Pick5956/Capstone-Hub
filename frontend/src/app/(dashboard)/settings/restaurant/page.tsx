"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { createSingleFlight } from "@/src/lib/singleFlight";
import { can } from "@/src/lib/rbac";
import { getRestaurant, updateRestaurant, uploadRestaurantLogo } from "@/src/lib/restaurant";
import type { Restaurant } from "@/src/types/restaurant";
import { RESTAURANT_TYPES, getRestaurantTypeLabel } from "@/src/app/restaurants/restaurantWorkspaceUi";
import { Field, SettingsPanel, SettingsShell, StatusMessage, TextAreaField } from "../_components/SettingsPrimitives";

type FormState = {
  name: string;
  branch_name: string;
  restaurant_type: string;
  phone: string;
  address: string;
  open_time: string;
  close_time: string;
  table_count: string;
  logo: string;
  service_charge_enabled: boolean;
  service_charge_rate: string;
  vat_enabled: boolean;
  vat_rate: string;
  promptpay_name: string;
  promptpay_qr_image: string;
};

type FormErrors = Partial<Record<"name" | "branch_name" | "phone" | "open_time" | "close_time" | "table_count" | "service_charge_rate" | "vat_rate" | "submit", string>>;

function normalizePhone(value: string) {
  return value.replace(/[^\d+\-\s]/g, "").slice(0, 24);
}

function validateTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toForm(restaurant?: Partial<Restaurant> | null, language: "th" | "en" = "th"): FormState {
  return {
    name: restaurant?.name ?? "",
    branch_name: restaurant?.branch_name?.trim() || (language === "th" ? "สาขาหลัก" : "Main branch"),
    restaurant_type: restaurant?.restaurant_type?.trim() || RESTAURANT_TYPES[0],
    phone: restaurant?.phone ?? "",
    address: restaurant?.address ?? "",
    open_time: restaurant?.open_time || "17:00",
    close_time: restaurant?.close_time || "00:00",
    table_count: restaurant?.table_count ? String(restaurant.table_count) : "12",
    logo: restaurant?.logo ?? "",
    service_charge_enabled: Boolean(restaurant?.service_charge_enabled),
    service_charge_rate: String(restaurant?.service_charge_rate ?? 10),
    vat_enabled: Boolean(restaurant?.vat_enabled),
    vat_rate: String(restaurant?.vat_rate ?? 7),
    promptpay_name: restaurant?.promptpay_name ?? "",
    promptpay_qr_image: restaurant?.promptpay_qr_image ?? "",
  };
}

export default function RestaurantSettingsPage() {
  const { activeMembership, refreshMemberships } = useAuth();
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveOnceRef = useRef(createSingleFlight());
  const uploadOnceRef = useRef(createSingleFlight());
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [form, setForm] = useState<FormState>(() => toForm(null, language));
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const canManageRestaurant = can(activeMembership, "manage_staff");
  const restaurantId = activeMembership?.restaurant_id;

  const copy = language === "th"
    ? {
        eyebrow: "Restaurant",
        title: "ข้อมูลร้านและการคิดเงิน",
        subtitle: "สำหรับผู้จัดการหรือเจ้าของร้าน ใช้ตั้งค่าข้อมูลที่มีผลกับบิลและการทำงานหน้าร้าน",
        back: "ตั้งค่า",
        denied: "เฉพาะผู้จัดการหรือเจ้าของร้านเท่านั้น",
        loading: "กำลังโหลดข้อมูลร้าน...",
        noRestaurant: "ยังไม่มีร้านที่เลือกอยู่",
        goRestaurants: "ไปหน้าเลือกร้าน",
        identity: "ข้อมูลร้าน",
        identityHint: "ข้อมูลนี้ใช้แสดงในระบบและใช้กับใบเสร็จ",
        operations: "เวลาและจำนวนโต๊ะ",
        operationsHint: "ตั้งค่าเริ่มต้นของร้าน ไม่ได้สร้างโต๊ะเพิ่มอัตโนมัติ",
        billing: "การคิดเงินและ PromptPay",
        billingHint: "ค่าจะถูก snapshot ลงออเดอร์ตอนยืนยันรับเงิน",
        logo: "โลโก้ร้าน",
        upload: "อัปโหลดโลโก้",
        uploading: "กำลังอัปโหลด...",
        noLogo: "ไม่มีโลโก้",
        name: "ชื่อร้าน",
        branch: "ชื่อสาขา",
        branchHelp: "ถ้ามีร้านเดียวใช้สาขาหลักได้",
        type: "ประเภทร้าน",
        phone: "เบอร์ร้าน",
        address: "ที่อยู่ร้าน",
        openTime: "เวลาเปิด",
        closeTime: "เวลาปิด",
        tableCount: "จำนวนโต๊ะตั้งต้น",
        service: "Service charge",
        serviceHelp: "เช่น 10%",
        vat: "VAT",
        vatHelp: "เช่น 7%",
        promptpayName: "ชื่อบัญชี PromptPay",
        promptpayQr: "ลิงก์รูป QR PromptPay",
        save: "บันทึกข้อมูลร้าน",
        saving: "กำลังบันทึก...",
        saved: "บันทึกข้อมูลร้านแล้ว",
        saveError: "บันทึกข้อมูลร้านไม่สำเร็จ",
        uploadError: "อัปโหลดโลโก้ไม่สำเร็จ",
        validateName: "กรุณากรอกชื่อร้าน",
        validateBranch: "กรุณากรอกชื่อสาขา",
        validatePhone: "เบอร์โทรควรมีอย่างน้อย 9 หลัก",
        validateOpen: "เวลาเปิดต้องอยู่ในรูปแบบ HH:mm",
        validateClose: "เวลาปิดต้องอยู่ในรูปแบบ HH:mm",
        validateTables: "จำนวนโต๊ะต้องอยู่ระหว่าง 1 ถึง 500",
      }
    : {
        eyebrow: "Restaurant",
        title: "Restaurant and billing",
        subtitle: "Manager-only settings that affect bills and live restaurant operations.",
        back: "Settings",
        denied: "Only managers or owners can manage restaurant settings.",
        loading: "Loading restaurant details...",
        noRestaurant: "No active restaurant selected",
        goRestaurants: "Go to restaurants",
        identity: "Restaurant profile",
        identityHint: "These details appear in the system and on receipts.",
        operations: "Hours and tables",
        operationsHint: "Default restaurant settings. This does not auto-create tables.",
        billing: "Billing and PromptPay",
        billingHint: "Values are snapshotted to orders when payment is confirmed.",
        logo: "Restaurant logo",
        upload: "Upload logo",
        uploading: "Uploading...",
        noLogo: "No logo",
        name: "Restaurant name",
        branch: "Branch name",
        branchHelp: "Use Main branch if this is your only location.",
        type: "Restaurant type",
        phone: "Restaurant phone",
        address: "Restaurant address",
        openTime: "Open time",
        closeTime: "Close time",
        tableCount: "Starting tables",
        service: "Service charge",
        serviceHelp: "Commonly 10%",
        vat: "VAT",
        vatHelp: "Commonly 7%",
        promptpayName: "PromptPay account name",
        promptpayQr: "PromptPay QR image URL",
        save: "Save restaurant",
        saving: "Saving...",
        saved: "Restaurant details saved.",
        saveError: "Could not save restaurant details.",
        uploadError: "Could not upload the logo.",
        validateName: "Please enter the restaurant name.",
        validateBranch: "Please enter the branch name.",
        validatePhone: "The phone number should have at least 9 digits.",
        validateOpen: "Open time must use HH:mm.",
        validateClose: "Close time must use HH:mm.",
        validateTables: "Table count must be between 1 and 500.",
      };

  useEffect(() => {
    if (!restaurantId || !canManageRestaurant) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    getRestaurant(restaurantId)
      .then((res) => {
        if (!active) return;
        setRestaurant(res.data);
        setForm(toForm(res.data, language));
        setErrors({});
      })
      .catch(() => {
        if (active) setErrors({ submit: copy.saveError });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canManageRestaurant, copy.saveError, language, restaurantId]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, submit: undefined }));
    setMessage("");
  };

  const setBool = (field: "service_charge_enabled" | "vat_enabled", value: boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  };

  const validate = () => {
    const next: FormErrors = {};
    const tableCount = Number.parseInt(form.table_count, 10);
    const serviceRate = Number.parseFloat(form.service_charge_rate);
    const vatRate = Number.parseFloat(form.vat_rate);
    if (!form.name.trim()) next.name = copy.validateName;
    if (!form.branch_name.trim()) next.branch_name = copy.validateBranch;
    if (form.phone.trim() && form.phone.replace(/\D/g, "").length < 9) next.phone = copy.validatePhone;
    if (!validateTime(form.open_time)) next.open_time = copy.validateOpen;
    if (!validateTime(form.close_time)) next.close_time = copy.validateClose;
    if (!Number.isFinite(tableCount) || tableCount < 1 || tableCount > 500) next.table_count = copy.validateTables;
    if (!Number.isFinite(serviceRate) || serviceRate < 0 || serviceRate > 30) next.service_charge_rate = language === "th" ? "ค่าบริการต้องอยู่ระหว่าง 0 ถึง 30%" : "Service charge must be between 0 and 30%.";
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 20) next.vat_rate = language === "th" ? "VAT ต้องอยู่ระหว่าง 0 ถึง 20%" : "VAT must be between 0 and 20%.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
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
          service_charge_enabled: form.service_charge_enabled,
          service_charge_rate: Number.parseFloat(form.service_charge_rate),
          vat_enabled: form.vat_enabled,
          vat_rate: Number.parseFloat(form.vat_rate),
          promptpay_name: form.promptpay_name.trim(),
          promptpay_qr_image: form.promptpay_qr_image.trim(),
        });
        setRestaurant(res.data.restaurant);
        setForm(toForm(res.data.restaurant, language));
        setMessage(copy.saved);
        await refreshMemberships();
      } catch {
        setErrors({ submit: copy.saveError });
      } finally {
        setSaving(false);
      }
    });
  };

  const uploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !restaurantId) return;
    await uploadOnceRef.current(async () => {
      setUploading(true);
      try {
        const res = await uploadRestaurantLogo(restaurantId, file);
        setForm((current) => ({ ...current, logo: res.data.restaurant.logo ?? "" }));
        setRestaurant((current) => (current ? { ...current, logo: res.data.restaurant.logo } : current));
        setMessage(copy.saved);
        await refreshMemberships();
      } catch {
        setErrors({ submit: copy.uploadError });
      } finally {
        setUploading(false);
      }
    });
  };

  if (!canManageRestaurant) {
    return <PermissionDenied title={copy.denied} />;
  }

  if (!restaurantId) {
    return (
      <SettingsShell eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.noRestaurant} backLabel={copy.back}>
        <Link href="/restaurants" className="ui-press inline-flex h-10 items-center rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white dark:bg-white dark:text-gray-900">{copy.goRestaurants}</Link>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      backLabel={copy.back}
      action={<button type="submit" form="restaurant-settings-form" disabled={saving || loading} className="ui-press hidden h-10 rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-gray-900 sm:inline-flex">{saving ? copy.saving : copy.save}</button>}
    >
      <form id="restaurant-settings-form" onSubmit={save} className="space-y-4 pb-20 sm:pb-0">
        {loading ? (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-10 text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">{copy.loading}</div>
        ) : (
          <>
            <SettingsPanel title={copy.identity} hint={copy.identityHint}>
              <div className="mb-4 flex flex-col gap-4 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-orange-50 text-center text-[11px] font-semibold text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
                    {form.logo ? <Image src={form.logo} alt={form.name || copy.logo} width={64} height={64} unoptimized className="h-full w-full object-cover" /> : copy.noLogo}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{copy.logo}</p>
                    <p className="mt-0.5 truncate text-[12px] text-gray-500 dark:text-gray-400">{restaurant?.name || form.name}</p>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="ui-press h-10 rounded-md border border-gray-200 px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
                  {uploading ? copy.uploading : copy.upload}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={copy.name} value={form.name} onChange={(value) => setField("name", value)} error={errors.name} />
                <Field label={copy.branch} value={form.branch_name} onChange={(value) => setField("branch_name", value)} error={errors.branch_name} help={copy.branchHelp} />
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.type}</span>
                  <ThemedSelect value={form.restaurant_type} onChange={(value) => setField("restaurant_type", value)} options={RESTAURANT_TYPES.map((item) => ({ value: item, label: getRestaurantTypeLabel(item, language) }))} />
                </label>
                <Field label={copy.phone} value={form.phone} onChange={(value) => setField("phone", normalizePhone(value))} error={errors.phone} inputMode="tel" />
                <div className="sm:col-span-2">
                  <TextAreaField label={copy.address} value={form.address} onChange={(value) => setField("address", value)} />
                </div>
              </div>
            </SettingsPanel>

            <SettingsPanel title={copy.operations} hint={copy.operationsHint}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={copy.openTime} type="time" value={form.open_time} onChange={(value) => setField("open_time", value)} error={errors.open_time} />
                <Field label={copy.closeTime} type="time" value={form.close_time} onChange={(value) => setField("close_time", value)} error={errors.close_time} />
                <Field label={copy.tableCount} value={form.table_count} onChange={(value) => setField("table_count", value)} error={errors.table_count} inputMode="numeric" />
              </div>
            </SettingsPanel>

            <SettingsPanel title={copy.billing} hint={copy.billingHint}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
                  <span>
                    <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.service}</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{copy.serviceHelp}</span>
                  </span>
                  <input type="checkbox" checked={form.service_charge_enabled} onChange={(event) => setBool("service_charge_enabled", event.target.checked)} className="h-4 w-4 accent-orange-600" />
                </label>
                <Field label={`${copy.service} %`} value={form.service_charge_rate} onChange={(value) => setField("service_charge_rate", value)} error={errors.service_charge_rate} inputMode="decimal" />
                <label className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
                  <span>
                    <span className="block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.vat}</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{copy.vatHelp}</span>
                  </span>
                  <input type="checkbox" checked={form.vat_enabled} onChange={(event) => setBool("vat_enabled", event.target.checked)} className="h-4 w-4 accent-orange-600" />
                </label>
                <Field label={`${copy.vat} %`} value={form.vat_rate} onChange={(value) => setField("vat_rate", value)} error={errors.vat_rate} inputMode="decimal" />
                <Field label={copy.promptpayName} value={form.promptpay_name} onChange={(value) => setField("promptpay_name", value)} />
                <Field label={copy.promptpayQr} value={form.promptpay_qr_image} onChange={(value) => setField("promptpay_qr_image", value)} placeholder="/uploads/..." />
              </div>
            </SettingsPanel>

            <StatusMessage error={errors.submit} message={message} />
          </>
        )}

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:hidden">
          <button type="submit" disabled={saving || loading} className="ui-press h-12 w-full rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
            {saving ? copy.saving : copy.save}
          </button>
        </div>
      </form>
    </SettingsShell>
  );
}
