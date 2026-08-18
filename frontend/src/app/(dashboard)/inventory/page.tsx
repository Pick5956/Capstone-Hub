"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { formatAdaptiveNumber as formatNumber, formatCurrency } from "@/src/lib/format";
import {
  adjustStock,
  createIngredient,
  createIngredientCategory,
  deleteIngredient,
  deleteIngredientCategory,
  listIngredientCategories,
  listIngredients,
  listTransactions,
  updateIngredient,
  updateIngredientCategory,
} from "@/src/lib/ingredient";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { Ingredient, IngredientCategory, IngredientInput, IngredientTransaction } from "@/src/types/ingredient";
import { RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { useConfirm, useToast } from "@/src/components/shared/FeedbackProvider";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import {
  emptyForm,
  buildAdjustStockPayload,
  getInventoryValue,
  getStatus,
  getStockPercent,
  inputCls,
  SectionCard,
  STORAGE_TYPES,
  UNITS,
  type ItemStatus,
  type StockStatus,
} from "./inventoryPageUtils";

type Copy = ReturnType<typeof buildCopy>;

function statusMeta(status: ItemStatus, copy: Copy) {
  if (status === "out") {
    return {
      label: copy.outOfStock,
      dot: "bg-red-500",
      bar: "from-red-500 to-red-400",
      badge: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
      value: "text-red-600 dark:text-red-400",
      accent: "border-red-200/80 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30",
    };
  }
  if (status === "low") {
    return {
      label: copy.lowStock,
      dot: "bg-amber-400",
      bar: "from-amber-400 to-orange-400",
      badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
      value: "text-amber-600 dark:text-amber-400",
      accent: "border-amber-200/80 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20",
    };
  }
  return {
    label: copy.inGoodShape,
    dot: "bg-emerald-500",
    bar: "from-emerald-500 to-teal-400",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
    value: "text-slate-900 dark:text-white",
    accent: "border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950",
  };
}

function buildCopy(language: "th" | "en") {
  return language === "th"
    ? {
        title: "คลังวัตถุดิบ",
        eyebrow: "Inventory",
        subtitle: "เห็นภาพสต็อกทั้งร้านในหน้าเดียว แล้วจัดการของที่ต้องเติมได้เร็วขึ้น",
        searchPlaceholder: "ค้นหาวัตถุดิบ...",
        filter: "ตัวกรอง",
        add: "เพิ่มวัตถุดิบ",
        edit: "แก้ไข",
        delete: "ลบ",
        adjust: "ปรับสต็อก",
        history: "ประวัติ",
        name: "ชื่อวัตถุดิบ",
        unit: "หน่วย",
        stock: "สต็อก",
        level: "ระดับสต็อก",
        minStock: "แจ้งเตือนเมื่อต่ำกว่า",
        costPerUnit: "ราคา/หน่วย",
        save: "บันทึก",
        cancel: "ยกเลิก",
        confirmDelete: "ยืนยันการลบ",
        deleteMsg: (name: string) => `ลบ "${name}" ออกจากคลังวัตถุดิบ?`,
        adjustTitle: "ปรับสต็อก",
        adjustIn: "รับเข้า",
        spentAmount: "ยอดที่จ่ายจริง (ไม่บังคับ)",
        spentAmountHint: "เว้นว่างไว้ ระบบจะคิดจากต้นทุนต่อหน่วยให้",
        spentAmountFallback: (value: string) => `เว้นว่าง = บันทึกรายจ่าย ${value}`,
        adjustOut: "จ่ายออก",
        adjustSet: "ตั้งค่าใหม่",
        quantity: "จำนวน",
        note: "หมายเหตุ",
        previewAfter: "หลังบันทึก",
        txTitle: "ประวัติการเคลื่อนไหว",
        txEmpty: "ยังไม่มีประวัติ",
        lowStock: "ต่ำ",
        outOfStock: "หมด",
        inGoodShape: "พร้อมใช้",
        filterAll: "ทั้งหมด",
        filterOk: "ปกติ",
        filterLow: "ต่ำ",
        filterOut: "หมด",
        noIngredients: "ยังไม่มีวัตถุดิบในคลัง",
        noResults: "ไม่พบวัตถุดิบ",
        alertLow: (count: number) => `${count} รายการต่ำกว่าเกณฑ์`,
        alertOut: (count: number) => `${count} รายการหมดสต็อก`,
        total: "รายการทั้งหมด",
        permissionDenied: "ไม่มีสิทธิ์เข้าถึงคลังวัตถุดิบ",
        initialStock: "สต็อกเริ่มต้น",
        today: "วันนี้",
        yesterday: "เมื่อวาน",
        totalValue: "มูลค่าคงคลัง",
        healthyItems: "รายการพร้อมใช้",
        urgentItems: "ต้องรีบดู",
        averageCoverage: "ความพร้อมเฉลี่ย",
        priorityTitle: "ต้องเติมก่อน",
        prioritySubtitle: "เรียงจากความเสี่ยงสูงสุด พร้อมปุ่มปรับสต็อกทันที",
        noPriority: "ตอนนี้ไม่มีรายการที่ต้องเร่งเติม",
        target: "เป้าหมาย",
        recommendedTopup: "แนะนำเติม",
        rowValue: "มูลค่า",
        updatedAt: "อัปเดตล่าสุด",
        coverage: "ความพร้อม",
        noMinimum: "ยังไม่ตั้งแจ้งเตือน",
        totalItemsLabel: "รายการ",
        tableSummary: "รายการที่แสดง",
        perPage: "ต่อหน้า",
        loading: "กำลังโหลด...",
        current: "คงเหลือ",
        quickActions: "การจัดการเร็ว",
        sku: "SKU",
        category: "หมวดหมู่",
        stockUnit: "หน่วย",
        yieldPercent: "Yield %",
        yieldHint: "% วัตถุดิบที่ใช้ได้จริงหลังหั่น/ทำความสะอาด เช่น 80% = ซื้อ 1 กก. ใช้ได้จริง 800 กรัม ระบบใช้ค่านี้คำนวณต้นทุนต่อจานให้แม่นขึ้น",
        storageType: "ประเภทการเก็บ",
        imageUrl: "ลิงก์รูปภาพ",
        uncategorized: "ยังไม่จัดหมวด",
        noCategories: "ยังไม่มีหมวดวัตถุดิบ",
        addCategory: "เพิ่มหมวด",
        manageCategories: "จัดการหมวด",
        categoryPlaceholder: "ชื่อหมวดใหม่",
        editCategory: "แก้ไขหมวด",
        deleteCategory: "ลบหมวด",
        categoryInUse: "หมวดนี้มีวัตถุดิบใช้อยู่ ย้ายวัตถุดิบออกก่อนจึงจะลบได้",
        categoryUpdated: "แก้ไขหมวดแล้ว",
        categoryDeleted: "ลบหมวดแล้ว",
        confirmDeleteCategory: (name: string) => `ลบหมวด "${name}"?`,
        categoryName: "ชื่อหมวดหมู่",
        ingredientCreated: "เพิ่มวัตถุดิบแล้ว",
        ingredientUpdated: "อัปเดตวัตถุดิบแล้ว",
        categoryCreated: "เพิ่มหมวดวัตถุดิบแล้ว",
        ingredientDeleted: "ลบวัตถุดิบแล้ว",
        stockAdjusted: "ปรับสต็อกแล้ว",
        confirmAdjustTitle: "ยืนยันการปรับสต็อก?",
        confirmAdjustBody: "การจ่ายออกหรือตั้งค่าสต็อกใหม่จะเปลี่ยนจำนวนคงเหลือทันที",
        confirmAdjust: "ยืนยันปรับสต็อก",
        storageTypes: {
          room_temp: "อุณหภูมิห้อง",
          chilled: "แช่เย็น",
          frozen: "แช่แข็ง",
          dry: "แห้ง",
        },
      }
    : {
        title: "Inventory",
        eyebrow: "Inventory",
        subtitle: "See stock health at a glance and act on refill risks faster.",
        searchPlaceholder: "Search ingredients...",
        filter: "Filter",
        add: "Add ingredient",
        edit: "Edit",
        delete: "Delete",
        adjust: "Adjust",
        history: "History",
        name: "Name",
        unit: "Unit",
        stock: "Stock",
        level: "Level",
        minStock: "Alert below",
        costPerUnit: "Cost/unit",
        save: "Save",
        cancel: "Cancel",
        confirmDelete: "Confirm delete",
        deleteMsg: (name: string) => `Remove "${name}" from inventory?`,
        adjustTitle: "Adjust stock",
        adjustIn: "Stock in",
        spentAmount: "Actual amount paid (optional)",
        spentAmountHint: "Leave blank and the cost per unit is used instead.",
        spentAmountFallback: (value: string) => `Blank records ${value} as the expense`,
        adjustOut: "Stock out",
        adjustSet: "Set value",
        quantity: "Quantity",
        note: "Note",
        previewAfter: "After saving",
        txTitle: "Transaction history",
        txEmpty: "No transactions yet",
        lowStock: "Low",
        outOfStock: "Out",
        inGoodShape: "Healthy",
        filterAll: "All",
        filterOk: "OK",
        filterLow: "Low",
        filterOut: "Out",
        noIngredients: "No ingredients yet.",
        noResults: "No ingredients found.",
        alertLow: (count: number) => `${count} items below minimum stock`,
        alertOut: (count: number) => `${count} items out of stock`,
        total: "total items",
        permissionDenied: "You don't have permission to view inventory.",
        initialStock: "Initial stock",
        today: "Today",
        yesterday: "Yesterday",
        totalValue: "Inventory value",
        healthyItems: "Healthy items",
        urgentItems: "Need attention",
        averageCoverage: "Average coverage",
        priorityTitle: "Refill queue",
        prioritySubtitle: "Sorted by risk so the team can act quickly.",
        noPriority: "No urgent refill items right now.",
        target: "Target",
        recommendedTopup: "Suggested top-up",
        rowValue: "Value",
        updatedAt: "Updated",
        coverage: "Coverage",
        noMinimum: "No alert set",
        totalItemsLabel: "items",
        tableSummary: "Visible items",
        perPage: "per page",
        loading: "Loading...",
        current: "current",
        quickActions: "Quick actions",
        sku: "SKU",
        category: "Category",
        stockUnit: "Unit",
        yieldPercent: "Yield %",
        yieldHint: "Usable percentage after trimming or cleaning. e.g. 80% means 1 kg bought yields 800 g usable. Used to compute per-dish cost more accurately.",
        storageType: "Storage type",
        imageUrl: "Image URL",
        uncategorized: "Uncategorized",
        noCategories: "No ingredient categories yet",
        addCategory: "Add category",
        manageCategories: "Manage categories",
        categoryPlaceholder: "New category name",
        editCategory: "Edit category",
        deleteCategory: "Delete category",
        categoryInUse: "This category is in use. Move its ingredients out before deleting.",
        categoryUpdated: "Category updated",
        categoryDeleted: "Category deleted",
        confirmDeleteCategory: (name: string) => `Delete category "${name}"?`,
        categoryName: "Category name",
        ingredientCreated: "Ingredient added",
        ingredientUpdated: "Ingredient updated",
        categoryCreated: "Ingredient category added",
        ingredientDeleted: "Ingredient deleted",
        stockAdjusted: "Stock adjusted",
        confirmAdjustTitle: "Confirm stock adjustment?",
        confirmAdjustBody: "Stock-out and set-value adjustments change the current stock immediately.",
        confirmAdjust: "Confirm adjustment",
        storageTypes: {
          room_temp: "Room temp",
          chilled: "Chilled",
          frozen: "Frozen",
          dry: "Dry",
        },
      };
}

function groupTxByDate(txs: IngredientTransaction[], copy: Copy) {
  const map = new Map<string, IngredientTransaction[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const tx of txs) {
    const key = (tx.CreatedAt ? new Date(tx.CreatedAt) : new Date()).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }

  return Array.from(map.entries()).map(([key, items]) => ({
    label:
      key === today
        ? copy.today
        : key === yesterday
          ? copy.yesterday
          : new Date(key).toLocaleDateString(),
    items,
  }));
}

export default function InventoryPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const lang = language as "th" | "en";
  const canManage = can(activeMembership, "manage_inventory");
  const canManageExpenses = can(activeMembership, "manage_expenses");
  const canView = canManage || can(activeMembership, "view_inventory");
  const copy = useMemo(() => buildCopy(lang), [lang]);
  const unitOptions = useMemo(() => UNITS.map((unit) => ({ value: unit, label: unit })), []);
  const storageOptions = useMemo(
    () =>
      STORAGE_TYPES.map((type) => ({
        value: type,
        label: copy.storageTypes[type as keyof typeof copy.storageTypes],
      })),
    [copy],
  );
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StockStatus>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"" | "name" | "category" | "stock" | "price">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [form, setForm] = useState<IngredientInput>(emptyForm);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryModalClosing, setCategoryModalClosing] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const [deleteClosing, setDeleteClosing] = useState(false);

  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustClosing, setAdjustClosing] = useState(false);
  const [adjustType, setAdjustType] = useState<"in" | "out" | "adjust">("in");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustPaidAmount, setAdjustPaidAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  // Mirrors the server's fallback: an unpriced stock-in is booked at the
  // ingredient's own cost per unit.
  const referenceAdjustAmount = (() => {
    const quantity = Number(adjustQty);
    const rate = adjustTarget?.cost_per_unit ?? 0;
    if (!Number.isFinite(quantity) || quantity <= 0 || rate <= 0) return 0;
    return Math.round(rate * quantity * 100) / 100;
  })();

  const [txTarget, setTxTarget] = useState<Ingredient | null>(null);
  const [txClosing, setTxClosing] = useState(false);
  const [transactions, setTransactions] = useState<IngredientTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const saveOnce = useRef(createSingleFlight());
  const deleteOnce = useRef(createSingleFlight());
  const adjustOnce = useRef(createSingleFlight());
  const categoryOptions = useMemo(
    () => [
      { value: "0", label: categories.length === 0 ? copy.noCategories : copy.uncategorized },
      ...categories.map((category) => ({ value: String(category.ID), label: category.name })),
    ],
    [categories, copy],
  );

  useEffect(() => {
    let active = true;
    const loadTimer = window.setTimeout(() => {
      if (!canView) {
        setLoading(false);
        return;
      }
      Promise.all([listIngredients(), listIngredientCategories()])
        .then(([ingredientResponse, categoryResponse]) => {
          if (!active) return;
          setIngredients(ingredientResponse.data.ingredients ?? []);
          setCategories(categoryResponse.data.categories ?? []);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(loadTimer);
    };
  }, [canView]);

  // `/inventory?adjust=<id>` — the dashboard's stock-risk cards link straight
  // to the adjustment for the ingredient they warned about. Read off the URL
  // rather than `useSearchParams`, which would drag a Suspense boundary in
  // with it, and fired once so closing the dialog does not reopen it when the
  // list refreshes.
  const adjustDeepLinkDone = useRef(false);
  useEffect(() => {
    if (adjustDeepLinkDone.current || !ingredients.length) return;
    const wanted = new URLSearchParams(window.location.search).get("adjust");
    const item = wanted ? ingredients.find((entry) => String(entry.ID) === wanted) : undefined;
    if (!item) return;
    adjustDeepLinkDone.current = true;
    openAdjust(item);
  }, [ingredients]);

  const totalItems = ingredients.length;
  const lowCount = ingredients.filter((item) => getStatus(item) === "low").length;
  const outCount = ingredients.filter((item) => getStatus(item) === "out").length;
  const okCount = ingredients.filter((item) => getStatus(item) === "ok").length;
  const totalValue = ingredients.reduce((sum, item) => sum + getInventoryValue(item), 0);
  const averageCoverage = ingredients.length
    ? Math.round(ingredients.reduce((sum, item) => sum + getStockPercent(item), 0) / ingredients.length)
    : 0;
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.ID, category.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const statusRank = { out: 0, low: 1, ok: 2 } as const;
    const catName = (item: Ingredient) =>
      item.category?.name || categoryNameById.get(item.category_id ?? 0) || copy.uncategorized;
    return ingredients
      .filter((item) => {
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (statusFilter !== "all" && getStatus(item) !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        // No column picked → default attention order: out → low → ok, then name.
        if (sortKey === "") {
          const byStatus = statusRank[getStatus(a)] - statusRank[getStatus(b)];
          return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name);
        }
        let cmp = 0;
        if (sortKey === "name") cmp = a.name.localeCompare(b.name);
        else if (sortKey === "category") cmp = catName(a).localeCompare(catName(b));
        else if (sortKey === "stock") cmp = a.stock - b.stock;
        else if (sortKey === "price") cmp = a.cost_per_unit - b.cost_per_unit;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [ingredients, search, statusFilter, sortKey, sortDir, categoryNameById, copy]);

  // Client-side paging of the already-loaded list — instant, no server round-trips.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(pageStart, pageStart + pageSize);

  // Back to the first page whenever the result set or page size changes.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  // If deletions shrink the list past the current page, clamp back into range.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Clicking a header sorts by it; clicking the active one flips direction.
  function toggleSort(key: "name" | "category" | "stock" | "price") {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortableTh = (key: "name" | "category" | "stock" | "price", label: string, alignRight = false) => {
    const active = sortKey === key;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-2.5 ${alignRight ? "text-right" : ""}`}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-1 transition hover:text-slate-700 dark:hover:text-slate-200 ${active ? "text-slate-600 dark:text-slate-200" : ""}`}
        >
          <span>{label}</span>
          <Icon className={`h-3 w-3 ${active ? "" : "opacity-30"}`} />
        </button>
      </th>
    );
  };

  const adjustPreview = useMemo(() => {
    if (!adjustTarget || !adjustQty) return null;
    const qty = parseFloat(adjustQty);
    if (Number.isNaN(qty) || qty <= 0) return null;
    if (adjustType === "in") return adjustTarget.stock + qty;
    if (adjustType === "out") return Math.max(0, adjustTarget.stock - qty);
    return qty;
  }, [adjustTarget, adjustQty, adjustType]);

  function openCreate() {
    setModalClosing(false);
    setEditingItem(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(item: Ingredient) {
    setModalClosing(false);
    setEditingItem(item);
    setForm({
      name: item.name,
      category_id: item.category_id ?? 0,
      unit: item.unit,
      stock: item.stock,
      min_stock: item.min_stock,
      cost_per_unit: item.cost_per_unit,
      storage_type: item.storage_type ?? "room_temp",
    });
    setFormError("");
    setModalOpen(true);
  }

  async function handleSave() {
    setFormError("");
    if (!form.name.trim()) {
      setFormError(lang === "th" ? "กรุณาระบุชื่อวัตถุดิบ" : "Name is required");
      return;
    }

    await saveOnce.current(async () => {
      setSubmitting(true);
      try {
        if (editingItem) {
          const response = await updateIngredient(editingItem.ID, form);
          setIngredients((prev) => prev.map((item) => (item.ID === editingItem.ID ? response.data : item)));
          showToast({ title: copy.ingredientUpdated });
        } else {
          const response = await createIngredient(form);
          setIngredients((prev) => [...prev, response.data]);
          showToast({ title: copy.ingredientCreated });
        }
        closeModal();
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        setFormError(err?.response?.data?.error ?? (lang === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
      } finally {
        setSubmitting(false);
      }
    });
  }

  async function handleCreateCategory() {
    const name = categoryName.trim();
    if (!name) {
      setCategoryError(lang === "th" ? "กรุณาระบุชื่อหมวดหมู่" : "Category name is required");
      return;
    }

    setCategoryError("");
    setCategorySubmitting(true);
    try {
      const response = await createIngredientCategory({ name, is_active: true });
      setCategories((prev) => [...prev, response.data].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)));
      setForm((current) => ({ ...current, category_id: response.data.ID }));
      setCategoryName("");
      showToast({ title: copy.categoryCreated });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setCategoryError(err?.response?.data?.error ?? (lang === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function handleUpdateCategory(id: number) {
    const name = editingCategoryName.trim();
    if (!name) {
      setCategoryError(lang === "th" ? "กรุณาระบุชื่อหมวดหมู่" : "Category name is required");
      return;
    }
    setCategoryError("");
    setCategorySubmitting(true);
    try {
      const response = await updateIngredientCategory(id, { name });
      setCategories((prev) =>
        prev
          .map((cat) => (cat.ID === id ? response.data : cat))
          .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
      );
      setEditingCategoryId(null);
      setEditingCategoryName("");
      showToast({ title: copy.categoryUpdated });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setCategoryError(err?.response?.data?.error ?? (lang === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function handleDeleteCategory(category: IngredientCategory) {
    const confirmed = await confirm({
      title: copy.confirmDeleteCategory(category.name),
      confirmLabel: copy.deleteCategory,
      cancelLabel: copy.cancel,
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteIngredientCategory(category.ID);
      setCategories((prev) => prev.filter((cat) => cat.ID !== category.ID));
      setForm((current) => (current.category_id === category.ID ? { ...current, category_id: 0 } : current));
      if (editingCategoryId === category.ID) setEditingCategoryId(null);
      showToast({ title: copy.categoryDeleted });
    } catch {
      // The backend blocks deletion while ingredients still use the category.
      showToast({ title: copy.categoryInUse, tone: "error" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteOnce.current(async () => {
      try {
        await deleteIngredient(deleteTarget.ID);
        setIngredients((prev) => prev.filter((item) => item.ID !== deleteTarget.ID));
        showToast({ title: copy.ingredientDeleted });
      } finally {
        closeDeleteModal();
      }
    });
  }

  function openAdjust(item: Ingredient) {
    setAdjustClosing(false);
    setAdjustTarget(item);
    setAdjustType("in");
    setAdjustQty("");
    setAdjustPaidAmount("");
    setAdjustNote("");
    setAdjustError("");
  }

  async function handleAdjust() {
    if (!adjustTarget) return;
    const qty = parseFloat(adjustQty);
    if (!adjustQty || Number.isNaN(qty) || qty <= 0) {
      setAdjustError(lang === "th" ? "กรุณาระบุจำนวนที่ถูกต้อง" : "Enter a valid quantity");
      return;
    }
    const paidAmount = Number(adjustPaidAmount);
    if (
      adjustType === "in" &&
      canManageExpenses &&
      adjustPaidAmount.trim() !== "" &&
      (!Number.isFinite(paidAmount) || paidAmount < 0)
    ) {
      setAdjustError(lang === "th" ? "กรุณาระบุยอดที่จ่ายให้ถูกต้อง" : "Enter a valid amount paid");
      return;
    }
    if (adjustType !== "in") {
      const confirmed = await confirm({
        title: copy.confirmAdjustTitle,
        message: copy.confirmAdjustBody,
        confirmLabel: copy.confirmAdjust,
        cancelLabel: copy.cancel,
        tone: "warning",
      });
      if (!confirmed) return;
    }

    await adjustOnce.current(async () => {
      setAdjusting(true);
      try {
        const response = await adjustStock(adjustTarget.ID, buildAdjustStockPayload({
          type: adjustType,
          quantity: qty,
          note: adjustNote,
          paidAmount: adjustPaidAmount,
          canManageExpenses,
        }));
        setIngredients((prev) => prev.map((item) => (item.ID === adjustTarget.ID ? response.data : item)));
        closeAdjustModal();
        showToast({ title: copy.stockAdjusted });
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        setAdjustError(err?.response?.data?.error ?? (lang === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
      } finally {
        setAdjusting(false);
      }
    });
  }

  async function openTransactions(item: Ingredient) {
    setTxClosing(false);
    setTxTarget(item);
    setTransactions([]);
    setTxLoading(true);
    try {
      const response = await listTransactions(item.ID);
      setTransactions(response.data.transactions ?? []);
    } finally {
      setTxLoading(false);
    }
  }

  function closeModal() {
    if (modalClosing) return;
    setModalClosing(true);
    window.setTimeout(() => {
      setModalOpen(false);
      setModalClosing(false);
    }, 180);
  }

  function closeCategoryModal() {
    if (categoryModalClosing) return;
    setCategoryModalClosing(true);
    window.setTimeout(() => {
      setCategoryModalOpen(false);
      setCategoryModalClosing(false);
    }, 180);
  }

  function closeDeleteModal() {
    if (deleteClosing) return;
    setDeleteClosing(true);
    window.setTimeout(() => {
      setDeleteTarget(null);
      setDeleteClosing(false);
    }, 180);
  }

  function closeAdjustModal() {
    if (adjustClosing) return;
    setAdjustClosing(true);
    window.setTimeout(() => {
      setAdjustTarget(null);
      setAdjustClosing(false);
    }, 180);
  }

  function closeTxDrawer() {
    if (txClosing) return;
    setTxClosing(true);
    window.setTimeout(() => {
      setTxTarget(null);
      setTxClosing(false);
    }, 180);
  }
  const modalBackdrop = useBackdropClose(closeModal);
  const categoryBackdrop = useBackdropClose(closeCategoryModal);
  const deleteBackdrop = useBackdropClose(closeDeleteModal);
  const adjustBackdrop = useBackdropClose(closeAdjustModal);
  const txBackdrop = useBackdropClose(closeTxDrawer);

  if (loading) {
    return (
      <div className="p-6">
        <RestaurantCardSkeleton />
      </div>
    );
  }

  if (!canView) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">{copy.permissionDenied}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-gray-950 dark:text-white sm:px-6 lg:px-8 lg:py-6">
      <div className="space-y-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={copy.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${inputCls} pl-10 pr-3`}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-950 dark:text-slate-300 dark:hover:bg-gray-900"
          >
            <Filter className="h-4 w-4" />
            {copy.filter}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              <Plus className="h-4 w-4" />
              {copy.add}
            </button>
          )}
        </header>

        {(outCount > 0 || lowCount > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {outCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("out")}
                className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
              >
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {copy.alertOut(outCount)}
              </button>
            )}
            {lowCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("low")}
                className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                {copy.alertLow(lowCount)}
              </button>
            )}
          </div>
        )}

        <div className={`${filtersOpen ? "flex" : "hidden"} flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950`}>
            {(["all", "ok", "low", "out"] as StockStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  statusFilter === status
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {status === "all"
                  ? copy.filterAll
                  : status === "ok"
                    ? copy.filterOk
                    : status === "low"
                      ? copy.filterLow
                      : copy.filterOut}
              </button>
            ))}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SectionCard
                label={copy.total}
                value={formatNumber(totalItems, lang)}
              />
              <SectionCard
                label={copy.totalValue}
                value={formatCurrency(totalValue, lang)}
                helper={`${copy.rowValue} ${formatCurrency(totalValue / Math.max(totalItems, 1), lang)} / ${copy.totalItemsLabel}`}
                tone="warm"
              />
              <SectionCard
                label={copy.urgentItems}
                value={formatNumber(lowCount + outCount, lang)}
                tone={lowCount + outCount > 0 ? "danger" : "default"}
              />
              <SectionCard
                label={copy.averageCoverage}
                value={`${formatNumber(averageCoverage, lang)}%`}
                helper={`${formatNumber(okCount, lang)} ${copy.healthyItems.toLowerCase()}`}
                tone="success"
              />
        </div>

          <div className="grid gap-4">
            <section className="rounded-md border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950">

              <div className="overflow-x-auto">
                {filtered.length === 0 ? (
                  <div className="m-2 flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-200 px-6 py-12 text-center dark:border-gray-800">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-gray-900 dark:text-slate-500">
                      <Boxes className="h-6 w-6" />
                    </div>
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                      {ingredients.length === 0 ? copy.noIngredients : copy.noResults}
                    </p>
                  </div>
                ) : (
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-gray-800 dark:text-slate-500">
                        {sortableTh("name", copy.name)}
                        {sortableTh("stock", copy.current)}
                        {sortableTh("category", copy.category)}
                        {sortableTh("price", copy.costPerUnit, true)}
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                      {pageItems.map((item) => {
                        const status = getStatus(item);
                        const meta = statusMeta(status, copy);
                        const percent = getStockPercent(item);

                        return (
                          <tr key={item.ID} className="transition-colors hover:bg-slate-50 dark:hover:bg-gray-900/40">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                                <span className="font-semibold text-slate-900 dark:text-white">{item.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="w-44">
                                <div className="flex items-center gap-2 text-[13px]">
                                  <span className={`font-semibold tabular-nums ${meta.value}`}>
                                    {formatNumber(item.stock, lang)} <span className="text-[11px] font-medium text-slate-400">{item.unit}</span>
                                  </span>
                                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.badge}`}>{meta.label}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-slate-200/80 dark:bg-gray-800">
                                  <div className={`h-1.5 rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${percent}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-gray-800 dark:text-slate-300">
                                {item.category?.name || categoryNameById.get(item.category_id ?? 0) || copy.uncategorized}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                              {item.cost_per_unit > 0 ? formatCurrency(item.cost_per_unit, lang) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openTransactions(item)}
                                  title={copy.history}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-gray-800 dark:text-slate-300 dark:hover:bg-gray-900"
                                >
                                  <History className="h-4 w-4" />
                                </button>
                                {canManage && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openAdjust(item)}
                                      title={copy.adjust}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-orange-200 bg-orange-50 text-orange-600 transition hover:bg-orange-100 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openEdit(item)}
                                      title={copy.edit}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:border-gray-800 dark:text-slate-300 dark:hover:bg-gray-900"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteTarget(item)}
                                      title={copy.delete}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
                                    >
                                      <Trash2 className="h-4 w-4" />
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
                )}
              </div>

              {filtered.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-gray-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span>{copy.perPage}</span>
                    <select
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition focus:border-orange-400 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200"
                    >
                      {[10, 25, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <span className="tabular-nums">
                      {formatNumber(pageStart + 1, lang)}–{formatNumber(Math.min(pageStart + pageSize, filtered.length), lang)} / {formatNumber(filtered.length, lang)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage(safePage - 1)}
                        disabled={safePage <= 1}
                        aria-label="previous page"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-slate-300 dark:hover:bg-gray-900"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="min-w-[3.5rem] text-center font-medium tabular-nums text-slate-600 dark:text-slate-300">
                        {formatNumber(safePage, lang)} / {formatNumber(totalPages, lang)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage(safePage + 1)}
                        disabled={safePage >= totalPages}
                        aria-label="next page"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-slate-300 dark:hover:bg-gray-900"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

      {modalOpen && (
        <>
          <button
            type="button"
            aria-label={copy.cancel}
            {...modalBackdrop}
            className={`${modalClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-40 cursor-default bg-gray-950/45 backdrop-blur-sm`}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
            className={`${modalClosing ? "motion-drawer-exit" : "motion-drawer"} fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-gray-800">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {lang === "th" ? "คลังวัตถุดิบ" : "Inventory"}
                </p>
                <h2 className="mt-0.5 text-[15px] font-semibold text-slate-900 dark:text-white">
                  {editingItem ? copy.edit : copy.add}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="h-8 w-8 rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-900 dark:hover:text-slate-200"
              >
                <X className="mx-auto h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.name}</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className={inputCls}
                      autoFocus
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.category}</label>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryError("");
                            setCategoryName("");
                            setCategoryModalClosing(false);
                            setCategoryModalOpen(true);
                          }}
                          className="text-xs font-semibold text-orange-600 transition hover:text-orange-500 dark:text-orange-300"
                        >
                          {copy.manageCategories}
                        </button>
                      )}
                    </div>
                    <ThemedSelect
                      value={String(form.category_id ?? 0)}
                      onChange={(value) => setForm((current) => ({ ...current, category_id: parseInt(value, 10) || 0 }))}
                      options={categoryOptions}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.stockUnit}</label>
                    <ThemedSelect
                      value={form.unit}
                      onChange={(value) => setForm((current) => ({ ...current, unit: value }))}
                      options={!form.unit || UNITS.includes(form.unit) ? unitOptions : [{ value: form.unit, label: form.unit }, ...unitOptions]}
                    />
                  </div>
                  {!editingItem ? (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.initialStock}</label>
                      <input
                        type="number"
                        min={0}
                        value={form.stock}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, stock: parseFloat(event.target.value) || 0 }))
                        }
                        className={inputCls}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.minStock}</label>
                    <input
                      type="number"
                      min={0}
                      value={form.min_stock}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, min_stock: parseFloat(event.target.value) || 0 }))
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {copy.costPerUnit} (THB)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.cost_per_unit}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, cost_per_unit: parseFloat(event.target.value) || 0 }))
                      }
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.storageType}</label>
                    <ThemedSelect
                      value={form.storage_type ?? "room_temp"}
                      onChange={(value) => setForm((current) => ({ ...current, storage_type: value }))}
                      options={storageOptions}
                    />
                  </div>
                </div>
                {formError && <p className="text-xs text-red-500">{formError}</p>}
              </div>
            </div>
            <div className="border-t border-slate-200 p-4 dark:border-gray-800">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-gray-800"
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {submitting ? "..." : copy.save}
                </button>
              </div>
            </div>
          </form>
        </>
      )}

      {categoryModalOpen && (
        <div {...categoryBackdrop} className={`${categoryModalClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-[60] flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}>
          <div className={`${categoryModalClosing ? "motion-dialog-exit" : "motion-dialog"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.manageCategories}</h2>
              <button
                type="button"
                onClick={closeCategoryModal}
                aria-label={copy.cancel}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[46vh] space-y-1 overflow-y-auto px-4 py-3">
              {categories.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-400">{copy.noCategories}</p>
              ) : (
                categories.map((cat) =>
                  editingCategoryId === cat.ID ? (
                    <div key={cat.ID} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingCategoryName}
                        onChange={(event) => setEditingCategoryName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleUpdateCategory(cat.ID);
                          if (event.key === "Escape") setEditingCategoryId(null);
                        }}
                        className={inputCls}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateCategory(cat.ID)}
                        disabled={categorySubmitting}
                        aria-label={copy.save}
                        className="shrink-0 rounded-md p-2 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/30"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCategoryId(null)}
                        aria-label={copy.cancel}
                        className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-gray-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={cat.ID}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-gray-900"
                    >
                      <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{cat.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryError("");
                          setEditingCategoryId(cat.ID);
                          setEditingCategoryName(cat.name);
                        }}
                        aria-label={copy.editCategory}
                        className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-gray-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat)}
                        aria-label={copy.deleteCategory}
                        className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ),
                )
              )}
            </div>

            <div className="border-t border-slate-200 px-6 py-4 dark:border-gray-800">
              <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.categoryName}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleCreateCategory();
                  }}
                  placeholder={copy.categoryPlaceholder}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={categorySubmitting}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  <Plus className="h-4 w-4" />
                  {copy.add}
                </button>
              </div>
              {categoryError && <p className="mt-2 text-xs text-red-500">{categoryError}</p>}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div {...deleteBackdrop} className={`${deleteClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}>
          <div className={`${deleteClosing ? "motion-dialog-exit" : "motion-dialog"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="px-6 py-5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <Trash2 className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">{copy.confirmDelete}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{copy.deleteMsg(deleteTarget.name)}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={closeDeleteModal}
                className="rounded-md px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-gray-800"
              >
                {copy.cancel}
              </button>
              <button
                onClick={handleDelete}
                className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                {copy.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {adjustTarget && (
        <div {...adjustBackdrop} className={`${adjustClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}>
          <div className={`${adjustClosing ? "motion-dialog-exit" : "motion-dialog"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="border-b border-slate-200 px-6 py-4 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.adjustTitle}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {adjustTarget.name} • {copy.current} {formatNumber(adjustTarget.stock, lang)} {adjustTarget.unit}
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-3 gap-2">
                {(["in", "out", "adjust"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setAdjustType(type);
                      if (type !== "in") setAdjustPaidAmount("");
                    }}
                    className={`rounded-md border py-2 text-xs font-semibold transition ${
                      adjustType === type
                        ? type === "in"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : type === "out"
                            ? "border-red-300 bg-red-50 text-red-600 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300"
                            : "border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-gray-700 dark:text-slate-300"
                    }`}
                  >
                    {type === "in" ? copy.adjustIn : type === "out" ? copy.adjustOut : copy.adjustSet}
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {copy.quantity} ({adjustTarget.unit})
                </label>
                <input
                  type="number"
                  min={0}
                  value={adjustQty}
                  onChange={(event) => setAdjustQty(event.target.value)}
                  className={inputCls}
                  autoFocus
                />
              </div>
              {adjustType === "in" && canManageExpenses && (
                <div>
                  <label htmlFor="adjust-paid-amount" className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {copy.spentAmount}
                  </label>
                  <input
                    id="adjust-paid-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={adjustPaidAmount}
                    onChange={(event) => setAdjustPaidAmount(event.target.value)}
                    className={inputCls}
                  />
                  {/* What the server will book if this field stays empty, so the
                      fallback is visible before it happens rather than after. */}
                  <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                    {adjustPaidAmount.trim() === "" && referenceAdjustAmount > 0
                      ? copy.spentAmountFallback(formatCurrency(referenceAdjustAmount, lang))
                      : copy.spentAmountHint}
                  </p>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.note}</label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(event) => setAdjustNote(event.target.value)}
                  className={inputCls}
                />
              </div>
              {adjustPreview !== null && (
                <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-3 dark:bg-gray-900">
                  <span className="text-xs text-slate-400">{copy.previewAfter}</span>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="tabular-nums text-slate-400">{formatNumber(adjustTarget.stock, lang)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                    <span
                      className={`tabular-nums ${
                        adjustPreview > adjustTarget.stock
                          ? "text-emerald-600 dark:text-emerald-400"
                          : adjustPreview < adjustTarget.stock
                            ? "text-red-500 dark:text-red-400"
                            : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {formatNumber(adjustPreview, lang)}
                    </span>
                    <span className="text-xs font-normal text-slate-400">{adjustTarget.unit}</span>
                  </div>
                </div>
              )}
              {adjustError && <p className="text-xs text-red-500">{adjustError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={closeAdjustModal}
                className="rounded-md px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-gray-800"
              >
                {copy.cancel}
              </button>
              <button
                onClick={handleAdjust}
                disabled={adjusting}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {adjusting ? "..." : copy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {txTarget && (
        <div {...txBackdrop} className={`${txClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex justify-end bg-gray-950/45 backdrop-blur-sm`}>
          <div
            className={`${txClosing ? "motion-drawer-exit" : "motion-drawer"} flex h-full w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.txTitle}</h2>
                <p className="text-xs text-slate-400">{txTarget.name}</p>
              </div>
              <button
                onClick={closeTxDrawer}
                className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {txLoading ? (
                <div className="flex h-32 items-center justify-center text-sm text-slate-400">{copy.loading}</div>
              ) : transactions.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-slate-400">{copy.txEmpty}</div>
              ) : (
                <div className="space-y-6">
                  {groupTxByDate(transactions, copy).map(({ label, items }) => (
                    <div key={label}>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
                      <div className="space-y-2">
                        {items.map((tx) => (
                          <div
                            key={tx.ID}
                            className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-950"
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                                tx.type === "in"
                                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : tx.type === "out"
                                    ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300"
                                    : "bg-slate-100 text-slate-500 dark:bg-gray-900 dark:text-slate-300"
                              }`}
                            >
                              {tx.type === "in" ? (
                                <ArrowUp className="h-4 w-4" />
                              ) : tx.type === "out" ? (
                                <ArrowDown className="h-4 w-4" />
                              ) : (
                                <ArrowRight className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {tx.type === "in" ? copy.adjustIn : tx.type === "out" ? copy.adjustOut : copy.adjustSet}
                              </p>
                              {tx.note && <p className="truncate text-xs text-slate-400">{tx.note}</p>}
                            </div>
                            <div className="shrink-0 text-right">
                              <p
                                className={`text-sm font-semibold tabular-nums ${
                                  tx.type === "in"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : tx.type === "out"
                                      ? "text-red-500 dark:text-red-400"
                                      : "text-slate-700 dark:text-slate-200"
                                }`}
                              >
                                {tx.type === "in" ? "+" : tx.type === "out" ? "-" : ""}
                                {formatNumber(tx.quantity, lang)}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {tx.CreatedAt
                                  ? new Date(tx.CreatedAt).toLocaleTimeString(lang === "th" ? "th-TH" : "en-US", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : ""}
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
