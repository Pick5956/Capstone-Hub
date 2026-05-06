"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import {
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  adjustStock,
  listTransactions,
} from "@/src/lib/ingredient";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { Ingredient, IngredientInput, IngredientTransaction } from "@/src/types/ingredient";
import { RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";

const UNITS = ["kg", "g", "liter", "ml", "piece", "pack", "bottle", "box", "bag"];
const emptyForm: IngredientInput = { name: "", unit: "kg", stock: 0, min_stock: 0, cost_per_unit: 0 };
type StockStatus = "all" | "ok" | "low" | "out";

function getStatus(item: Ingredient): "ok" | "low" | "out" {
  if (item.stock === 0) return "out";
  if (item.min_stock > 0 && item.stock <= item.min_stock) return "low";
  return "ok";
}

function getStockPercent(item: Ingredient) {
  if (item.min_stock <= 0) return 100;
  if (item.stock <= 0) return 0;
  return Math.min(100, Math.round((item.stock / item.min_stock) * 100));
}

function StatusDot({ status }: { status: "ok" | "low" | "out" }) {
  if (status === "ok") return <span className="h-2 w-2 rounded-full bg-emerald-400" />;
  if (status === "low") return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" />
      <span className="relative h-2 w-2 rounded-full bg-amber-400" />
    </span>
  );
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
      <span className="relative h-2 w-2 rounded-full bg-red-500" />
    </span>
  );
}

function buildCopy(language: "th" | "en") {
  return language === "th" ? {
    title: "คลังวัตถุดิบ", eyebrow: "Inventory",
    subtitle: "จัดการสต็อกวัตถุดิบของร้าน",
    searchPlaceholder: "ค้นหาวัตถุดิบ...",
    filter: "ตัวกรอง",
    add: "เพิ่มวัตถุดิบ",
    edit: "แก้ไข", delete: "ลบ", adjust: "ปรับสต็อก", history: "ประวัติ",
    name: "ชื่อวัตถุดิบ", unit: "หน่วย", stock: "สต็อก", level: "ระดับสต็อก", minStock: "ขั้นต่ำ", costPerUnit: "ราคา/หน่วย",
    save: "บันทึก", cancel: "ยกเลิก",
    confirmDelete: "ยืนยันการลบ",
    deleteMsg: (n: string) => `ลบ "${n}" ออกจากคลังวัตถุดิบ?`,
    adjustTitle: "ปรับสต็อก", adjustIn: "รับเข้า", adjustOut: "จ่ายออก", adjustSet: "ตั้งค่าใหม่",
    quantity: "จำนวน", note: "หมายเหตุ",
    previewAfter: "หลังบันทึก",
    txTitle: "ประวัติการเคลื่อนไหว", txEmpty: "ยังไม่มีประวัติ",
    lowStock: "ต่ำ", outOfStock: "หมด",
    filterAll: "ทั้งหมด", filterOk: "ปกติ", filterLow: "ต่ำ", filterOut: "หมด",
    noIngredients: "ยังไม่มีวัตถุดิบในคลัง",
    noResults: "ไม่พบวัตถุดิบ",
    alertLow: (n: number) => `${n} รายการสต็อกต่ำกว่าเกณฑ์`,
    alertOut: (n: number) => `${n} รายการหมดสต็อก`,
    total: "รายการทั้งหมด",
    permissionDenied: "ไม่มีสิทธิ์เข้าถึงคลังวัตถุดิบ",
    initialStock: "สต็อกเริ่มต้น",
    today: "วันนี้", yesterday: "เมื่อวาน",
  } : {
    title: "Inventory", eyebrow: "Inventory",
    subtitle: "Manage your restaurant's ingredient stock",
    searchPlaceholder: "Search ingredients...",
    filter: "Filter",
    add: "Add ingredient",
    edit: "Edit", delete: "Delete", adjust: "Adjust", history: "History",
    name: "Name", unit: "Unit", stock: "Stock", level: "Level", minStock: "Min", costPerUnit: "Cost/unit",
    save: "Save", cancel: "Cancel",
    confirmDelete: "Confirm delete",
    deleteMsg: (n: string) => `Remove "${n}" from inventory?`,
    adjustTitle: "Adjust stock", adjustIn: "Stock in", adjustOut: "Stock out", adjustSet: "Set value",
    quantity: "Quantity", note: "Note",
    previewAfter: "After saving",
    txTitle: "Transaction history", txEmpty: "No transactions yet",
    lowStock: "Low", outOfStock: "Out",
    filterAll: "All", filterOk: "OK", filterLow: "Low", filterOut: "Out",
    noIngredients: "No ingredients yet.",
    noResults: "No ingredients found.",
    alertLow: (n: number) => `${n} items below minimum stock`,
    alertOut: (n: number) => `${n} items out of stock`,
    total: "total items",
    permissionDenied: "You don't have permission to view inventory.",
    initialStock: "Initial stock",
    today: "Today", yesterday: "Yesterday",
  };
}

