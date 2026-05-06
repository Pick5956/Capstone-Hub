"use client";

import { useEffect, useRef, useState } from "react";
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

const emptyForm: IngredientInput = {
  name: "",
  unit: "kg",
  stock: 0,
  min_stock: 0,
  cost_per_unit: 0,
};

export default function InventoryPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canManage = can(activeMembership, "manage_inventory");
  const canView = canManage || can(activeMembership, "view_inventory");

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<IngredientInput>(emptyForm);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const saveOnceRef = useRef(createSingleFlight());
  const deleteOnceRef = useRef(createSingleFlight());
  const adjustOnceRef = useRef(createSingleFlight());

  const copy = language === "th"
    ? {
        title: "คลังวัตถุดิบ",
        eyebrow: "Inventory",
        searchPlaceholder: "ค้นหาวัตถุดิบ...",
        add: "เพิ่มวัตถุดิบ",
        edit: "แก้ไข",
        delete: "ลบ",
        adjust: "ปรับสต็อก",
        history: "ประวัติ",
        name: "ชื่อวัตถุดิบ",
        unit: "หน่วย",
        stock: "สต็อกปัจจุบัน",
        minStock: "สต็อกขั้นต่ำ",
        costPerUnit: "ราคาต่อหน่วย",
        save: "บันทึก",
        cancel: "ยกเลิก",
        confirmDelete: "ยืนยันการลบ",
        deleteMsg: (n: string) => `คุณแน่ใจว่าจะลบ "${n}" ออกจากคลังวัตถุดิบ?`,
        adjustTitle: "ปรับสต็อก",
        adjustIn: "รับเข้า",
        adjustOut: "จ่ายออก",
        adjustSet: "ตั้งค่าใหม่",
        quantity: "จำนวน",
        note: "หมายเหตุ",
        txTitle: "ประวัติการเคลื่อนไหว",
        lowStock: "สต็อกต่ำ",
        noIngredients: "ยังไม่มีวัตถุดิบ กด 'เพิ่มวัตถุดิบ' เพื่อเริ่มต้น",
        permissionDenied: "ไม่มีสิทธิ์เข้าถึงคลังวัตถุดิบ",
      }
    : {
        title: "Inventory",
        eyebrow: "Inventory",
        searchPlaceholder: "Search ingredients...",
        add: "Add ingredient",
        edit: "Edit",
        delete: "Delete",
        adjust: "Adjust stock",
        history: "History",
        name: "Name",
        unit: "Unit",
        stock: "Current stock",
        minStock: "Min stock",
        costPerUnit: "Cost per unit",
        save: "Save",
        cancel: "Cancel",
        confirmDelete: "Confirm delete",
        deleteMsg: (n: string) => `Are you sure you want to delete "${n}"?`,
        adjustTitle: "Adjust stock",
        adjustIn: "Stock in",
        adjustOut: "Stock out",
        adjustSet: "Set value",
        quantity: "Quantity",
        note: "Note",
        txTitle: "Transaction history",
        lowStock: "Low stock",
        noIngredients: "No ingredients yet. Click 'Add ingredient' to get started.",
        permissionDenied: "You don't have permission to view inventory.",
      };

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    listIngredients()
      .then((res) => setIngredients(res.data.ingredients ?? []))
      .finally(() => setLoading(false));
  }, [canView]);

  const filtered = ingredients.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = ingredients.filter((i) => i.min_stock > 0 && i.stock <= i.min_stock).length;

  function openCreate() {
    setEditingItem(null);
    setForm(emptyForm);
    setFormError("");
    setDrawerOpen(true);
  }

  function openEdit(item: Ingredient) {
    setEditingItem(item);
    setForm({
      name: item.name,
      unit: item.unit,
      stock: item.stock,
      min_stock: item.min_stock,
      cost_per_unit: item.cost_per_unit,
    });
    setFormError("");
    setDrawerOpen(true);
  }

  async function handleSave() {
    setFormError("");
    if (!form.name.trim()) {
      setFormError(language === "th" ? "กรุณาระบุชื่อวัตถุดิบ" : "Name is required");
      return;
    }
    await saveOnceRef.current(async () => {
      setSubmitting(true);
      try {
        if (editingItem) {
          const res = await updateIngredient(editingItem.ID, form);
          setIngredients((prev) => prev.map((i) => (i.ID === editingItem.ID ? res.data : i)));
        } else {
          const res = await createIngredient(form);
          setIngredients((prev) => [...prev, res.data]);
        }
        setDrawerOpen(false);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } } };
        setFormError(err?.response?.data?.error ?? (language === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
      } finally {
        setSubmitting(false);
      }
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteOnceRef.current(async () => {
      try {
        await deleteIngredient(deleteTarget.ID);
        setIngredients((prev) => prev.filter((i) => i.ID !== deleteTarget.ID));
      } finally {
        setDeleteTarget(null);
      }
    });
  }

  function openAdjust(item: Ingredient) {
    setAdjustTarget(item);
    setAdjustType("in");
    setAdjustQty("");
    setAdjustNote("");
    setAdjustError("");
  }

  async function handleAdjust() {
    if (!adjustTarget) return;
    const qty = parseFloat(adjustQty);
    if (!adjustQty || isNaN(qty) || qty <= 0) {
      setAdjustError(language === "th" ? "กรุณาระบุจำนวนที่ถูกต้อง" : "Enter a valid quantity");
      return;
    }
    await adjustOnceRef.current(async () => {
      setAdjusting(true);
      try {
        const res = await adjustStock(adjustTarget.ID, { type: adjustType, quantity: qty, note: adjustNote });
        setIngredients((prev) => prev.map((i) => (i.ID === adjustTarget.ID ? res.data : i)));
        setAdjustTarget(null);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } } };
        setAdjustError(err?.response?.data?.error ?? (language === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
      } finally {
        setAdjusting(false);
      }
    });
  }

  async function openTransactions(item: Ingredient) {
    setTxTarget(item);
    setTransactions([]);
    setTxLoading(true);
    try {
      const res = await listTransactions(item.ID);
      setTransactions(res.data.transactions ?? []);
    } finally {
      setTxLoading(false);
    }
  }

  if (loading) return <div className="p-6"><RestaurantCardSkeleton /></div>;

  if (!canView) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400 dark:text-gray-600">
        {copy.permissionDenied}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">{copy.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{copy.title}</h1>
        {lowStockCount > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {language === "th" ? `${lowStockCount} รายการสต็อกต่ำ` : `${lowStockCount} low stock items`}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder={copy.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white sm:max-w-xs"
        />
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {copy.add}
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-600">
          {copy.noIngredients}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-500 dark:text-gray-400">{copy.name}</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500 dark:text-gray-400">{copy.stock}</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500 dark:text-gray-400">{copy.minStock}</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500 dark:text-gray-400">{copy.costPerUnit}</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500 dark:text-gray-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-950">
              {filtered.map((item) => {
                const isLow = item.min_stock > 0 && item.stock <= item.min_stock;
                return (
                  <tr key={item.ID} className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                        {isLow && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            {copy.lowStock}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${isLow ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                      {item.stock.toLocaleString()} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {item.min_stock.toLocaleString()} <span className="text-xs text-gray-400">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {item.cost_per_unit > 0 ? `฿${item.cost_per_unit.toLocaleString()}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => openTransactions(item)}
                          title={copy.history}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openAdjust(item)}
                              title={copy.adjust}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20 dark:hover:text-orange-400"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <button
                              onClick={() => openEdit(item)}
                              title={copy.edit}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-white"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button
                              onClick={() => setDeleteTarget(item)}
                              title={copy.delete}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
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
        </div>
      )}

      {/* Create / Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-950">
            <h2 className="mb-5 text-base font-bold text-gray-900 dark:text-white">
              {editingItem ? copy.edit : copy.add}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.name}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.unit}</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              {!editingItem && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.stock}</label>
                  <input
                    type="number"
                    min={0}
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.minStock}</label>
                  <input
                    type="number"
                    min={0}
                    value={form.min_stock}
                    onChange={(e) => setForm((f) => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.costPerUnit} (฿)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.cost_per_unit}
                    onChange={(e) => setForm((f) => ({ ...f, cost_per_unit: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                {copy.cancel}
              </button>
              <button onClick={handleSave} disabled={submitting} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {submitting ? "..." : copy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-950">
            <h2 className="mb-2 text-base font-bold text-gray-900 dark:text-white">{copy.confirmDelete}</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{copy.deleteMsg(deleteTarget.name)}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">{copy.cancel}</button>
              <button onClick={handleDelete} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">{copy.delete}</button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-950">
            <h2 className="mb-1 text-base font-bold text-gray-900 dark:text-white">{copy.adjustTitle}</h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              {adjustTarget.name} — {language === "th" ? "คงเหลือ" : "current"}: <span className="font-semibold text-gray-900 dark:text-white">{adjustTarget.stock} {adjustTarget.unit}</span>
            </p>
            <div className="mb-3 flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(["in", "out", "adjust"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAdjustType(t)}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${adjustType === t ? "bg-orange-500 text-white" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-400"}`}
                >
                  {t === "in" ? copy.adjustIn : t === "out" ? copy.adjustOut : copy.adjustSet}
                </button>
              ))}
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.quantity} ({adjustTarget.unit})</label>
              <input
                type="number"
                min={0}
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">{copy.note}</label>
              <input
                type="text"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
            {adjustError && <p className="mb-3 text-xs text-red-500">{adjustError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdjustTarget(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">{copy.cancel}</button>
              <button onClick={handleAdjust} disabled={adjusting} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {adjusting ? "..." : copy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Modal */}
      {txTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-950">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">{copy.txTitle}</h2>
                <p className="text-xs text-gray-500">{txTarget.name}</p>
              </div>
              <button onClick={() => setTxTarget(null)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {txLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">Loading...</div>
            ) : transactions.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                {language === "th" ? "ยังไม่มีประวัติ" : "No transactions yet"}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {transactions.map((tx) => (
                  <div key={tx.ID} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        tx.type === "in" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : tx.type === "out" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}>
                        {tx.type === "in" ? copy.adjustIn : tx.type === "out" ? copy.adjustOut : copy.adjustSet}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{tx.note || "-"}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                        {tx.type === "in" ? "+" : tx.type === "out" ? "-" : ""}{tx.quantity} {txTarget.unit}
                      </p>
                      <p className="text-[10px] text-gray-400">{tx.CreatedAt ? new Date(tx.CreatedAt).toLocaleString() : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
