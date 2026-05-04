"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { createRestaurant } from "@/src/lib/restaurant";
import { createSingleFlight } from "@/src/lib/singleFlight";
import { useLanguage } from "@/src/providers/LanguageProvider";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import ThemedTimeInput from "@/src/components/shared/ThemedTimeInput";
import { restaurantRepository } from "../../repositories/restaurantRepository";
import {
  BackToRestaurants,
  PLAN,
  RESTAURANT_TYPES,
  WorkspaceShell,
  getRestaurantTypeLabel,
} from "../restaurantWorkspaceUi";

type FormErrors = Partial<
  Record<"name" | "branch" | "phone" | "address" | "openTime" | "closeTime" | "initialTables" | "submit", string>
>;

function Field({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  help,
  error,
  inputMode,
  min,
  max,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {type === "time" ? (
        <ThemedTimeInput value={value} onChange={onChange} error={error} help={help} />
      ) : (
        <>
          <input
            type={type}
            value={value}
            inputMode={inputMode}
            min={min}
            max={max}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            className={`h-10 w-full rounded-md border bg-white px-3 text-[13px] outline-none transition-colors dark:bg-gray-900 ${
              error
                ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15 dark:border-red-900/60 dark:text-red-200"
                : "border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700"
            }`}
          />
          {(error || help) && (
            <p className={`mt-1 text-[11px] ${error ? "text-red-600 dark:text-red-300" : "text-gray-400 dark:text-gray-500"}`}>
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
  placeholder,
  value,
  onChange,
  help,
  error,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-invalid={Boolean(error)}
        className={`w-full resize-none rounded-md border bg-white px-3 py-2 text-[13px] outline-none transition-colors dark:bg-gray-900 ${
          error
            ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15 dark:border-red-900/60 dark:text-red-200"
            : "border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700"
        }`}
      />
      {(error || help) && (
        <p className={`mt-1 text-[11px] ${error ? "text-red-600 dark:text-red-300" : "text-gray-400 dark:text-gray-500"}`}>
          {error || help}
        </p>
      )}
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-gray-200 px-4 py-4 first:border-t-0 dark:border-gray-800">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SetupStep({
  done,
  title,
  description,
}: {
  done: boolean;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950">
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          done
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
            : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400"
        }`}
      >
        {done ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          "•"
        )}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 py-2 first:border-t-0 dark:border-gray-800">
      <span className="text-[11px] text-gray-400 dark:text-gray-500">{label}</span>
      <span className="min-w-0 truncate text-right text-[12px] font-medium text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+\-\s]/g, "").slice(0, 24);
}

function validateTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export default function NewRestaurantPage() {
  const router = useRouter();
  const { memberships, setActiveRestaurant, refreshMemberships } = useAuth();
  const { language } = useLanguage();
  const [type, setType] = useState(RESTAURANT_TYPES[0]);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState(language === "th" ? "สาขาหลัก" : "Main branch");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openTime, setOpenTime] = useState("17:00");
  const [closeTime, setCloseTime] = useState("00:00");
  const [initialTables, setInitialTables] = useState("12");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const submitOnceRef = useRef(createSingleFlight());

  const copy = language === "th"
    ? {
        pageTitle: "สร้างร้านใหม่",
        pageDescription: "ตั้งค่าข้อมูลหลักให้พร้อมก่อนเข้าหน้าภาพรวม ร้านจะถูกผูกกับบัญชีนี้ในบทบาทเจ้าของร้าน",
        viewPlan: "ดูแพ็กเกจ",
        starterTitle: "ข้อมูลเริ่มต้นของร้าน",
        starterDescription: "ข้อมูลชุดนี้จะใช้ในใบเสร็จ หน้าภาพรวม และการตั้งค่าร้าน",
        completion: "ความครบถ้วน",
        freePlanTitle: "แพ็กเกจ Free เปิดร้านได้ 1 ร้าน",
        freePlanDescription: "อัปเกรดเป็น Pro เพื่อสร้างร้านหรือสาขาเพิ่ม",
        restaurantSectionTitle: "ข้อมูลร้าน",
        restaurantSectionDescription: "ชื่อร้านและประเภทร้านจะช่วยให้ทีมแยกร้านหรือสาขาได้ถูกต้อง",
        nameLabel: "ชื่อร้าน",
        namePlaceholder: "เช่น ครัวบ้านส้ม",
        branchLabel: "ชื่อสาขา",
        branchPlaceholder: "สาขาหลัก",
        branchHelp: "ถ้ามีร้านเดียวให้ใช้สาขาหลัก",
        typeLabel: "ประเภทร้าน",
        contactSectionTitle: "ข้อมูลติดต่อ",
        contactSectionDescription: "ใช้แสดงบนเอกสารและช่วยให้ทีมตรวจสอบสาขาถูก",
        phoneLabel: "เบอร์ร้าน",
        phonePlaceholder: "044-000-000",
        phoneHelp: "ใส่ได้ทั้งเบอร์มือถือหรือเบอร์หน้าร้าน",
        addressLabel: "ที่อยู่ร้าน",
        addressPlaceholder: "ที่อยู่สำหรับใบเสร็จและข้อมูลร้าน",
        scheduleSectionTitle: "เวลาเปิดปิดและโต๊ะ",
        scheduleSectionDescription: "ใช้เป็นค่าเริ่มต้นสำหรับหน้าภาพรวม ผังโต๊ะ และรอบการทำงาน",
        openLabel: "เวลาเปิด",
        closeLabel: "เวลาปิด",
        tablesLabel: "จำนวนโต๊ะเริ่มต้น",
        submitIdle: "สร้างร้านและเข้า dashboard",
        submitBusy: "กำลังสร้างร้าน...",
        previewTitle: "ตัวอย่างข้อมูลร้าน",
        previewDescription: "สรุปแบบเดียวกับที่จะเห็นในหน้าเลือกร้าน",
        previewStoreName: "ชื่อร้าน",
        previewBranch: "สาขา",
        previewPhone: "เบอร์",
        previewHours: "เวลาเปิด",
        previewTables: "โต๊ะ",
        previewAddress: "ที่อยู่",
        unknown: "ยังไม่ระบุ",
        invalid: "ยังไม่ถูกต้อง",
        identityStep: "ระบุตัวตนร้าน",
        identityStepDesc: "ชื่อร้านและสาขาพร้อมใช้งาน",
        contactStep: "ข้อมูลติดต่อ",
        contactStepDesc: "เบอร์หรือที่อยู่สำหรับเอกสาร",
        serviceStep: "ตั้งค่าการให้บริการ",
        serviceStepDesc: "เวลาเปิดปิดและจำนวนโต๊ะถูกต้อง",
        afterCreateTitle: "หลังสร้างร้านแล้ว",
        afterCreateItems: ["เพิ่มเมนูขายจริง", "จัดผังโต๊ะ", "เชิญผู้จัดการหรือพนักงาน"],
        planTitle: "แพ็กเกจปัจจุบัน",
        planUsage: "ร้าน",
        planDescription: "ตอนนี้ใช้ limit จากจำนวนร้านที่บัญชีนี้เป็นเจ้าของ ก่อนต่อระบบ subscription จริง",
        restaurantNameFallback: "ชื่อร้าน",
        branchFallback: "สาขาหลัก",
        submitError: "สร้างร้านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        validationNameRequired: "กรุณากรอกชื่อร้าน",
        validationNameLong: "ชื่อร้านยาวเกินไป",
        validationBranchRequired: "กรุณาระบุชื่อสาขา",
        validationPhone: "เบอร์โทรควรมีอย่างน้อย 9 หลัก",
        validationOpen: "เวลาเปิดต้องอยู่ในรูปแบบ HH:mm",
        validationClose: "เวลาปิดต้องอยู่ในรูปแบบ HH:mm",
        validationTables: "จำนวนโต๊ะต้องอยู่ระหว่าง 1 ถึง 500",
      }
    : {
        pageTitle: "Create a restaurant",
        pageDescription: "Set up the core details before entering the operations view. This account will become the owner of the restaurant.",
        viewPlan: "View plan",
        starterTitle: "Restaurant starter details",
        starterDescription: "These details appear in receipts, the command center, and restaurant settings.",
        completion: "Completion",
        freePlanTitle: "The Free plan includes 1 restaurant",
        freePlanDescription: "Upgrade to Pro to add more restaurants or branches.",
        restaurantSectionTitle: "Restaurant details",
        restaurantSectionDescription: "Restaurant name and type help your team distinguish each location correctly.",
        nameLabel: "Restaurant name",
        namePlaceholder: "For example, Baan Som Kitchen",
        branchLabel: "Branch name",
        branchPlaceholder: "Main branch",
        branchHelp: "Use Main branch if you only have one location.",
        typeLabel: "Restaurant type",
        contactSectionTitle: "Contact details",
        contactSectionDescription: "Used on documents and helps the team verify the correct branch.",
        phoneLabel: "Restaurant phone",
        phonePlaceholder: "044-000-000",
        phoneHelp: "You can use a mobile number or the shop number.",
        addressLabel: "Restaurant address",
        addressPlaceholder: "Address for receipts and restaurant info",
        scheduleSectionTitle: "Opening hours and tables",
        scheduleSectionDescription: "Used as the default setup for the command center, table layout, and daily operations.",
        openLabel: "Open time",
        closeLabel: "Close time",
        tablesLabel: "Starting tables",
        submitIdle: "Create restaurant and enter dashboard",
        submitBusy: "Creating restaurant...",
        previewTitle: "Restaurant preview",
        previewDescription: "This is how it will appear in the restaurant selector.",
        previewStoreName: "Restaurant",
        previewBranch: "Branch",
        previewPhone: "Phone",
        previewHours: "Hours",
        previewTables: "Tables",
        previewAddress: "Address",
        unknown: "Not set",
        invalid: "Needs fixing",
        identityStep: "Set the identity",
        identityStepDesc: "Restaurant and branch names are ready to use",
        contactStep: "Add contact details",
        contactStepDesc: "Phone or address for documents",
        serviceStep: "Set service defaults",
        serviceStepDesc: "Hours and table count are valid",
        afterCreateTitle: "After creating the restaurant",
        afterCreateItems: ["Add live menu items", "Arrange the table layout", "Invite managers or staff"],
        planTitle: "Current plan",
        planUsage: "restaurants",
        planDescription: "Right now the limit is based on how many restaurants this account owns before the real subscription system is connected.",
        restaurantNameFallback: "Restaurant name",
        branchFallback: "Main branch",
        submitError: "Could not create the restaurant. Please try again.",
        validationNameRequired: "Please enter the restaurant name.",
        validationNameLong: "The restaurant name is too long.",
        validationBranchRequired: "Please enter the branch name.",
        validationPhone: "The phone number should have at least 9 digits.",
        validationOpen: "Open time must use the HH:mm format.",
        validationClose: "Close time must use the HH:mm format.",
        validationTables: "The table count must be between 1 and 500.",
      };

  const trimmedName = name.trim();
  const trimmedBranch = branch.trim();
  const tableCount = Number.parseInt(initialTables, 10);
  const ownerRestaurantCount = memberships.filter((membership) => membership.role?.name === "owner").length;
  const planFull = ownerRestaurantCount >= PLAN.maxRestaurants;
  const previewName = trimmedName || copy.restaurantNameFallback;
  const previewBranch = trimmedBranch || copy.branchFallback;
  const validTableCount = Number.isFinite(tableCount) && tableCount >= 1 && tableCount <= 500;

  const completion = useMemo(() => {
    const checks = [
      trimmedName.length > 0,
      trimmedBranch.length > 0,
      phone.trim().length > 0,
      address.trim().length > 0,
      validateTime(openTime),
      validateTime(closeTime),
      validTableCount,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [address, closeTime, openTime, phone, trimmedBranch, trimmedName, validTableCount]);

  const validate = () => {
    const next: FormErrors = {};
    if (!trimmedName) next.name = copy.validationNameRequired;
    if (trimmedName.length > 120) next.name = copy.validationNameLong;
    if (!trimmedBranch) next.branch = copy.validationBranchRequired;
    if (phone.trim() && phone.replace(/\D/g, "").length < 9) next.phone = copy.validationPhone;
    if (!validateTime(openTime)) next.openTime = copy.validationOpen;
    if (!validateTime(closeTime)) next.closeTime = copy.validationClose;
    if (!validTableCount) next.initialTables = copy.validationTables;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    if (!validate()) return;

    await submitOnceRef.current(async () => {
      setSubmitting(true);
      try {
        const res = await createRestaurant({
          name: trimmedName,
          branch_name: trimmedBranch,
          restaurant_type: type,
          address: address.trim(),
          phone: phone.trim(),
          open_time: openTime,
          close_time: closeTime,
          table_count: tableCount,
        });
        const membership = res.data.membership;
        restaurantRepository.setActiveId(membership.restaurant_id);
        setActiveRestaurant(membership.restaurant_id);
        await refreshMemberships();
        router.push("/home");
      } catch {
        setErrors({ submit: copy.submitError });
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <WorkspaceShell title={copy.pageTitle} description={copy.pageDescription}>
      <div className="mt-6 flex items-center justify-between gap-3">
        <BackToRestaurants />
        <Link href="/settings" className="text-[12px] font-medium text-orange-600 hover:underline dark:text-orange-400">
          {copy.viewPlan}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.starterTitle}</h2>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{copy.starterDescription}</p>
                </div>
                <div className="min-w-[140px]">
                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                    <span>{copy.completion}</span>
                    <span className="font-mono tabular-nums">{completion}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-900">
                    <div className="h-full rounded-full bg-orange-600 transition-all" style={{ width: `${completion}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {planFull ? (
              <div className="p-4">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/15">
                  <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">{copy.freePlanTitle}</p>
                  <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-300/80">{copy.freePlanDescription}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <Section title={copy.restaurantSectionTitle} description={copy.restaurantSectionDescription}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={copy.nameLabel} placeholder={copy.namePlaceholder} value={name} onChange={setName} error={errors.name} />
                    <Field
                      label={copy.branchLabel}
                      placeholder={copy.branchPlaceholder}
                      value={branch}
                      onChange={setBranch}
                      error={errors.branch}
                      help={copy.branchHelp}
                    />
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.typeLabel}</span>
                      <ThemedSelect
                        value={type}
                        onChange={setType}
                        options={RESTAURANT_TYPES.map((item) => ({
                          value: item,
                          label: getRestaurantTypeLabel(item, language),
                        }))}
                      />
                    </label>
                  </div>
                </Section>

                <Section title={copy.contactSectionTitle} description={copy.contactSectionDescription}>
                  <div className="grid grid-cols-1 gap-3">
                    <Field
                      label={copy.phoneLabel}
                      placeholder={copy.phonePlaceholder}
                      value={phone}
                      onChange={(value) => setPhone(normalizePhone(value))}
                      error={errors.phone}
                      inputMode="tel"
                      help={copy.phoneHelp}
                    />
                    <TextAreaField
                      label={copy.addressLabel}
                      placeholder={copy.addressPlaceholder}
                      value={address}
                      onChange={setAddress}
                      error={errors.address}
                    />
                  </div>
                </Section>

                <Section title={copy.scheduleSectionTitle} description={copy.scheduleSectionDescription}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label={copy.openLabel} type="time" value={openTime} onChange={setOpenTime} error={errors.openTime} />
                    <Field label={copy.closeLabel} type="time" value={closeTime} onChange={setCloseTime} error={errors.closeTime} />
                    <Field
                      label={copy.tablesLabel}
                      type="number"
                      value={initialTables}
                      onChange={setInitialTables}
                      error={errors.initialTables}
                      inputMode="numeric"
                      min={1}
                      max={500}
                    />
                  </div>
                </Section>

                <div className="border-t border-gray-200 px-4 py-4 dark:border-gray-800">
                  {errors.submit && (
                    <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                      {errors.submit}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-gray-900"
                  >
                    {submitting ? copy.submitBusy : copy.submitIdle}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{copy.previewTitle}</p>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{copy.previewDescription}</p>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-orange-600 text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
                    <path d="M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3M21 15v7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-gray-900 dark:text-white">{previewName}</p>
                  <p className="mt-0.5 truncate text-[12px] text-gray-500 dark:text-gray-400">
                    {previewBranch} · {getRestaurantTypeLabel(type, language)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <PreviewRow label={copy.previewStoreName} value={previewName} />
                <PreviewRow label={copy.previewBranch} value={previewBranch} />
                <PreviewRow label={copy.previewPhone} value={phone.trim() || copy.unknown} />
                <PreviewRow label={copy.previewHours} value={`${openTime || "--:--"}-${closeTime || "--:--"}`} />
                <PreviewRow
                  label={copy.previewTables}
                  value={validTableCount ? `${tableCount} ${copy.previewTables.toLowerCase()}` : copy.invalid}
                />
                <PreviewRow label={copy.previewAddress} value={address.trim() || copy.unknown} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <SetupStep done={Boolean(trimmedName && trimmedBranch)} title={copy.identityStep} description={copy.identityStepDesc} />
            <SetupStep done={Boolean(phone.trim() || address.trim())} title={copy.contactStep} description={copy.contactStepDesc} />
            <SetupStep
              done={validateTime(openTime) && validateTime(closeTime) && validTableCount}
              title={copy.serviceStep}
              description={copy.serviceStepDesc}
            />
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{copy.afterCreateTitle}</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {copy.afterCreateItems.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{copy.planTitle}</p>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                {ownerRestaurantCount}/{PLAN.maxRestaurants} {copy.planUsage}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{copy.planDescription}</p>
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
