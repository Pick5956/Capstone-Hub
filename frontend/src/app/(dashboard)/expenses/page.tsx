"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { formatCurrency } from "@/src/lib/format";
import { toDashboardDate } from "@/src/lib/homeDashboard";
import { createRequestGeneration } from "@/src/lib/requestGeneration";
import {
  createExpense,
  deleteExpense,
  expenseCategories,
  listExpenses,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseCategoryTotal,
} from "@/src/lib/expense";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import OperationalPageShell from "@/src/components/shared/OperationalPageShell";
import { Skeleton } from "@/src/components/shared/Skeleton";
import ThemedSelect from "@/src/components/shared/ThemedSelect";

type FormState = { restaurantId: number | null; id: number | null; category: ExpenseCategory; amount: string; spent_at: string; note: string };
type ExpensePageData = {
  restaurantId: number | null;
  expenses: Expense[];
  categories: ExpenseCategoryTotal[];
  total: number;
  entries: number;
  hasMore: boolean;
};

const EMPTY_EXPENSE_DATA: ExpensePageData = {
  restaurantId: null,
  expenses: [],
  categories: [],
  total: 0,
  entries: 0,
  hasMore: false,
};

const categoryBadgeClass: Record<ExpenseCategory, string> = {
  ingredient: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300",
  labor: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-300",
  rent: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300",
  utilities: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-900/20 dark:text-violet-300",
  equipment: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300",
  other: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

function emptyForm(restaurantId: number | null): FormState {
  return { restaurantId, id: null, category: "ingredient", amount: "", spent_at: toDashboardDate(new Date()), note: "" };
}

export default function ExpensesPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const restaurantId = activeMembership?.restaurant_id ?? null;
  const canEdit = can(activeMembership, "manage_expenses");
  const canView = canEdit || can(activeMembership, "view_reports");

  const [data, setData] = useState<ExpensePageData>(EMPTY_EXPENSE_DATA);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [categoryFilter, setCategoryFilter] = useState<"all" | ExpenseCategory>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storedForm, setForm] = useState<FormState>(() => emptyForm(restaurantId));
  const form = storedForm.restaurantId === restaurantId ? storedForm : emptyForm(restaurantId);
  const [savingRestaurantId, setSavingRestaurantId] = useState<number | null>(null);
  const saving = restaurantId !== null && savingRestaurantId === restaurantId;
  const [refreshTick, setRefreshTick] = useState(0);
  const [expenseRequests] = useState(createRequestGeneration);

  const copy = useMemo(
    () =>
      language === "th"
        ? {
            eyebrow: "Expenses",
            back: "กลับหน้าแดชบอร์ด",
            title: "บันทึกรายจ่าย",
            subtitle: "เงินที่จ่ายออกจริง — คนละตัวกับต้นทุนอาหารที่ขายไปแล้วในหน้าสรุปยอดขาย",
            denied: "ไม่มีสิทธิ์ดูรายจ่าย",
            categories: { ingredient: "วัตถุดิบ", labor: "ค่าแรง", rent: "ค่าเช่า", utilities: "ค่าน้ำ/ไฟ", equipment: "อุปกรณ์", other: "อื่นๆ" } as Record<ExpenseCategory, string>,
            all: "ทั้งหมด",
            previousMonth: "เดือนก่อน",
            nextMonth: "เดือนถัดไป",
            monthTotal: "รวมทั้งเดือน",
            entries: "รายการ",
            add: "เพิ่มรายจ่าย",
            edit: "แก้ไขรายจ่าย",
            category: "ประเภท",
            amount: "จำนวนเงิน",
            date: "วันที่จ่าย",
            note: "รายละเอียด",
            notePlaceholder: "เช่น ค่าหมู ร้านเจ๊แดง",
            save: "บันทึก",
            cancel: "ยกเลิก",
            deleteAction: "ลบ",
            confirmDelete: "ลบรายการนี้?",
            recordedBy: "บันทึกโดย",
            generatedStockIn: "สร้างอัตโนมัติจากการรับวัตถุดิบ",
            partialList: (shown: number, total: number) => `แสดงรายการล่าสุด ${shown} จากทั้งหมด ${total} รายการ`,
            empty: "ยังไม่มีรายจ่ายในเดือนนี้",
            loadError: "โหลดรายจ่ายไม่สำเร็จ",
            saveError: "บันทึกไม่สำเร็จ",
            amountRequired: "กรอกจำนวนเงินให้มากกว่า 0",
            readOnly: "คุณดูได้อย่างเดียว ไม่มีสิทธิ์แก้ไขรายจ่าย",
          }
        : {
            eyebrow: "Expenses",
            back: "Back to dashboard",
            title: "Expense ledger",
            subtitle: "Cash that actually left the restaurant — not the same as the food cost shown on the sales card.",
            denied: "You do not have permission to view expenses.",
            categories: { ingredient: "Supplies", labor: "Wages", rent: "Rent", utilities: "Utilities", equipment: "Equipment", other: "Other" } as Record<ExpenseCategory, string>,
            all: "All",
            previousMonth: "Previous month",
            nextMonth: "Next month",
            monthTotal: "Month total",
            entries: "entries",
            add: "Add expense",
            edit: "Edit expense",
            category: "Category",
            amount: "Amount",
            date: "Date paid",
            note: "Details",
            notePlaceholder: "e.g. pork from the market",
            save: "Save",
            cancel: "Cancel",
            deleteAction: "Delete",
            confirmDelete: "Delete this entry?",
            recordedBy: "Recorded by",
            generatedStockIn: "Generated from stock-in",
            partialList: (shown: number, total: number) => `Showing the latest ${shown} of ${total} entries.`,
            empty: "No expenses recorded this month.",
            loadError: "Could not load expenses.",
            saveError: "Could not save.",
            amountRequired: "Enter an amount greater than 0.",
            readOnly: "You have read-only access to expenses.",
          },
    [language],
  );
  const categoryOptions = useMemo(
    () => expenseCategories.map((value) => ({ value, label: copy.categories[value] })),
    [copy],
  );

  const locale = language === "th" ? "th-TH" : "en-US";
  const monthStart = toDashboardDate(monthDate);
  const monthEnd = toDashboardDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
  const monthLabel = monthDate.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const canGoNextMonth = monthDate.getTime() < new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const scopedData = canView && data.restaurantId === restaurantId ? data : EMPTY_EXPENSE_DATA;

  const load = useCallback(async () => {
    const requestedRestaurantId = restaurantId;
    if (!canView || requestedRestaurantId === null) {
      expenseRequests.invalidate();
      setData(EMPTY_EXPENSE_DATA);
      setLoading(false);
      return;
    }
    const requestGeneration = expenseRequests.begin();
    setLoading(true);
    setError("");
    try {
      const res = await listExpenses({
        from: monthStart,
        until: monthEnd,
        ...(categoryFilter === "all" ? {} : { category: categoryFilter }),
      });
      if (!expenseRequests.isCurrent(requestGeneration)) return;
      setData({
        restaurantId: requestedRestaurantId,
        expenses: res.data.expenses ?? [],
        categories: res.data.categories ?? [],
        total: res.data.total ?? 0,
        entries: res.data.entries ?? 0,
        hasMore: res.data.has_more ?? false,
      });
    } catch (err) {
      if (!expenseRequests.isCurrent(requestGeneration)) return;
      setError(apiErrorMessage(err) || copy.loadError);
    } finally {
      if (expenseRequests.isCurrent(requestGeneration)) setLoading(false);
    }
  }, [canView, categoryFilter, copy.loadError, expenseRequests, monthEnd, monthStart, restaurantId]);

  useEffect(() => {
    // Mutations advance this counter so the effect reloads with the filters from
    // the latest render instead of calling an async handler's stale load closure.
    void refreshTick;
    void load();
    return () => expenseRequests.invalidate();
  }, [expenseRequests, load, refreshTick]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const requestedRestaurantId = restaurantId;
    if (requestedRestaurantId === null) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(copy.amountRequired);
      return;
    }
    setSavingRestaurantId(requestedRestaurantId);
    setError("");
    try {
      const payload = { category: form.category, amount, spent_at: form.spent_at, note: form.note.trim() };
      if (form.id === null) await createExpense(payload);
      else await updateExpense(form.id, payload);
      setForm((current) => current.restaurantId === requestedRestaurantId ? emptyForm(requestedRestaurantId) : current);
      setRefreshTick((tick) => tick + 1);
    } catch (err) {
      setError(apiErrorMessage(err) || copy.saveError);
    } finally {
      setSavingRestaurantId((current) => current === requestedRestaurantId ? null : current);
    }
  };

  const remove = async (expense: Expense) => {
    if (!window.confirm(copy.confirmDelete)) return;
    setError("");
    try {
      await deleteExpense(expense.ID);
      setForm((current) => current.restaurantId === restaurantId && current.id === expense.ID ? emptyForm(restaurantId) : current);
      setRefreshTick((tick) => tick + 1);
    } catch (err) {
      setError(apiErrorMessage(err) || copy.saveError);
    }
  };

  if (!canView) return <PermissionDenied title={copy.denied} />;

  const shiftMonth = (delta: number) => setMonthDate((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1));
  const inputClass =
    "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:focus:border-white";

  return (
    <OperationalPageShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      actions={
        <Link href="/home" className="ui-press inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {copy.back}
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label={copy.previousMonth} className="ui-press px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900">‹</button>
          <span className="min-w-[150px] px-3 py-2 text-center text-[13px] font-semibold text-gray-800 dark:text-gray-100">{monthLabel}</span>
          <button type="button" disabled={!canGoNextMonth} onClick={() => shiftMonth(1)} aria-label={copy.nextMonth} className="ui-press px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-300 dark:hover:bg-gray-900">›</button>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{copy.monthTotal}</p>
          <p className="font-mono text-[22px] font-bold tabular-nums text-gray-950 dark:text-white">{formatCurrency(scopedData.total, language)}</p>
          <p className="text-[11px] text-gray-400">{scopedData.entries} {copy.entries}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", ...expenseCategories] as const).map((value) => {
          const total = scopedData.categories.find((item) => item.category === value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => setCategoryFilter(value)}
              className={`ui-press inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                categoryFilter === value
                  ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
              }`}
            >
              {value === "all" ? copy.all : copy.categories[value]}
              {total ? (
                <span className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${categoryFilter === value ? "bg-white/20" : "bg-gray-100 dark:bg-gray-800"}`}>
                  {formatCurrency(total.amount, language)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      {canEdit ? (
        <form onSubmit={submit} className="mb-4 rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <h2 className="mb-3 text-[14px] font-semibold text-gray-950 dark:text-white">{form.id === null ? copy.add : copy.edit}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[160px_160px_170px_minmax(0,1fr)_auto] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">{copy.category}</span>
              <ThemedSelect
                value={form.category}
                onChange={(value) => setForm({ ...form, category: value as ExpenseCategory })}
                options={categoryOptions}
                className="w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">{copy.amount}</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={`${inputClass} font-mono tabular-nums`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">{copy.date}</span>
              <input type="date" required value={form.spent_at} onChange={(event) => setForm({ ...form, spent_at: event.target.value })} className={`${inputClass} font-mono dark:[color-scheme:dark]`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">{copy.note}</span>
              <input type="text" maxLength={500} placeholder={copy.notePlaceholder} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={inputClass} />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="ui-press h-[42px] rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{copy.save}</button>
              {form.id !== null && (
                <button type="button" onClick={() => setForm(emptyForm(restaurantId))} className="ui-press h-[42px] rounded-md border border-gray-200 px-4 text-[13px] font-semibold text-gray-600 dark:border-gray-800 dark:text-gray-300">{copy.cancel}</button>
              )}
            </div>
          </div>
        </form>
      ) : (
        <p className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">{copy.readOnly}</p>
      )}

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="hidden grid-cols-[110px_130px_minmax(0,1fr)_140px_120px] gap-3 border-b border-gray-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-800 lg:grid">
          <span>{copy.date}</span>
          <span>{copy.category}</span>
          <span>{copy.note}</span>
          <span className="text-right">{copy.amount}</span>
          <span className="text-right">{copy.recordedBy}</span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)}
          </div>
        ) : scopedData.expenses.length ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-900">
            {scopedData.expenses.map((expense) => (
              <div key={expense.ID} className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-[14px] lg:grid-cols-[110px_130px_minmax(0,1fr)_140px_120px] lg:items-center">
                <span className="font-mono text-[13px] tabular-nums text-gray-500 dark:text-gray-400">
                  {new Date(expense.spent_at).toLocaleDateString(locale, { day: "2-digit", month: "short" })}
                </span>
                <span>
                  <span className={`inline-flex rounded-md border px-2 py-1 text-[12px] font-semibold ${categoryBadgeClass[expense.category]}`}>{copy.categories[expense.category]}</span>
                </span>
                <span className="min-w-0 text-gray-700 dark:text-gray-200">
                  <span className="block truncate">{expense.note || "-"}</span>
                  {expense.ingredient_transaction_id != null ? (
                    <span className="mt-0.5 block text-[11px] text-gray-400 dark:text-gray-500">{copy.generatedStockIn}</span>
                  ) : null}
                </span>
                <span className="font-mono font-semibold tabular-nums text-gray-950 dark:text-white lg:text-right">{formatCurrency(expense.amount, language)}</span>
                <span className="flex items-center justify-end gap-2 text-[12px] text-gray-400">
                  <span className="truncate">{expense.created_by ? `${expense.created_by.first_name} ${expense.created_by.last_name}`.trim() : "-"}</span>
                  {canEdit && expense.ingredient_transaction_id == null && (
                    <>
                      <button
                        type="button"
                        aria-label={`${copy.edit}: ${expense.note || copy.categories[expense.category]}`}
                        title={`${copy.edit}: ${expense.note || copy.categories[expense.category]}`}
                        onClick={() => setForm({ restaurantId, id: expense.ID, category: expense.category, amount: String(expense.amount), spent_at: expense.spent_at.slice(0, 10), note: expense.note })}
                        className="ui-press shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                      >✎</button>
                      <button
                        type="button"
                        aria-label={`${copy.deleteAction}: ${expense.note || copy.categories[expense.category]}`}
                        title={`${copy.deleteAction}: ${expense.note || copy.categories[expense.category]}`}
                        onClick={() => void remove(expense)}
                        className="ui-press shrink-0 rounded border border-red-200 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
                      >✕</button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-14 text-center text-[14px] text-gray-500 dark:text-gray-400">{copy.empty}</div>
        )}
        {!loading && scopedData.hasMore ? (
          <p className="border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-500 dark:border-gray-900 dark:text-gray-400">
            {copy.partialList(scopedData.expenses.length, scopedData.entries)}
          </p>
        ) : null}
      </div>
    </OperationalPageShell>
  );
}
