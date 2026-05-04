"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { createRestaurant } from "@/src/lib/restaurant";
import { createSingleFlight } from "@/src/lib/singleFlight";
import { restaurantRepository } from "../../repositories/restaurantRepository";
import { BackToRestaurants, PLAN, RESTAURANT_TYPES, WorkspaceShell } from "../restaurantWorkspaceUi";
import ThemedSelect from "@/src/components/shared/ThemedSelect";

type FormErrors = Partial<Record<"name" | "branch" | "phone" | "address" | "openTime" | "closeTime" | "initialTables" | "submit", string>>;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    if (type !== "time") return;

    const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    try {
      input?.showPicker?.();
    } catch {
      input?.focus();
    }
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        inputMode={inputMode}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        onClick={openPicker}
        onMouseDown={(event) => {
          if (type === "time") {
            event.preventDefault();
            inputRef.current?.focus();
            openPicker();
          }
        }}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`h-10 w-full select-none rounded-md border bg-white px-3 text-[13px] outline-none transition-colors dark:bg-gray-900 ${
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
      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        done
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
          : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400"
      }`}>
        {done ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
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
  const [type, setType] = useState(RESTAURANT_TYPES[0]);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("สาขาหลัก");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openTime, setOpenTime] = useState("17:00");
  const [closeTime, setCloseTime] = useState("00:00");
  const [initialTables, setInitialTables] = useState("12");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const submitOnceRef = useRef(createSingleFlight());

  const trimmedName = name.trim();
  const trimmedBranch = branch.trim();
  const tableCount = Number.parseInt(initialTables, 10);
  const ownerRestaurantCount = memberships.filter((membership) => membership.role?.name === "owner").length;
  const planFull = ownerRestaurantCount >= PLAN.maxRestaurants;
  const displayName = trimmedBranch && trimmedBranch !== "สาขาหลัก" ? `${trimmedName || "ชื่อร้าน"} (${trimmedBranch})` : trimmedName || "ชื่อร้าน";
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
    if (!trimmedName) next.name = "กรุณากรอกชื่อร้าน";
    if (trimmedName.length > 120) next.name = "ชื่อร้านยาวเกินไป";
    if (!trimmedBranch) next.branch = "กรุณาระบุชื่อสาขา";
    if (phone.trim() && phone.replace(/\D/g, "").length < 9) next.phone = "เบอร์โทรควรมีอย่างน้อย 9 หลัก";
    if (!validateTime(openTime)) next.openTime = "เวลาเปิดต้องอยู่ในรูปแบบ HH:mm";
    if (!validateTime(closeTime)) next.closeTime = "เวลาปิดต้องอยู่ในรูปแบบ HH:mm";
    if (!validTableCount) next.initialTables = "จำนวนโต๊ะต้องอยู่ระหว่าง 1 ถึง 500";
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
          name: displayName,
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
        setErrors({ submit: "สร้างร้านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <WorkspaceShell
      title="สร้างร้านใหม่"
      description="ตั้งค่าข้อมูลหลักให้พร้อมก่อนเข้าหน้าภาพรวม ร้านจะถูกผูกกับบัญชีนี้ในบทบาทเจ้าของร้าน"
    >
      <div className="mt-6 flex items-center justify-between gap-3">
        <BackToRestaurants />
        <Link href="/settings" className="text-[12px] font-medium text-orange-600 hover:underline dark:text-orange-400">
          ดูแพ็กเกจ
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">ข้อมูลเริ่มต้นของร้าน</h2>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">ข้อมูลชุดนี้จะใช้ในใบเสร็จ หน้า dashboard และการตั้งค่าร้าน</p>
                </div>
                <div className="min-w-[140px]">
                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                    <span>ความครบถ้วน</span>
                    <span className="font-mono">{completion}%</span>
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
                  <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">แพ็กเกจ Free เปิดร้านได้ 1 ร้าน</p>
                  <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-300/80">อัปเกรดเป็น Pro เพื่อสร้างร้านหรือสาขาเพิ่ม</p>
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <Section title="ข้อมูลร้าน" description="ชื่อร้านและประเภทจะช่วยให้ทีมแยกร้านหรือสาขาได้ถูกต้อง">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="ชื่อร้าน" placeholder="เช่น ครัวบ้านส้ม" value={name} onChange={setName} error={errors.name} />
                    <Field label="ชื่อสาขา" placeholder="สาขาหลัก" value={branch} onChange={setBranch} error={errors.branch} help="ถ้ามีร้านเดียวให้ใช้สาขาหลัก" />
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">ประเภทร้าน</span>
                      <ThemedSelect
                        value={type}
                        onChange={setType}
                        options={RESTAURANT_TYPES.map((item) => ({ value: item, label: item }))}
                      />
                    </label>
                  </div>
                </Section>

                <Section title="ข้อมูลติดต่อ" description="ใช้แสดงบนเอกสารและช่วยให้ทีมตรวจสอบสาขาถูก">
                  <div className="grid grid-cols-1 gap-3">
                    <Field
                      label="เบอร์ร้าน"
                      placeholder="044-000-000"
                      value={phone}
                      onChange={(value) => setPhone(normalizePhone(value))}
                      error={errors.phone}
                      inputMode="tel"
                      help="ใส่ได้ทั้งเบอร์มือถือหรือเบอร์หน้าร้าน"
                    />
                    <TextAreaField
                      label="ที่อยู่ร้าน"
                      placeholder="ที่อยู่สำหรับใบเสร็จและข้อมูลร้าน"
                      value={address}
                      onChange={setAddress}
                      error={errors.address}
                    />
                  </div>
                </Section>

                <Section title="เวลาเปิดปิดและโต๊ะ" description="ใช้เป็นค่าเริ่มต้นสำหรับหน้าภาพรวม ผังโต๊ะ และรอบการทำงาน">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="เวลาเปิด" type="time" value={openTime} onChange={setOpenTime} error={errors.openTime} />
                    <Field label="เวลาปิด" type="time" value={closeTime} onChange={setCloseTime} error={errors.closeTime} />
                    <Field
                      label="จำนวนโต๊ะเริ่มต้น"
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
                    {submitting ? "กำลังสร้างร้าน..." : "สร้างร้านและเข้า dashboard"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <p className="text-[12px] font-semibold text-gray-900 dark:text-white">ตัวอย่างข้อมูลร้าน</p>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">สรุปแบบเดียวกับที่จะเห็นในหน้าเลือกร้าน</p>
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
                  <p className="truncate text-[14px] font-semibold text-gray-900 dark:text-white">{displayName}</p>
                  <p className="mt-0.5 truncate text-[12px] text-gray-500 dark:text-gray-400">{type}</p>
                </div>
              </div>
              <div className="mt-4">
                <PreviewRow label="เบอร์" value={phone.trim() || "ยังไม่ระบุ"} />
                <PreviewRow label="เวลาเปิด" value={`${openTime || "--:--"}-${closeTime || "--:--"}`} />
                <PreviewRow label="โต๊ะ" value={validTableCount ? `${tableCount} โต๊ะ` : "ยังไม่ถูกต้อง"} />
                <PreviewRow label="ที่อยู่" value={address.trim() || "ยังไม่ระบุ"} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <SetupStep done={Boolean(trimmedName && trimmedBranch)} title="ระบุตัวตนร้าน" description="ชื่อร้านและสาขาพร้อมใช้งาน" />
            <SetupStep done={Boolean(phone.trim() || address.trim())} title="ข้อมูลติดต่อ" description="เบอร์หรือที่อยู่สำหรับเอกสาร" />
            <SetupStep done={validateTime(openTime) && validateTime(closeTime) && validTableCount} title="ตั้งค่าการให้บริการ" description="เวลาเปิดปิดและจำนวนโต๊ะถูกต้อง" />
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <p className="text-[12px] font-semibold text-gray-900 dark:text-white">หลังสร้างร้านแล้ว</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {["เพิ่มเมนูขายจริง", "จัดผังโต๊ะ", "เชิญผู้จัดการหรือพนักงาน"].map((item) => (
                <div key={item} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold text-gray-900 dark:text-white">แพ็กเกจปัจจุบัน</p>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                {ownerRestaurantCount}/{PLAN.maxRestaurants} ร้าน
              </span>
            </div>
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">ตอนนี้ใช้ limit จากจำนวนร้านที่บัญชีนี้เป็นเจ้าของ ก่อนต่อระบบ subscription จริง</p>
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