function groupTxByDate(txs: IngredientTransaction[], copy: ReturnType<typeof buildCopy>) {
  const map = new Map<string, IngredientTransaction[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  for (const tx of txs) {
    const key = (tx.CreatedAt ? new Date(tx.CreatedAt) : new Date()).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    label: key === today ? copy.today : key === yesterday ? copy.yesterday : new Date(key).toLocaleDateString(),
    items,
  }));
}

/* ─── Input shared style ─── */
const inputCls = "w-full rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500";

export default function InventoryPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canManage = can(activeMembership, "manage_inventory");
  const canView = canManage || can(activeMembership, "view_inventory");
  const copy = useMemo(() => buildCopy(language as "th" | "en"), [language]);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatus>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [form, setForm] = useState<IngredientInput>(emptyForm);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);

  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustType, setAdjustType] = useState<"in" | "out" | "adjust">("in");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const [txTarget, setTxTarget] = useState<Ingredient | null>(null);
  const [transactions, setTransactions] = useState<IngredientTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const saveOnce = useRef(createSingleFlight());
  const deleteOnce = useRef(createSingleFlight());
  const adjustOnce = useRef(createSingleFlight());

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    listIngredients().then((r) => setIngredients(r.data.ingredients ?? [])).finally(() => setLoading(false));
  }, [canView]);

  const lowCount = ingredients.filter((i) => getStatus(i) === "low").length;
  const outCount = ingredients.filter((i) => getStatus(i) === "out").length;

  const filtered = useMemo(() => ingredients.filter((i) => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && getStatus(i) !== statusFilter) return false;
    return true;
  }), [ingredients, search, statusFilter]);

  const adjustPreview = useMemo(() => {
    if (!adjustTarget || !adjustQty) return null;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty <= 0) return null;
    if (adjustType === "in") return adjustTarget.stock + qty;
    if (adjustType === "out") return Math.max(0, adjustTarget.stock - qty);
    return qty;
  }, [adjustTarget, adjustQty, adjustType]);

  function openCreate() { setEditingItem(null); setForm(emptyForm); setFormError(""); setModalOpen(true); }
  function openEdit(item: Ingredient) {
    setEditingItem(item);
    setForm({ name: item.name, unit: item.unit, stock: item.stock, min_stock: item.min_stock, cost_per_unit: item.cost_per_unit });
    setFormError(""); setModalOpen(true);
  }

  async function handleSave() {
    setFormError("");
    if (!form.name.trim()) { setFormError(language === "th" ? "กรุณาระบุชื่อวัตถุดิบ" : "Name is required"); return; }
    await saveOnce.current(async () => {
      setSubmitting(true);
      try {
        if (editingItem) {
          const r = await updateIngredient(editingItem.ID, form);
          setIngredients((p) => p.map((i) => i.ID === editingItem.ID ? r.data : i));
        } else {
          const r = await createIngredient(form);
          setIngredients((p) => [...p, r.data]);
        }
        setModalOpen(false);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } } };
        setFormError(err?.response?.data?.error ?? (language === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
      } finally { setSubmitting(false); }
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteOnce.current(async () => {
      try { await deleteIngredient(deleteTarget.ID); setIngredients((p) => p.filter((i) => i.ID !== deleteTarget.ID)); }
      finally { setDeleteTarget(null); }
    });
  }

  function openAdjust(item: Ingredient) { setAdjustTarget(item); setAdjustType("in"); setAdjustQty(""); setAdjustNote(""); setAdjustError(""); }

  async function handleAdjust() {
    if (!adjustTarget) return;
    const qty = parseFloat(adjustQty);
    if (!adjustQty || isNaN(qty) || qty <= 0) { setAdjustError(language === "th" ? "กรุณาระบุจำนวนที่ถูกต้อง" : "Enter a valid quantity"); return; }
    await adjustOnce.current(async () => {
      setAdjusting(true);
      try {
        const r = await adjustStock(adjustTarget.ID, { type: adjustType, quantity: qty, note: adjustNote });
        setIngredients((p) => p.map((i) => i.ID === adjustTarget.ID ? r.data : i));
        setAdjustTarget(null);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } } };
        setAdjustError(err?.response?.data?.error ?? (language === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
      } finally { setAdjusting(false); }
    });
  }

  async function openTransactions(item: Ingredient) {
    setTxTarget(item); setTransactions([]); setTxLoading(true);
    try { const r = await listTransactions(item.ID); setTransactions(r.data.transactions ?? []); }
    finally { setTxLoading(false); }
  }

  if (loading) return <div className="p-6"><RestaurantCardSkeleton /></div>;

  if (!canView) return (
    <div className="flex h-64 items-center justify-center text-sm text-gray-400">{copy.permissionDenied}</div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 bg-[radial-gradient(1100px_circle_at_15%_-10%,rgba(249,115,22,0.12),transparent_45%),radial-gradient(900px_circle_at_85%_0%,rgba(59,130,246,0.08),transparent_40%)] px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6">
      <div className="flex flex-1 flex-col bg-white/90 shadow-sm backdrop-blur-sm dark:bg-gray-950/80">
        {/* ── Page header ── */}
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">{copy.eyebrow}</p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">{copy.title}</h1>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                  {ingredients.length} {copy.total}
                </span>
              </div>
              <p className="text-xs text-gray-400">{copy.subtitle}</p>
            </div>
          </div>
          <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative min-w-[220px] flex-1 sm:flex-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" placeholder={copy.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)}
                className={`${inputCls} pl-9`} />
            </div>
            <button onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M22 3H2l8 9v7l4 2v-9l8-9z"/>
              </svg>
              {copy.filter}
            </button>
            {canManage && (
              <button onClick={openCreate}
                className="flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-95 dark:bg-white dark:text-gray-900">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {copy.add}
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          {/* ── Alert chips ── */}
          {(outCount > 0 || lowCount > 0) && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {outCount > 0 && (
                <button onClick={() => setStatusFilter("out")}
                  className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60"/>
                    <span className="relative h-2 w-2 rounded-full bg-red-500"/>
                  </span>
                  {copy.alertOut(outCount)}
                </button>
              )}
              {lowCount > 0 && (
                <button onClick={() => setStatusFilter("low")}
                  className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60"/>
                    <span className="relative h-2 w-2 rounded-full bg-amber-400"/>
                  </span>
                  {copy.alertLow(lowCount)}
                </button>
              )}
            </div>
          )}

          {/* ── Filters ── */}
          <div className={`${filtersOpen ? "flex" : "hidden sm:flex"} flex-wrap items-center gap-2`}>
            <div className="flex rounded-full border border-slate-200 bg-white text-xs font-semibold shadow-sm dark:border-gray-700 dark:bg-gray-900">
              {(["all", "ok", "low", "out"] as StockStatus[]).map((s, i) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 transition-colors ${i > 0 ? "border-l border-slate-200 dark:border-gray-700" : ""} ${
                    statusFilter === s
                      ? "bg-slate-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                  } ${i === 0 ? "rounded-l-full" : ""} ${i === 3 ? "rounded-r-full" : ""}`}>
                  {s === "all" ? copy.filterAll : s === "ok" ? copy.filterOk : s === "low" ? copy.filterLow : copy.filterOut}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        {filtered.length === 0 ? (
          <div className="mx-5 mb-5 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/60 dark:border-gray-800 dark:bg-gray-950/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="h-8 w-8 text-gray-300 dark:text-gray-700">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
            <p className="text-sm text-gray-400">{ingredients.length === 0 ? copy.noIngredients : copy.noResults}</p>
          </div>
        ) : (
          <div className="mx-5 mb-5 flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/80 dark:border-gray-800 dark:bg-gray-950/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900/50">
                  <th className="px-5 py-3 text-left">{copy.name}</th>
                  <th className="px-5 py-3 text-left">{copy.level}</th>
                  <th className="px-5 py-3 text-right">{copy.stock}</th>
                  <th className="hidden px-5 py-3 text-right sm:table-cell">{copy.minStock}</th>
                  <th className="hidden px-5 py-3 text-right md:table-cell">{copy.costPerUnit}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/80 dark:divide-gray-800/60 dark:bg-gray-950/40">
                {filtered.map((item) => {
                  const status = getStatus(item);
                  const isAlert = status !== "ok";
                  const percent = getStockPercent(item);
                  const barColor = status === "out"
                    ? "bg-red-500"
                    : status === "low"
                      ? "bg-amber-400"
                      : "bg-emerald-500";

                  return (
                    <tr key={item.ID} className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-gray-900/40">
                      {/* name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
                            </svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold ${isAlert ? "text-gray-900 dark:text-white" : "text-gray-800 dark:text-gray-200"}`}>
                                {item.name}
                              </span>
                              <StatusDot status={status} />
                            </div>
                            <span className="text-xs text-gray-400">{item.unit}</span>
                          </div>
                          {status === "out" && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              {copy.outOfStock}
                            </span>
                          )}
                          {status === "low" && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                              {copy.lowStock}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* level */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-28 rounded-full bg-slate-100 dark:bg-gray-800">
                            <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{percent}%</span>
                        </div>
                      </td>
                      {/* stock */}
                      <td className={`px-5 py-4 text-right font-semibold tabular-nums ${
                        status === "out" ? "text-red-500 dark:text-red-400"
                        : status === "low" ? "text-amber-600 dark:text-amber-400"
                        : "text-gray-900 dark:text-white"
                      }`}>
                        {item.stock.toLocaleString()}
                      </td>
                      {/* min */}
                      <td className="hidden px-5 py-4 text-right tabular-nums text-gray-400 sm:table-cell">
                        {item.min_stock > 0 ? item.min_stock.toLocaleString() : "—"}
                      </td>
                      {/* cost */}
                      <td className="hidden px-5 py-4 text-right tabular-nums text-gray-400 md:table-cell">
                        {item.cost_per_unit > 0 ? `฿${item.cost_per_unit.toLocaleString()}` : "—"}
                      </td>
                      {/* actions */}
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => openTransactions(item)} title={copy.history}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-slate-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                          </button>
                          {canManage && (
                            <>
                              <button onClick={() => openAdjust(item)} title={copy.adjust}
                                className="rounded-md p-1.5 text-gray-400 transition hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20 dark:hover:text-orange-400">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                              </button>
                              <button onClick={() => openEdit(item)} title={copy.edit}
                                className="rounded-md p-1.5 text-gray-400 transition hover:bg-slate-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button onClick={() => setDeleteTarget(item)} title={copy.delete}
                                className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-auto border-t border-slate-100 bg-slate-50/80 px-5 py-3 text-xs text-gray-400 dark:border-gray-800 dark:bg-gray-900/40">
              {filtered.length} {language === "th" ? "รายการ" : "items"}
              {ingredients.length !== filtered.length && ` (${language === "th" ? "จาก" : "of"} ${ingredients.length})`}
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-950">
            <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <h2 className="font-bold text-gray-900 dark:text-white">
                {editingItem ? copy.edit : copy.add}
              </h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.name}</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.unit}</label>
                  <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className={inputCls}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                {!editingItem && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.initialStock}</label>
                    <input type="number" min={0} value={form.stock}
                      onChange={(e) => setForm((f) => ({ ...f, stock: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.minStock}</label>
                  <input type="number" min={0} value={form.min_stock}
                    onChange={(e) => setForm((f) => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.costPerUnit} (฿)</label>
                  <input type="number" min={0} value={form.cost_per_unit}
                    onChange={(e) => setForm((f) => ({ ...f, cost_per_unit: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
              <button onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800">{copy.cancel}</button>
              <button onClick={handleSave} disabled={submitting}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-50 active:scale-95">
                {submitting ? "..." : copy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl dark:bg-gray-950">
            <div className="px-6 py-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-red-500">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <h2 className="mb-1 font-bold text-gray-900 dark:text-white">{copy.confirmDelete}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{copy.deleteMsg(deleteTarget.name)}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800">{copy.cancel}</button>
              <button onClick={handleDelete} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 active:scale-95">{copy.delete}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Adjust Stock Modal ── */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl dark:bg-gray-950">
            <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <h2 className="font-bold text-gray-900 dark:text-white">{copy.adjustTitle}</h2>
              <p className="mt-0.5 text-sm text-gray-400">{adjustTarget.name} · {language === "th" ? "คงเหลือ" : "current"} {adjustTarget.stock} {adjustTarget.unit}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* type selector */}
              <div className="grid grid-cols-3 gap-2">
                {(["in", "out", "adjust"] as const).map((t) => (
                  <button key={t} onClick={() => setAdjustType(t)}
                    className={`rounded-lg border py-2 text-xs font-semibold transition ${
                      adjustType === t
                        ? t === "in" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                          : t === "out" ? "border-red-300 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400"
                          : "border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
                        : "border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400"
                    }`}>
                    {t === "in" ? copy.adjustIn : t === "out" ? copy.adjustOut : copy.adjustSet}
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.quantity} ({adjustTarget.unit})</label>
                <input type="number" min={0} value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className={inputCls} autoFocus />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.note}</label>
                <input type="text" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className={inputCls} />
              </div>
              {/* preview */}
              {adjustPreview !== null && (
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900">
                  <span className="text-xs text-gray-400">{copy.previewAfter}</span>
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    <span className="text-gray-400 tabular-nums">{adjustTarget.stock}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-3 w-3 text-gray-300">
                      <path d="M5 12h14M13 6l6 6-6 6"/>
                    </svg>
                    <span className={`tabular-nums ${
                      adjustPreview > adjustTarget.stock ? "text-emerald-600 dark:text-emerald-400"
                      : adjustPreview < adjustTarget.stock ? "text-red-500 dark:text-red-400"
                      : "text-gray-900 dark:text-white"
                    }`}>{adjustPreview}</span>
                    <span className="text-xs font-normal text-gray-400">{adjustTarget.unit}</span>
                  </div>
                </div>
              )}
              {adjustError && <p className="text-xs text-red-500">{adjustError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
              <button onClick={() => setAdjustTarget(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800">{copy.cancel}</button>
              <button onClick={handleAdjust} disabled={adjusting}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50 active:scale-95">
                {adjusting ? "..." : copy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction History Drawer ── */}
      {txTarget && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setTxTarget(null)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl dark:bg-gray-950" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">{copy.txTitle}</h2>
                <p className="text-xs text-gray-400">{txTarget.name}</p>
              </div>
              <button onClick={() => setTxTarget(null)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {txLoading ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-400">Loading...</div>
              ) : transactions.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-400">{copy.txEmpty}</div>
              ) : (
                <div className="space-y-6">
                  {groupTxByDate(transactions, copy).map(({ label, items }) => (
                    <div key={label}>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
                      <div className="space-y-1">
                        {items.map((tx) => (
                          <div key={tx.ID} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-gray-50 dark:hover:bg-gray-900">
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                              tx.type === "in" ? "bg-emerald-100 dark:bg-emerald-900/30"
                              : tx.type === "out" ? "bg-red-100 dark:bg-red-900/30"
                              : "bg-gray-100 dark:bg-gray-800"
                            }`}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`h-3.5 w-3.5 ${
                                tx.type === "in" ? "text-emerald-600 dark:text-emerald-400"
                                : tx.type === "out" ? "text-red-500 dark:text-red-400"
                                : "text-gray-500 dark:text-gray-400"
                              }`}>
                                {tx.type === "in"
                                  ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
                                  : tx.type === "out"
                                  ? <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>
                                  : <><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/></>
                                }
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                {tx.type === "in" ? copy.adjustIn : tx.type === "out" ? copy.adjustOut : copy.adjustSet}
                              </p>
                              {tx.note && <p className="truncate text-xs text-gray-400">{tx.note}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-bold tabular-nums ${
                                tx.type === "in" ? "text-emerald-600 dark:text-emerald-400"
                                : tx.type === "out" ? "text-red-500 dark:text-red-400"
                                : "text-gray-700 dark:text-gray-300"
                              }`}>
                                {tx.type === "in" ? "+" : tx.type === "out" ? "−" : ""}{tx.quantity}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {tx.CreatedAt ? new Date(tx.CreatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
