"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Boxes,
  Filter,
  History,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import {
  adjustStock,
  createIngredient,
  createIngredientCategory,
  deleteIngredient,
  listIngredientCategories,
  listIngredients,
  listTransactions,
  updateIngredient,
} from "@/src/lib/ingredient";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { Ingredient, IngredientCategory, IngredientInput, IngredientTransaction } from "@/src/types/ingredient";
import { RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { useConfirm, useToast } from "@/src/components/shared/FeedbackProvider";

const UNITS = ["kg", "g", "liter", "ml", "piece", "pack", "bottle", "box", "bag"];
const STORAGE_TYPES = ["room_temp", "chilled", "frozen", "dry"];
const emptyForm: IngredientInput = {
  name: "",
  sku: "",
  category_id: 0,
  image_url: "",
  unit: "kg",
  base_unit: "kg",
  purchase_unit_default: "kg",
  conversion_factor_default: 1,
  stock: 0,
  min_stock: 0,
  cost_per_unit: 0,
  yield_percent: 100,
  storage_type: "room_temp",
};

type StockStatus = "all" | "ok" | "low" | "out";
type ItemStatus = Exclude<StockStatus, "all">;
type Copy = ReturnType<typeof buildCopy>;

function getStatus(item: Ingredient): ItemStatus {
  if (item.stock === 0) return "out";
  if (item.min_stock > 0 && item.stock <= item.min_stock) return "low";
  return "ok";
}

function getStockPercent(item: Ingredient) {
  if (item.min_stock <= 0) return item.stock > 0 ? 100 : 0;
  if (item.stock <= 0) return 0;
  return Math.min(100, Math.round((item.stock / item.min_stock) * 100));
}

function getTargetStock(item: Ingredient) {
  return item.min_stock > 0 ? item.min_stock * 2 : Math.max(item.stock, 1);
}

function getRestockAmount(item: Ingredient) {
  return Math.max(0, getTargetStock(item) - item.stock);
}

function getInventoryValue(item: Ingredient) {
  return item.stock * item.cost_per_unit;
}

function formatNumber(value: number, language: "th" | "en") {
  return new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatCurrency(value: number, language: "th" | "en") {
  return new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | undefined, language: "th" | "en") {
  if (!value) return language === "th" ? "ยังไม่มีข้อมูล" : "No update yet";
  return new Date(value).toLocaleString(language === "th" ? "th-TH" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
        minStock: "ขั้นต่ำ",
        costPerUnit: "ราคา/หน่วย",
        save: "บันทึก",
        cancel: "ยกเลิก",
        confirmDelete: "ยืนยันการลบ",
        deleteMsg: (name: string) => `ลบ "${name}" ออกจากคลังวัตถุดิบ?`,
        adjustTitle: "ปรับสต็อก",
        adjustIn: "รับเข้า",
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
        noMinimum: "ยังไม่กำหนดขั้นต่ำ",
        totalItemsLabel: "รายการ",
        tableSummary: "รายการที่แสดง",
        loading: "กำลังโหลด...",
        current: "คงเหลือ",
        quickActions: "การจัดการเร็ว",
        sku: "SKU",
        category: "หมวดหมู่",
        stockUnit: "หน่วยสต็อก",
        baseUnit: "หน่วยฐาน",
        purchaseUnitDefault: "หน่วยซื้อหลัก",
        conversionFactorDefault: "อัตราแปลง",
        yieldPercent: "Yield %",
        storageType: "ประเภทการเก็บ",
        imageUrl: "ลิงก์รูปภาพ",
        uncategorized: "ยังไม่จัดหมวด",
        noCategories: "ยังไม่มีหมวดวัตถุดิบ",
        addCategory: "เพิ่มหมวด",
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
        minStock: "Min",
        costPerUnit: "Cost/unit",
        save: "Save",
        cancel: "Cancel",
        confirmDelete: "Confirm delete",
        deleteMsg: (name: string) => `Remove "${name}" from inventory?`,
        adjustTitle: "Adjust stock",
        adjustIn: "Stock in",
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
        noMinimum: "No minimum set",
        totalItemsLabel: "items",
        tableSummary: "Visible items",
        loading: "Loading...",
        current: "current",
        quickActions: "Quick actions",
        sku: "SKU",
        category: "Category",
        stockUnit: "Stock unit",
        baseUnit: "Base unit",
        purchaseUnitDefault: "Default purchase unit",
        conversionFactorDefault: "Conversion factor",
        yieldPercent: "Yield %",
        storageType: "Storage type",
        imageUrl: "Image URL",
        uncategorized: "Uncategorized",
        noCategories: "No ingredient categories yet",
        addCategory: "Add category",
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

function SectionCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "warm" | "danger" | "success";
}) {
  const toneClass =
    tone === "warm"
      ? "border-orange-200/80 bg-orange-50/80 dark:border-orange-900/40 dark:bg-orange-950/20"
      : tone === "danger"
        ? "border-red-200/80 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/20"
        : tone === "success"
          ? "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950";

  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <span className="text-[11px] text-slate-400">{label}</span>
      <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
    </div>
  );
}

/* Shared input style */
const inputCls =
  "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 dark:focus:ring-orange-900/30";

export default function InventoryPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const lang = language as "th" | "en";
  const canManage = can(activeMembership, "manage_inventory");
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

  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const [deleteClosing, setDeleteClosing] = useState(false);

  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustClosing, setAdjustClosing] = useState(false);
  const [adjustType, setAdjustType] = useState<"in" | "out" | "adjust">("in");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [adjusting, setAdjusting] = useState(false);

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
    if (!canView) {
      setLoading(false);
      return;
    }
    Promise.all([listIngredients(), listIngredientCategories()])
      .then(([ingredientResponse, categoryResponse]) => {
        setIngredients(ingredientResponse.data.ingredients ?? []);
        setCategories(categoryResponse.data.categories ?? []);
      })
      .finally(() => setLoading(false));
  }, [canView]);

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

  const filtered = useMemo(
    () =>
      ingredients.filter((item) => {
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (statusFilter !== "all" && getStatus(item) !== statusFilter) return false;
        return true;
      }),
    [ingredients, search, statusFilter],
  );

  const priorityItems = useMemo(
    () =>
      [...ingredients]
        .filter((item) => getStatus(item) !== "ok")
        .sort((a, b) => {
          const statusRank = { out: 0, low: 1, ok: 2 };
          const byStatus = statusRank[getStatus(a)] - statusRank[getStatus(b)];
          if (byStatus !== 0) return byStatus;
          return getStockPercent(a) - getStockPercent(b);
        })
        .slice(0, 4),
    [ingredients],
  );

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
      sku: item.sku ?? "",
      category_id: item.category_id ?? 0,
      image_url: item.image_url ?? "",
      unit: item.unit,
      base_unit: item.base_unit ?? item.unit,
      purchase_unit_default: item.purchase_unit_default ?? item.unit,
      conversion_factor_default: item.conversion_factor_default ?? 1,
      stock: item.stock,
      min_stock: item.min_stock,
      cost_per_unit: item.cost_per_unit,
      yield_percent: item.yield_percent ?? 100,
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
      closeCategoryModal();
      showToast({ title: copy.categoryCreated });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setCategoryError(err?.response?.data?.error ?? (lang === "th" ? "เกิดข้อผิดพลาด" : "An error occurred"));
    } finally {
      setCategorySubmitting(false);
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
        const response = await adjustStock(adjustTarget.ID, { type: adjustType, quantity: qty, note: adjustNote });
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
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">{copy.eyebrow}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{copy.title}</h1>
              <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-gray-800 dark:bg-gray-950 dark:text-slate-300">
                {formatNumber(totalItems, lang)} {copy.total}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{copy.subtitle}</p>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[420px] md:flex-row md:items-center">
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-950 dark:text-slate-300 dark:hover:bg-gray-900"
            >
              <Filter className="h-4 w-4" />
              {copy.filter}
            </button>
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                <Plus className="h-4 w-4" />
                {copy.add}
              </button>
            )}
          </div>
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

        <div className={`${filtersOpen ? "flex" : "hidden sm:flex"} flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950`}>
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
                helper={`${formatNumber(filtered.length, lang)} ${copy.tableSummary.toLowerCase()}`}
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
                helper={outCount > 0 ? copy.alertOut(outCount) : copy.alertLow(lowCount)}
                tone={lowCount + outCount > 0 ? "danger" : "default"}
              />
              <SectionCard
                label={copy.averageCoverage}
                value={`${formatNumber(averageCoverage, lang)}%`}
                helper={`${formatNumber(okCount, lang)} ${copy.healthyItems.toLowerCase()}`}
                tone="success"
              />
        </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-md border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-gray-800">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{copy.tableSummary}</p>
                    <h2 className="mt-0.5 text-[16px] font-semibold text-slate-900 dark:text-white">{copy.title}</h2>
                  </div>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    {formatNumber(filtered.length, lang)} {lang === "th" ? "รายการ" : "items"}
                    {ingredients.length !== filtered.length ? ` / ${formatNumber(ingredients.length, lang)}` : ""}
                  </p>
                </div>
              </div>

              <div className="p-4">
                {filtered.length === 0 ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-200 px-6 py-12 text-center dark:border-gray-800">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-gray-900 dark:text-slate-500">
                      <Boxes className="h-6 w-6" />
                    </div>
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                      {ingredients.length === 0 ? copy.noIngredients : copy.noResults}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {filtered.map((item) => {
                      const status = getStatus(item);
                      const meta = statusMeta(status, copy);
                      const percent = getStockPercent(item);
                      const value = getInventoryValue(item);
                      const refill = getRestockAmount(item);

                      return (
                        <article key={item.ID} className="flex min-h-60 flex-col rounded-md border border-slate-200 bg-white transition-colors hover:border-orange-200 hover:bg-orange-50/20 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-orange-900/50 dark:hover:bg-orange-900/10">
                          <div className="flex items-start justify-between gap-3 p-4">
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{item.name}</p>
                              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                {copy.sku} {item.sku || "-"} · {item.category?.name || categoryNameById.get(item.category_id ?? 0) || copy.uncategorized}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </div>

                          <div className="px-4">
                            <div className="flex items-end justify-between gap-3">
                              <div>
                                <p className="text-[11px] text-slate-400">{copy.current}</p>
                                <p className={`mt-1 text-2xl font-semibold tabular-nums ${meta.value}`}>
                                  {formatNumber(item.stock, lang)} <span className="text-xs font-medium text-slate-400">{item.unit}</span>
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] text-slate-400">{copy.minStock}</p>
                                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                                  {item.min_stock > 0 ? `${formatNumber(item.min_stock, lang)} ${item.unit}` : "-"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-slate-200/80 dark:bg-gray-800">
                              <div className={`h-2 rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${percent}%` }} />
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-px border-y border-slate-200 bg-slate-200 text-xs dark:border-gray-800 dark:bg-gray-800">
                            <div className="bg-white px-4 py-3 dark:bg-gray-950">
                              <p className="text-slate-400">{copy.rowValue}</p>
                              <p className="mt-1 font-semibold text-slate-900 dark:text-white">{value > 0 ? formatCurrency(value, lang) : "-"}</p>
                            </div>
                            <div className="bg-white px-4 py-3 dark:bg-gray-950">
                              <p className="text-slate-400">{copy.recommendedTopup}</p>
                              <p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatNumber(refill, lang)} {item.unit}</p>
                            </div>
                          </div>

                          <div className="mt-auto flex items-center justify-between gap-2 p-3">
                            <button
                              type="button"
                              onClick={() => openTransactions(item)}
                              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-gray-800 dark:text-slate-300 dark:hover:bg-gray-900"
                            >
                              <History className="h-4 w-4" />
                              {copy.history}
                            </button>
                            {canManage && (
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openAdjust(item)}
                                  title={copy.adjust}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-orange-200 bg-orange-50 text-orange-600 transition hover:bg-orange-100 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEdit(item)}
                                  title={copy.edit}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:border-gray-800 dark:text-slate-300 dark:hover:bg-gray-900 dark:hover:text-white"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(item)}
                                  title={copy.delete}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <aside className="rounded-md border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">{copy.priorityTitle}</p>
                  <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">{copy.prioritySubtitle}</h2>
                </div>
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-gray-900 dark:text-slate-300">
                  {formatNumber(priorityItems.length, lang)}
                </span>
              </div>

              {priorityItems.length === 0 ? (
                <div className="mt-5 rounded-md border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-gray-800">
                  {copy.noPriority}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {priorityItems.map((item) => {
                    const status = getStatus(item);
                    const meta = statusMeta(status, copy);
                    const refill = getRestockAmount(item);
                    return (
                      <div key={item.ID} className={`rounded-md border p-4 ${meta.accent}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                              <p className="truncate font-semibold text-slate-900 dark:text-white">{item.name}</p>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {copy.current} {formatNumber(item.stock, lang)} {item.unit} • {copy.target} {formatNumber(getTargetStock(item), lang)} {item.unit}
                            </p>
                          </div>
                          <span className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>

                        <div className="mt-3 h-2 rounded-full bg-slate-200/70 dark:bg-gray-800">
                          <div className={`h-2 rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${getStockPercent(item)}%` }} />
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{copy.recommendedTopup}</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {formatNumber(refill, lang)} {item.unit}
                            </p>
                          </div>
                          {canManage && (
                            <button
                              onClick={() => openAdjust(item)}
                              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {copy.adjust}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </aside>
          </div>

          <div className="hidden">
            {filtered.length === 0 ? (
              <div className="flex min-h-[340px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-gray-900 dark:text-slate-500">
                  <Boxes className="h-6 w-6" />
                </div>
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                  {ingredients.length === 0 ? copy.noIngredients : copy.noResults}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-slate-400">
                      <th className="px-5 py-4">{copy.name}</th>
                      <th className="px-5 py-4">{copy.level}</th>
                      <th className="px-5 py-4 text-right">{copy.stock}</th>
                      <th className="px-5 py-4 text-right">{copy.minStock}</th>
                      <th className="px-5 py-4 text-right">{copy.rowValue}</th>
                      <th className="px-5 py-4">{copy.updatedAt}</th>
                      <th className="px-5 py-4 text-right">{copy.quickActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {filtered.map((item) => {
                      const status = getStatus(item);
                      const meta = statusMeta(status, copy);
                      const percent = getStockPercent(item);
                      const value = getInventoryValue(item);
                      const refill = getRestockAmount(item);

                      return (
                        <tr key={item.ID} className="align-top transition hover:bg-slate-50/70 dark:hover:bg-gray-900/35">
                          <td className="px-5 py-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-gray-900 dark:text-slate-300">
                                <PackageOpen className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                                  <span className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}>
                                    {meta.label}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {copy.sku} {item.sku || "—"} • {item.category?.name || categoryNameById.get(item.category_id ?? 0) || copy.uncategorized}
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {copy.stockUnit} {item.unit} • {copy.baseUnit} {item.base_unit ?? item.unit} • {copy.costPerUnit}{" "}
                                  {item.cost_per_unit > 0 ? formatCurrency(item.cost_per_unit, lang) : "—"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="min-w-[220px]">
                              <div className="flex items-center gap-3">
                                <div className="h-2 flex-1 rounded-full bg-slate-200/80 dark:bg-gray-800">
                                  <div className={`h-2 rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${percent}%` }} />
                                </div>
                                <span className={`w-12 text-right text-xs font-bold ${meta.value}`}>{percent}%</span>
                              </div>
                              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                {item.min_stock > 0
                                  ? `${copy.recommendedTopup} ${formatNumber(refill, lang)} ${item.unit}`
                                  : copy.noMinimum}
                              </p>
                            </div>
                          </td>
                          <td className={`px-5 py-4 text-right text-base font-bold tabular-nums ${meta.value}`}>
                            {formatNumber(item.stock, lang)}
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums text-slate-500 dark:text-slate-400">
                            {item.min_stock > 0 ? formatNumber(item.min_stock, lang) : "—"}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <p className="font-semibold text-slate-900 dark:text-white">{value > 0 ? formatCurrency(value, lang) : "—"}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.coverage}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm text-slate-700 dark:text-slate-200">{formatDateTime(item.UpdatedAt ?? item.CreatedAt, lang)}</p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openTransactions(item)}
                                title={copy.history}
                                className="rounded-md border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800 dark:hover:text-white"
                              >
                                <History className="h-4 w-4" />
                              </button>
                              {canManage && (
                                <>
                                  <button
                                    onClick={() => openAdjust(item)}
                                    title={copy.adjust}
                                    className="rounded-md border border-orange-200 bg-orange-50 p-2 text-orange-600 transition hover:bg-orange-100 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => openEdit(item)}
                                    title={copy.edit}
                                    className="rounded-md border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:border-gray-700 dark:text-slate-300 dark:hover:bg-gray-800 dark:hover:text-white"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteTarget(item)}
                                    title={copy.delete}
                                    className="rounded-md border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
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
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/90 px-5 py-3 text-xs text-slate-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-slate-400">
              <span>
                {copy.tableSummary} {formatNumber(filtered.length, lang)} {lang === "th" ? "รายการ" : "items"}
              </span>
              {ingredients.length !== filtered.length && (
                <span>
                  {lang === "th" ? "จากทั้งหมด" : "of"} {formatNumber(ingredients.length, lang)}
                </span>
              )}
            </div>
          </div>
        </div>

      {modalOpen && (
        <div className={`${modalClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`} onClick={closeModal}>
          <div className={`${modalClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-md rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`} onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4 dark:border-gray-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editingItem ? copy.edit : copy.add}</h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.sku}</label>
                  <input
                    type="text"
                    value={form.sku ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                        {copy.addCategory}
                      </button>
                    )}
                  </div>
                  <ThemedSelect
                    value={String(form.category_id ?? 0)}
                    onChange={(value) => setForm((current) => ({ ...current, category_id: parseInt(value, 10) || 0 }))}
                    options={categoryOptions}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.imageUrl}</label>
                  <input
                    type="text"
                    value={form.image_url ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, image_url: event.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.stockUnit}</label>
                  <ThemedSelect
                    value={form.unit}
                    onChange={(value) =>
                      setForm((current) => {
                        const nextUnit = value;
                        const nextBaseUnit = current.base_unit ? current.base_unit : nextUnit;
                        const nextPurchaseUnit = current.purchase_unit_default ? current.purchase_unit_default : nextUnit;
                        return {
                          ...current,
                          unit: nextUnit,
                          base_unit: nextBaseUnit,
                          purchase_unit_default: nextPurchaseUnit,
                        };
                      })
                    }
                    options={unitOptions}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.baseUnit}</label>
                  <ThemedSelect
                    value={form.base_unit ?? form.unit}
                    onChange={(value) => setForm((current) => ({ ...current, base_unit: value }))}
                    options={unitOptions}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.purchaseUnitDefault}</label>
                  <ThemedSelect
                    value={form.purchase_unit_default ?? form.unit}
                    onChange={(value) => setForm((current) => ({ ...current, purchase_unit_default: value }))}
                    options={unitOptions}
                  />
                </div>
                {!editingItem && (
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
                )}
                {editingItem && <div />}
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {copy.conversionFactorDefault}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.conversion_factor_default ?? 1}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        conversion_factor_default: parseFloat(event.target.value) || 1,
                      }))
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {copy.yieldPercent}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.yield_percent ?? 100}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, yield_percent: parseFloat(event.target.value) || 100 }))
                    }
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.storageType}</label>
                <ThemedSelect
                  value={form.storage_type ?? "room_temp"}
                  onChange={(value) => setForm((current) => ({ ...current, storage_type: value }))}
                  options={storageOptions}
                />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-gray-800">
              <button
                onClick={closeModal}
                className="rounded-md px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-gray-800"
              >
                {copy.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={submitting}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {submitting ? "..." : copy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryModalOpen && (
        <div className={`${categoryModalClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-[60] flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`} onClick={closeCategoryModal}>
          <div className={`${categoryModalClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`} onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4 dark:border-gray-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{copy.addCategory}</h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.categoryName}</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  className={inputCls}
                  autoFocus
                />
              </div>
              {categoryError && <p className="text-xs text-red-500">{categoryError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-gray-800">
              <button
                type="button"
                onClick={closeCategoryModal}
                className="rounded-md px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-gray-800"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={categorySubmitting}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {categorySubmitting ? "..." : copy.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={`${deleteClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`} onClick={closeDeleteModal}>
          <div className={`${deleteClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`} onClick={(event) => event.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <Trash2 className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">{copy.confirmDelete}</h2>
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
        <div className={`${adjustClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`} onClick={closeAdjustModal}>
          <div className={`${adjustClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`} onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-4 dark:border-gray-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{copy.adjustTitle}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {adjustTarget.name} • {copy.current} {formatNumber(adjustTarget.stock, lang)} {adjustTarget.unit}
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-3 gap-2">
                {(["in", "out", "adjust"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setAdjustType(type)}
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
                  <div className="flex items-center gap-2 text-sm font-bold">
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
        <div className={`${txClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex justify-end bg-gray-950/45 backdrop-blur-sm`} onClick={closeTxDrawer}>
          <div
            className={`${txClosing ? "motion-drawer-exit" : "motion-drawer"} flex h-full w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{copy.txTitle}</h2>
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
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
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
                                className={`text-sm font-bold tabular-nums ${
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
