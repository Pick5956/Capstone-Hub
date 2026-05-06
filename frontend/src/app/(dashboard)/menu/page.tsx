"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { createCategory, createMenuItem, deleteCategory, deleteMenuItem, listCategories, listMenuItems, updateCategory, updateMenuItem, uploadMenuImage } from "@/src/lib/menu";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { Category, MenuItem, MenuItemInput } from "@/src/types/menu";
import { RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import ThemedSelect from "@/src/components/shared/ThemedSelect";

const emptyItem: MenuItemInput = {
  category_id: 0,
  name: "",
  price: 0,
  image_url: "",
  description: "",
  is_available: true,
  display_order: 0,
};

type DeleteTarget =
  | { type: "category"; id: number; name: string }
  | { type: "item"; id: number; name: string };

export default function MenuPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canManage = can(activeMembership, "manage_menu");
  const canView = canManage || can(activeMembership, "view_menu");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [categoryOrder, setCategoryOrder] = useState("0");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [itemForm, setItemForm] = useState<MenuItemInput>(emptyItem);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [filterCategory, setFilterCategory] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [itemErrors, setItemErrors] = useState<{ category?: string; name?: string; submit?: string; image?: string }>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const saveCategoryOnceRef = useRef(createSingleFlight());
  const saveItemOnceRef = useRef(createSingleFlight());
  const deleteCategoryOnceRef = useRef(createSingleFlight());
  const deleteItemOnceRef = useRef(createSingleFlight());

  const copy = language === "th"
    ? {
        permissionDenied: "ไม่มีสิทธิ์ดูเมนู",
        eyebrow: "Menu",
        title: "เมนูอาหาร",
        manageSubtitle: "จัดการหมวดหมู่และเมนูของร้าน",
        viewSubtitle: "ดูเมนูทั้งหมดแบบ read-only",
        refresh: "รีเฟรช",
        loadError: "โหลดข้อมูลเมนูไม่สำเร็จ",
        categoryRequired: "กรุณากรอกชื่อหมวดหมู่",
        categorySaveError: "บันทึกหมวดหมู่ไม่สำเร็จ",
        itemRequired: "กรุณาเลือกหมวดหมู่และกรอกชื่อเมนู",
        itemCategoryRequired: "เลือกหมวดหมู่ก่อนเพิ่มเมนู",
        itemNameRequired: "กรอกชื่อเมนูที่ลูกค้าและพนักงานจำได้",
        itemSaveError: "บันทึกเมนูไม่สำเร็จ",
        categoryDeleteError: "ลบหมวดหมู่ไม่สำเร็จ",
        itemDeleteError: "ลบเมนูไม่สำเร็จ",
        confirmDeleteTitle: "ยืนยันการลบ",
        confirmDeleteBody: "ต้องการลบรายการนี้ใช่ไหม? การทำงานนี้ย้อนกลับไม่ได้",
        confirmDelete: "ยืนยันลบ",
        cancel: "ยกเลิก",
        imageTypeError: "กรุณาเลือกไฟล์รูปภาพ",
        imageUploadError: "อัปโหลดรูปไม่สำเร็จ กรุณาใช้ไฟล์ jpg, png หรือ webp ขนาดไม่เกิน 5MB",
        allCategories: "ทุกหมวดหมู่",
        catalogTitle: "รายการเมนู",
        menuColumn: "เมนู",
        categoryColumn: "หมวดหมู่",
        statusColumn: "สถานะ",
        priceColumn: "ราคา",
        actionsColumn: "จัดการ",
        menuSummary: "เมนูทั้งหมด",
        availableSummary: "พร้อมขาย",
        categoryManager: "หมวดหมู่เมนู",
        editorTitle: "จัดการเมนู",
        editorHint: "เพิ่มเมนูใหม่หรือแก้ไขรายการที่เลือก",
        categoryHint: "จัดกลุ่มเมนูให้พนักงานหาเจอเร็ว",
        searchPlaceholder: "ค้นหาเมนู",
        noImage: "ไม่มีรูป",
        uncategorized: "ไม่ระบุหมวด",
        noDescription: "ไม่มีรายละเอียด",
        available: "พร้อมขาย",
        unavailable: "ปิดขาย",
        edit: "แก้ไข",
        delete: "ลบ",
        noMenuTitle: "ยังไม่มีเมนู",
        noMenuManage: "สร้างหมวดหมู่และเพิ่มเมนูแรกจากแผงด้านขวา",
        noMenuView: "เจ้าของร้านยังไม่ได้เปิดเมนูให้ดู",
        categories: "หมวดหมู่",
        noCategories: "ยังไม่มีหมวดหมู่",
        editCategory: "แก้หมวดหมู่",
        addCategory: "เพิ่มหมวดหมู่",
        categoryName: "ชื่อหมวดหมู่",
        categoryPlaceholder: "เช่น อาหารจานเดียว / เครื่องดื่ม",
        categoryOrder: "ลำดับแสดงผลของหมวดหมู่",
        categoryOrderPlaceholder: "เช่น 1",
        categoryOrderHelp: "เลขน้อยจะแสดงก่อน ถ้าไม่แน่ใจใส่ 0 ได้",
        saveCategory: "บันทึกหมวดหมู่",
        createCategory: "เพิ่มหมวดหมู่",
        editItem: "แก้เมนู",
        addItem: "เพิ่มเมนู",
        itemCategory: "หมวดหมู่เมนู",
        createCategoryFirst: "สร้างหมวดหมู่ก่อนเพิ่มเมนู",
        createCategoryHint: "เพิ่มหมวดหมู่ เช่น อาหารจานเดียว / เครื่องดื่ม ก่อน แล้วค่อยเพิ่มเมนูในหมวดนั้น",
        itemName: "ชื่อเมนู",
        itemNamePlaceholder: "เช่น ข้าวกะเพราหมูสับ",
        price: "ราคาเมนู (บาท)",
        pricePlaceholder: "เช่น 65",
        itemOrder: "ลำดับแสดงผลของเมนู",
        itemOrderHelp: "เลขน้อยจะแสดงก่อนในหมวดหมู่นั้น ถ้าไม่แน่ใจเว้นว่างได้",
        image: "รูปเมนู",
        imageUrlPlaceholder: "หรือวาง URL รูปภาพเอง",
        uploading: "กำลังอัปโหลดรูป...",
        imageHelp: "รองรับ jpg, png, webp ไม่เกิน 5MB",
        description: "รายละเอียดเมนู",
        descriptionPlaceholder: "เช่น เผ็ดน้อยได้ เพิ่มไข่ดาวได้",
        availableInStaffView: "พร้อมขายในหน้าพนักงาน",
        saveItem: "บันทึกเมนู",
        createItem: "เพิ่มเมนู",
        cancelEdit: "ยกเลิกการแก้ไข",
        imageAlt: "รูปเมนู",
      }
    : {
        permissionDenied: "You do not have permission to view the menu.",
        eyebrow: "Menu",
        title: "Food menu",
        manageSubtitle: "Manage the restaurant's categories and menu items.",
        viewSubtitle: "View the full menu in read-only mode.",
        refresh: "Refresh",
        loadError: "Could not load menu data.",
        categoryRequired: "Please enter a category name.",
        categorySaveError: "Could not save category.",
        itemRequired: "Please choose a category and enter a menu item name.",
        itemCategoryRequired: "Choose a category before adding a menu item.",
        itemNameRequired: "Enter a menu item name your team can recognize.",
        itemSaveError: "Could not save menu item.",
        categoryDeleteError: "Could not delete category.",
        itemDeleteError: "Could not delete menu item.",
        confirmDeleteTitle: "Confirm delete",
        confirmDeleteBody: "Delete this item? This action cannot be undone.",
        confirmDelete: "Delete",
        cancel: "Cancel",
        imageTypeError: "Please choose an image file.",
        imageUploadError: "Could not upload image. Use jpg, png, or webp up to 5MB.",
        allCategories: "All categories",
        catalogTitle: "Menu catalog",
        menuColumn: "Item",
        categoryColumn: "Category",
        statusColumn: "Status",
        priceColumn: "Price",
        actionsColumn: "Actions",
        menuSummary: "Total items",
        availableSummary: "Available",
        categoryManager: "Menu categories",
        editorTitle: "Menu editor",
        editorHint: "Add a new item or edit the selected menu item.",
        categoryHint: "Group items so staff can find them quickly.",
        searchPlaceholder: "Search menu",
        noImage: "No image",
        uncategorized: "Uncategorized",
        noDescription: "No description",
        available: "Available",
        unavailable: "Unavailable",
        edit: "Edit",
        delete: "Delete",
        noMenuTitle: "No menu items yet",
        noMenuManage: "Create a category and add the first menu item from the right panel.",
        noMenuView: "The owner has not made menu items visible yet.",
        categories: "Categories",
        noCategories: "No categories yet",
        editCategory: "Edit category",
        addCategory: "Add category",
        categoryName: "Category name",
        categoryPlaceholder: "For example, Main dishes / Drinks",
        categoryOrder: "Category display order",
        categoryOrderPlaceholder: "For example, 1",
        categoryOrderHelp: "Lower numbers appear first. Use 0 if you are not sure.",
        saveCategory: "Save category",
        createCategory: "Add category",
        editItem: "Edit menu item",
        addItem: "Add menu item",
        itemCategory: "Menu category",
        createCategoryFirst: "Create a category before adding a menu item",
        createCategoryHint: "Add a category such as Main dishes or Drinks first, then add menu items to it.",
        itemName: "Menu item name",
        itemNamePlaceholder: "For example, Basil pork with rice",
        price: "Price (THB)",
        pricePlaceholder: "For example, 65",
        itemOrder: "Menu item display order",
        itemOrderHelp: "Lower numbers appear first inside this category. Leave blank if you are not sure.",
        image: "Menu image",
        imageUrlPlaceholder: "Or paste an image URL",
        uploading: "Uploading image...",
        imageHelp: "Supports jpg, png, webp up to 5MB",
        description: "Menu description",
        descriptionPlaceholder: "For example, mild spice available, add fried egg",
        availableInStaffView: "Available in staff view",
        saveItem: "Save menu item",
        createItem: "Add menu item",
        cancelEdit: "Cancel edit",
        imageAlt: "Menu image",
      };

  const refresh = async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const [catRes, itemRes] = await Promise.all([listCategories(), listMenuItems()]);
      const nextCategories = catRes.data.categories ?? [];
      setCategories(nextCategories);
      setItems(itemRes.data.menu_items ?? []);
      setItemForm((current) => current.category_id ? current : { ...current, category_id: nextCategories[0]?.ID ?? 0 });
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, language]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatch = !filterCategory || item.category_id === filterCategory;
      const searchMatch = !keyword || item.name.toLowerCase().includes(keyword) || item.description.toLowerCase().includes(keyword);
      return categoryMatch && searchMatch;
    });
  }, [filterCategory, items, search]);

  const categoryCounts = useMemo(() => {
    return categories.reduce<Record<number, number>>((acc, category) => {
      acc[category.ID] = items.filter((item) => item.category_id === category.ID).length;
      return acc;
    }, {});
  }, [categories, items]);
  const activeCategory = categories.find((category) => category.ID === filterCategory);
  const availableCount = items.filter((item) => item.is_available).length;

  if (!canView) return <PermissionDenied title={copy.permissionDenied} />;

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const name = categoryName.trim();
    if (!name) {
      setCategoryError(copy.categoryRequired);
      return;
    }
    await saveCategoryOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      setCategoryError("");
      try {
        const payload = { name, display_order: Number.parseInt(categoryOrder, 10) || 0, is_active: editingCategory?.is_active ?? true };
        if (editingCategory) {
          const res = await updateCategory(editingCategory.ID, payload);
          setCategories((current) => current.map((cat) => cat.ID === res.data.ID ? res.data : cat));
        } else {
          const res = await createCategory(payload);
          setCategories((current) => [...current, res.data]);
          if (!itemForm.category_id) setItemForm((current) => ({ ...current, category_id: res.data.ID }));
        }
        setCategoryName("");
        setCategoryOrder("0");
        setEditingCategory(null);
      } catch {
        setCategoryError(copy.categorySaveError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const nextItemErrors = {
      category: itemForm.category_id ? undefined : copy.itemCategoryRequired,
      name: itemForm.name.trim() ? undefined : copy.itemNameRequired,
    };
    if (nextItemErrors.category || nextItemErrors.name) {
      setItemErrors(nextItemErrors);
      return;
    }
    await saveItemOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      setItemErrors({});
      try {
        const payload = { ...itemForm, name: itemForm.name.trim(), price: Number(itemForm.price) || 0, display_order: Number(itemForm.display_order) || 0 };
        if (editingItem) {
          const res = await updateMenuItem(editingItem.ID, payload);
          setItems((current) => current.map((item) => item.ID === res.data.ID ? res.data : item));
        } else {
          const res = await createMenuItem(payload);
          setItems((current) => [...current, res.data]);
        }
        setEditingItem(null);
        setItemForm({ ...emptyItem, category_id: categories[0]?.ID ?? 0 });
        setDrawerOpen(false);
      } catch {
        setItemErrors({ submit: copy.itemSaveError });
      } finally {
        setSubmitting(false);
      }
    });
  };

  const editCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryOrder(String(category.display_order));
    setCategoryError("");
  };

  const editItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemErrors({});
    setItemForm({
      category_id: item.category_id,
      name: item.name,
      price: item.price,
      image_url: item.image_url,
      description: item.description,
      is_available: item.is_available,
      display_order: item.display_order,
    });
    setDrawerOpen(true);
  };

  const startCreateItem = () => {
    setEditingItem(null);
    setItemErrors({});
    setItemForm({ ...emptyItem, category_id: filterCategory || categories[0]?.ID || 0 });
    setDrawerOpen(true);
  };

  const closeItemDrawer = () => {
    setDrawerOpen(false);
    setEditingItem(null);
    setItemErrors({});
  };

  const removeCategory = async (categoryId: number) => {
    if (!canManage) return;
    await deleteCategoryOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        await deleteCategory(categoryId);
        await refresh();
      } catch {
        setError(copy.categoryDeleteError);
      } finally {
        setDeleteTarget(null);
        setSubmitting(false);
      }
    });
  };

  const removeItem = async (itemId: number) => {
    if (!canManage) return;
    await deleteItemOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        await deleteMenuItem(itemId);
        setItems((current) => current.filter((menuItem) => menuItem.ID !== itemId));
      } catch {
        setError(copy.itemDeleteError);
      } finally {
        setDeleteTarget(null);
        setSubmitting(false);
      }
    });
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setItemErrors((current) => ({ ...current, image: copy.imageTypeError }));
      return;
    }
    setUploadingImage(true);
    setError("");
    setItemErrors((current) => ({ ...current, image: undefined }));
    try {
      const res = await uploadMenuImage(file);
      setItemForm((current) => ({ ...current, image_url: res.data.image_url }));
    } catch {
      setItemErrors((current) => ({ ...current, image: copy.imageUploadError }));
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{canManage ? copy.manageSubtitle : copy.viewSubtitle}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="button" onClick={refresh} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
            {copy.refresh}
          </button>
          {canManage && (
            <>
              <button type="button" onClick={() => setCategoryModalOpen(true)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
                {copy.categoryManager}
              </button>
              <button type="button" onClick={startCreateItem} className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">
                + {copy.createItem}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="space-y-4">
        <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
              <button
                type="button"
                onClick={() => setFilterCategory(0)}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-[12px] font-medium transition-colors ${
                  filterCategory === 0
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
                }`}
              >
                {copy.allCategories}
                <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${filterCategory === 0 ? "bg-white/15 dark:bg-gray-900/10" : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400"}`}>
                  {items.length}
                </span>
              </button>
              {categories.map((category) => (
                <button
                  key={category.ID}
                  type="button"
                  onClick={() => setFilterCategory(category.ID)}
                  className={`inline-flex h-9 max-w-[220px] shrink-0 items-center gap-2 rounded-md px-3 text-[12px] font-medium transition-colors ${
                    filterCategory === category.ID
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
                  }`}
                >
                  <span className={`truncate ${!category.is_active ? "line-through opacity-60" : ""}`}>{category.name}</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${filterCategory === category.ID ? "bg-white/15 dark:bg-gray-900/10" : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400"}`}>
                    {categoryCounts[category.ID] ?? 0}
                  </span>
                </button>
              ))}
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900 lg:max-w-xs" />
          </div>
        </div>

        <section className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{copy.catalogTitle}</p>
                  <h2 className="mt-0.5 text-[16px] font-semibold text-gray-900 dark:text-white">{activeCategory?.name ?? copy.allCategories}</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] sm:min-w-[220px]">
                  <div className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
                    <p className="text-gray-400">{copy.menuSummary}</p>
                    <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums">{items.length}</p>
                  </div>
                  <div className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
                    <p className="text-gray-400">{copy.availableSummary}</p>
                    <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">{availableCount}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  <RestaurantCardSkeleton />
                  <RestaurantCardSkeleton />
                  <RestaurantCardSkeleton />
                </div>
              ) : filteredItems.length ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {filteredItems.map((item) => (
                    <article key={item.ID} className={`group flex min-h-[214px] flex-col overflow-hidden rounded-md border border-gray-200 bg-white transition-[border-color,background-color,box-shadow] hover:border-orange-200 hover:bg-orange-50/20 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-orange-900/50 dark:hover:bg-orange-900/10 ${!item.is_available ? "opacity-60" : ""}`}>
                      <div
                        className="aspect-[4/3] bg-gray-100 bg-cover bg-center dark:bg-gray-900"
                        style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
                        aria-label={item.image_url ? `${copy.imageAlt} ${item.name}` : undefined}
                      >
                        {!item.image_url && <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-gray-400">{copy.noImage}</div>}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col border-t border-gray-100 p-3 dark:border-gray-800">
                        <h3 className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{item.name}</h3>
                        <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{item.price.toLocaleString()}</p>
                        <div className="mt-2">
                          <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${item.is_available ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400"}`}>
                            {item.is_available ? copy.available : copy.unavailable}
                          </span>
                        </div>
                      </div>
                      {canManage ? (
                        <div className="grid grid-cols-2 gap-2 border-t border-gray-100 p-2 dark:border-gray-800">
                          <button type="button" onClick={() => editItem(item)} className="h-8 rounded-md border border-gray-200 px-2 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.edit}</button>
                          <button type="button" disabled={submitting} onClick={() => setDeleteTarget({ type: "item", id: item.ID, name: item.name })} className="h-8 rounded-md border border-red-200 px-2 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-10 text-center">
                  <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.noMenuTitle}</p>
                  <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{canManage ? copy.noMenuManage : copy.noMenuView}</p>
                </div>
              )}
            </div>
          </div>
        </section>

      </div>

      {categoryModalOpen && canManage && (
        <div className="motion-overlay fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
          <div className="motion-bottom-sheet flex max-h-[86vh] w-full max-w-sm flex-col rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.categoryManager}</h2>
              <button type="button" onClick={() => setCategoryModalOpen(false)} className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {categories.map((category) => (
                  <div key={category.ID} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
                    <div className="min-w-0">
                      <p className={`truncate text-[13px] font-medium ${!category.is_active ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"}`}>{category.name}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{categoryCounts[category.ID] ?? 0} {copy.menuSummary}</p>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => editCategory(category)} className="h-8 rounded-md px-2 text-[11px] font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20">{copy.edit}</button>
                      <button type="button" disabled={submitting} onClick={() => setDeleteTarget({ type: "category", id: category.ID, name: category.name })} className="h-8 rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>
                    </div>
                  </div>
                ))}
                {!categories.length && <p className="rounded-md border border-gray-200 px-3 py-6 text-center text-[12px] text-gray-500 dark:border-gray-800">{copy.noCategories}</p>}
              </div>
            </div>
            <form onSubmit={saveCategory} className="border-t border-gray-200 p-4 dark:border-gray-800">
              <h3 className="text-[13px] font-semibold">{editingCategory ? copy.editCategory : copy.addCategory}</h3>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <input
                  value={categoryName}
                  onChange={(event) => {
                    setCategoryName(event.target.value);
                    setCategoryError("");
                  }}
                  placeholder={copy.categoryPlaceholder}
                  aria-invalid={Boolean(categoryError)}
                  className={`h-10 w-full rounded-md border bg-white px-3 text-[13px] outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:bg-gray-900 ${categoryError ? "border-red-300 dark:border-red-900/60" : "border-gray-200 dark:border-gray-700"}`}
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input value={categoryOrder} onChange={(event) => setCategoryOrder(event.target.value)} placeholder={copy.categoryOrderPlaceholder} type="number" className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
                  <button disabled={submitting} className="ui-press h-10 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                    {editingCategory ? copy.saveCategory : copy.createCategory}
                  </button>
                </div>
                {categoryError ? (
                  <p className="text-[11px] font-medium text-red-600 dark:text-red-300">{categoryError}</p>
                ) : (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{copy.categoryOrderHelp}</p>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {drawerOpen && canManage && (
        <>
          <button type="button" aria-label={copy.cancel} onClick={closeItemDrawer} className="motion-overlay fixed inset-0 z-30 cursor-default bg-gray-950/40" />
          <form onSubmit={saveItem} className="motion-drawer fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{copy.editorTitle}</p>
                <h2 className="mt-0.5 text-[15px] font-semibold text-gray-900 dark:text-white">{editingItem ? copy.editItem : copy.addItem}</h2>
              </div>
              <button type="button" onClick={closeItemDrawer} className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.itemCategory}</span>
                  <ThemedSelect
                    value={String(itemForm.category_id)}
                    onChange={(next) => {
                      setItemForm({ ...itemForm, category_id: Number(next) });
                      setItemErrors((current) => ({ ...current, category: undefined, submit: undefined }));
                    }}
                    disabled={!categories.length}
                    options={categories.length ? categories.map((cat) => ({ value: String(cat.ID), label: cat.name })) : [{ value: "0", label: copy.createCategoryFirst }]}
                  />
                  {itemErrors.category && <p className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-300">{itemErrors.category}</p>}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.itemName}</span>
                  <input value={itemForm.name} onChange={(event) => { setItemForm({ ...itemForm, name: event.target.value }); setItemErrors((current) => ({ ...current, name: undefined, submit: undefined })); }} placeholder={copy.itemNamePlaceholder} className={`h-10 w-full rounded-md border bg-white px-3 text-[13px] outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:bg-gray-900 ${itemErrors.name ? "border-red-300 dark:border-red-900/60" : "border-gray-200 dark:border-gray-700"}`} />
                  {itemErrors.name && <p className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-300">{itemErrors.name}</p>}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.price}</span>
                    <input value={itemForm.price || ""} onChange={(event) => setItemForm({ ...itemForm, price: Number(event.target.value) })} placeholder={copy.pricePlaceholder} type="number" min={0} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.itemOrder}</span>
                    <input value={itemForm.display_order || ""} onChange={(event) => setItemForm({ ...itemForm, display_order: Number(event.target.value) })} placeholder={copy.categoryOrderPlaceholder} type="number" className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
                  </label>
                </div>
                <div className="rounded-md border border-gray-200 dark:border-gray-800">
                  <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                    <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.image}</span>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-[96px_1fr]">
                    <div className="h-24 rounded-md bg-gray-100 bg-cover bg-center dark:bg-gray-900" style={itemForm.image_url ? { backgroundImage: `url(${itemForm.image_url})` } : undefined}>
                      {!itemForm.image_url && <div className="flex h-full items-center justify-center text-[11px] text-gray-400">{copy.noImage}</div>}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingImage} onChange={(event) => uploadImage(event.target.files?.[0])} className="block w-full text-[12px] text-gray-500 file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:text-[12px] file:font-semibold file:text-white disabled:opacity-60 dark:text-gray-400 dark:file:bg-white dark:file:text-gray-900" />
                      <input value={itemForm.image_url} onChange={(event) => { setItemForm({ ...itemForm, image_url: event.target.value }); setItemErrors((current) => ({ ...current, image: undefined })); }} placeholder={copy.imageUrlPlaceholder} className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[12px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
                      <p className={`text-[11px] ${itemErrors.image ? "font-medium text-red-600 dark:text-red-300" : "text-gray-400 dark:text-gray-500"}`}>{itemErrors.image || (uploadingImage ? copy.uploading : copy.imageHelp)}</p>
                    </div>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.description}</span>
                  <textarea value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} placeholder={copy.descriptionPlaceholder} className="h-24 w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
                </label>
                <label className="flex min-h-9 items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={itemForm.is_available} onChange={(event) => setItemForm({ ...itemForm, is_available: event.target.checked })} />
                  {copy.availableInStaffView}
                </label>
              </div>
            </div>
            <div className="border-t border-gray-200 p-4 dark:border-gray-800">
              <button disabled={submitting || uploadingImage || !categories.length} className="ui-press h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                {editingItem ? copy.saveItem : copy.createItem}
              </button>
              {itemErrors.submit && <p className="mt-2 text-[11px] font-medium text-red-600 dark:text-red-300">{itemErrors.submit}</p>}
            </div>
          </form>
        </>
      )}

      {deleteTarget && (
        <div className="motion-overlay fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
          <div className="motion-bottom-sheet w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.confirmDeleteTitle}</h2>
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.confirmDeleteBody}</p>
            </div>
            <div className="px-4 py-3">
              <p className="truncate text-[13px] font-medium text-gray-900 dark:text-white">{deleteTarget.name}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={submitting} className="ui-press h-9 rounded-md border border-gray-200 px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void (deleteTarget.type === "category" ? removeCategory(deleteTarget.id) : removeItem(deleteTarget.id))}
                className="ui-press h-9 rounded-md border border-red-200 bg-white px-3 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:bg-gray-950 dark:text-red-300 dark:hover:bg-red-900/20"
              >
                {copy.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
