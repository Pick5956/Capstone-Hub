"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { formatCurrency } from "@/src/lib/format";
import { createCategory, createMenuItem, deleteCategory, deleteMenuItem, listCategories, listMenuItems, updateCategory, updateMenuItem, updateMenuItemAvailability, uploadMenuImage } from "@/src/lib/menu";
import { listIngredients } from "@/src/lib/ingredient";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { Category, MenuIngredientInput, MenuItem, MenuItemInput, MenuOptionGroupInput } from "@/src/types/menu";
import type { Ingredient } from "@/src/types/ingredient";
import { RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { useToast } from "@/src/components/shared/FeedbackProvider";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import {
  AvailabilitySwitch,
  emptyItem,
  emptyOptionGroup,
  emptyRecipeComponent,
  menuCategoryIds,
  menuItemToInput,
  recipeCost,
} from "./menuPageUtils";

type DeleteTarget =
  | { type: "category"; id: number; name: string }
  | { type: "item"; id: number; name: string };
type AvailabilityFilter = "all" | "available" | "unavailable";
type ItemEditorTab = "basic" | "options" | "recipe";

export default function MenuPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const canManage = can(activeMembership, "manage_menu");
  const canView = canManage || can(activeMembership, "view_menu");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<Ingredient[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [inlineCategoryName, setInlineCategoryName] = useState("");
  const [inlineCategorySaving, setInlineCategorySaving] = useState(false);
  const [inlineCategoryError, setInlineCategoryError] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [itemForm, setItemForm] = useState<MenuItemInput>(emptyItem);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [filterCategory, setFilterCategory] = useState(0);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [availabilitySubmittingId, setAvailabilitySubmittingId] = useState<number | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [itemErrors, setItemErrors] = useState<{ category?: string; name?: string; submit?: string; image?: string; options?: string }>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [itemEditorTab, setItemEditorTab] = useState<ItemEditorTab>("basic");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [categoryModalClosing, setCategoryModalClosing] = useState(false);
  const [deleteClosing, setDeleteClosing] = useState(false);
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
        loadError: "โหลดข้อมูลเมนูไม่สำเร็จ",
        categoryRequired: "กรุณากรอกชื่อหมวดหมู่",
        categorySaveError: "บันทึกหมวดหมู่ไม่สำเร็จ",
        itemRequired: "กรุณาเลือกหมวดหมู่และกรอกชื่อเมนู",
        itemCategoryRequired: "เลือกหมวดหมู่ก่อนเพิ่มเมนู",
        itemNameRequired: "กรอกชื่อเมนูที่ลูกค้าและพนักงานจำได้",
        itemSaveError: "บันทึกเมนูไม่สำเร็จ",
        categoryDeleteError: "ลบหมวดหมู่ไม่สำเร็จ",
        itemDeleteError: "ลบเมนูไม่สำเร็จ",
        categoryCreated: "เพิ่มหมวดหมู่แล้ว",
        categoryUpdated: "อัปเดตหมวดหมู่แล้ว",
        orderUpdated: "อัปเดตลำดับแล้ว",
        itemCreated: "เพิ่มเมนูแล้ว",
        itemUpdated: "อัปเดตเมนูแล้ว",
        categoryDeleted: "ลบหมวดหมู่แล้ว",
        itemDeleted: "ลบเมนูแล้ว",
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
        unavailableSummary: "ปิดขาย",
        categoryManager: "หมวดหมู่เมนู",
        editorTitle: "จัดการเมนู",
        editorHint: "เพิ่มเมนูใหม่หรือแก้ไขรายการที่เลือก",
        categoryHint: "จัดกลุ่มเมนูให้พนักงานหาเจอเร็ว",
        searchPlaceholder: "ค้นหาเมนู",
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
        itemCategories: "หมวดหมู่เมนู",
        addInlineCategory: "สร้างหมวดใหม่",
        inlineCategoryPlaceholder: "ชื่อหมวดใหม่",
        noCategorySelected: "เลือกอย่างน้อย 1 หมวด",
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
        optionsTitle: "ตัวเลือกเมนู",
        optionsHint: "เช่น ระดับความสุก ซอส ท็อปปิง หรือพิเศษ",
        addOptionGroup: "เพิ่มชุดตัวเลือก",
        optionGroupName: "ชื่อชุดตัวเลือก",
        optionGroupPlaceholder: "เช่น ระดับความสุก",
        requiredOption: "ต้องเลือก",
        maxSelect: "เลือกได้สูงสุด",
        optionName: "ชื่อตัวเลือก",
        optionNamePlaceholder: "เช่น สุกปานกลาง",
        optionPrice: "ราคาเพิ่ม",
        addOption: "เพิ่มตัวเลือก",
        removeOptionGroup: "ลบชุด",
        removeOption: "ลบ",
        optionError: "กรอกชื่อชุดตัวเลือกและอย่างน้อย 1 ตัวเลือก หรือปล่อยว่างทั้งชุด",
        recipeTitle: "สูตรวัตถุดิบ",
        recipeHint: "ผูกเมนูกับวัตถุดิบเพื่อคำนวณต้นทุนและหักสต็อกตอนเสิร์ฟ",
        addRecipeComponent: "เพิ่มวัตถุดิบ",
        ingredient: "วัตถุดิบ",
        quantity: "จำนวน",
        unit: "หน่วย",
        note: "หมายเหตุ",
        removeComponent: "ลบ",
        recipeCost: "ต้นทุน/จาน",
        noIngredients: "เพิ่มวัตถุดิบในหน้า Inventory ก่อน",
      }
    : {
        permissionDenied: "You do not have permission to view the menu.",
        eyebrow: "Menu",
        title: "Food menu",
        manageSubtitle: "Manage the restaurant's categories and menu items.",
        viewSubtitle: "View the full menu in read-only mode.",
        loadError: "Could not load menu data.",
        categoryRequired: "Please enter a category name.",
        categorySaveError: "Could not save category.",
        itemRequired: "Please choose a category and enter a menu item name.",
        itemCategoryRequired: "Choose a category before adding a menu item.",
        itemNameRequired: "Enter a menu item name your team can recognize.",
        itemSaveError: "Could not save menu item.",
        categoryDeleteError: "Could not delete category.",
        itemDeleteError: "Could not delete menu item.",
        categoryCreated: "Category added",
        categoryUpdated: "Category updated",
        orderUpdated: "Order updated",
        itemCreated: "Menu item added",
        itemUpdated: "Menu item updated",
        categoryDeleted: "Category deleted",
        itemDeleted: "Menu item deleted",
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
        unavailableSummary: "Unavailable",
        categoryManager: "Menu categories",
        editorTitle: "Menu editor",
        editorHint: "Add a new item or edit the selected menu item.",
        categoryHint: "Group items so staff can find them quickly.",
        searchPlaceholder: "Search menu",
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
        itemCategories: "Menu categories",
        addInlineCategory: "Create category",
        inlineCategoryPlaceholder: "New category name",
        noCategorySelected: "Choose at least 1 category",
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
        optionsTitle: "Menu options",
        optionsHint: "For doneness, sauces, toppings, or special size.",
        addOptionGroup: "Add option group",
        optionGroupName: "Option group name",
        optionGroupPlaceholder: "For example, Doneness",
        requiredOption: "Required",
        maxSelect: "Max choices",
        optionName: "Option name",
        optionNamePlaceholder: "For example, Medium",
        optionPrice: "Extra price",
        addOption: "Add option",
        removeOptionGroup: "Remove group",
        removeOption: "Remove",
        optionError: "Enter an option group name and at least 1 option, or leave the group empty.",
        recipeTitle: "Recipe ingredients",
        recipeHint: "Connect this item to stock so serving it deducts inventory and calculates food cost.",
        addRecipeComponent: "Add ingredient",
        ingredient: "Ingredient",
        quantity: "Quantity",
        unit: "Unit",
        note: "Note",
        removeComponent: "Remove",
        recipeCost: "Cost/portion",
        noIngredients: "Add ingredients in Inventory first.",
      };

  const refresh = async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const [catRes, itemRes, ingredientRes] = await Promise.all([listCategories(), listMenuItems(), listIngredients()]);
      const nextCategories = catRes.data.categories ?? [];
      setCategories(nextCategories);
      setItems(itemRes.data.menu_items ?? []);
      setRecipeIngredients(ingredientRes.data.ingredients ?? []);
      setItemForm((current) => {
        if (current.category_id || current.category_ids?.length) return current;
        const firstID = nextCategories[0]?.ID ?? 0;
        return { ...current, category_id: firstID, category_ids: firstID ? [firstID] : [] };
      });
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(loadTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, language]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatch = !filterCategory || menuCategoryIds(item).includes(filterCategory);
      const availabilityMatch =
        availabilityFilter === "all" ||
        (availabilityFilter === "available" ? item.is_available : !item.is_available);
      const searchMatch = !keyword || item.name.toLowerCase().includes(keyword) || item.description.toLowerCase().includes(keyword);
      return categoryMatch && availabilityMatch && searchMatch;
    });
  }, [availabilityFilter, filterCategory, items, search]);

  const categoryCounts = useMemo(() => {
    return categories.reduce<Record<number, number>>((acc, category) => {
      acc[category.ID] = items.filter((item) => menuCategoryIds(item).includes(category.ID)).length;
      return acc;
    }, {});
  }, [categories, items]);
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.display_order - b.display_order) || (a.ID - b.ID)),
    [categories],
  );
  const categoryFilterOptions = useMemo(() => [
    { value: "0", label: copy.allCategories },
    ...sortedCategories.map((category) => ({ value: String(category.ID), label: category.name })),
  ], [copy.allCategories, sortedCategories]);
  const activeCategory = categories.find((category) => category.ID === filterCategory);
  const availableCount = items.filter((item) => item.is_available).length;
  const unavailableCount = items.length - availableCount;

  const normalizeOptionGroups = (groups: MenuOptionGroupInput[]) =>
    groups
      .map((group, groupIndex) => ({
        ...group,
        name: group.name.trim(),
        min_select: group.required ? 1 : 0,
        max_select: Math.max(1, Number(group.max_select) || 1),
        display_order: Number(group.display_order) || groupIndex,
        options: group.options
          .map((option, optionIndex) => ({
            ...option,
            name: option.name.trim(),
            price_delta: Number(option.price_delta) || 0,
            display_order: Number(option.display_order) || optionIndex,
          }))
          .filter((option) => option.name),
      }))
      .filter((group) => group.name || group.options.length);

  const validateOptionGroups = (groups: MenuOptionGroupInput[]) => {
    return normalizeOptionGroups(groups).every((group) => group.name && group.options.length && group.max_select >= group.min_select);
  };

  const normalizeRecipeComponents = (components: MenuIngredientInput[] = []) =>
    components
      .map((component) => {
        const ingredient = recipeIngredients.find((item) => item.ID === component.ingredient_id);
        return {
          ingredient_id: Number(component.ingredient_id) || 0,
          quantity: Number(component.quantity) || 0,
          unit: (component.unit || ingredient?.unit || "").trim(),
          note: (component.note || "").trim(),
        };
      })
      .filter((component) => component.ingredient_id && component.quantity > 0);

  const selectedCategoryIds = itemForm.category_ids?.length
    ? itemForm.category_ids
    : itemForm.category_id
      ? [itemForm.category_id]
      : [];

  const setSelectedCategoryIds = (ids: number[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    setItemForm((current) => ({ ...current, category_id: unique[0] ?? 0, category_ids: unique }));
    setItemErrors((current) => ({ ...current, category: undefined, submit: undefined }));
  };

  const toggleSelectedCategory = (categoryId: number) => {
    setSelectedCategoryIds(
      selectedCategoryIds.includes(categoryId)
        ? selectedCategoryIds.filter((id) => id !== categoryId)
        : [...selectedCategoryIds, categoryId]
    );
  };

  const updateRecipeComponents = (updater: (components: MenuIngredientInput[]) => MenuIngredientInput[]) => {
    setItemForm((current) => ({ ...current, ingredients: updater(current.ingredients ?? []) }));
    setItemErrors((current) => ({ ...current, submit: undefined }));
  };

  const createInlineCategory = async () => {
    const name = inlineCategoryName.trim();
    if (!name) {
      setInlineCategoryError(copy.categoryRequired);
      return;
    }
    setInlineCategorySaving(true);
    setInlineCategoryError("");
    try {
      const res = await createCategory({
        name,
        display_order: Math.max(0, ...categories.map((category) => category.display_order || 0)) + 1,
        is_active: true,
      });
      setCategories((current) => [...current, res.data]);
      setSelectedCategoryIds([...selectedCategoryIds, res.data.ID]);
      setInlineCategoryName("");
      showToast({ title: copy.categoryCreated });
    } catch {
      setInlineCategoryError(copy.categorySaveError);
    } finally {
      setInlineCategorySaving(false);
    }
  };

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
        const nextDisplayOrder = editingCategory
          ? editingCategory.display_order
          : Math.max(0, ...categories.map((category) => category.display_order || 0)) + 1;
        const payload = { name, display_order: nextDisplayOrder, is_active: true };
        if (editingCategory) {
          const res = await updateCategory(editingCategory.ID, payload);
          setCategories((current) => current.map((cat) => cat.ID === res.data.ID ? res.data : cat));
          showToast({ title: copy.categoryUpdated });
        } else {
          const res = await createCategory(payload);
          setCategories((current) => [...current, res.data]);
          if (!itemForm.category_id && !itemForm.category_ids?.length) setItemForm((current) => ({ ...current, category_id: res.data.ID, category_ids: [res.data.ID] }));
          showToast({ title: copy.categoryCreated });
        }
        setCategoryName("");
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
      category: selectedCategoryIds.length ? undefined : copy.itemCategoryRequired,
      name: itemForm.name.trim() ? undefined : copy.itemNameRequired,
      options: validateOptionGroups(itemForm.option_groups ?? []) ? undefined : copy.optionError,
    };
    if (nextItemErrors.category || nextItemErrors.name || nextItemErrors.options) {
      setItemErrors(nextItemErrors);
      setItemEditorTab(nextItemErrors.options ? "options" : "basic");
      return;
    }
    await saveItemOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      setItemErrors({});
      try {
        const payload = {
          ...itemForm,
          name: itemForm.name.trim(),
          category_id: selectedCategoryIds[0],
          category_ids: selectedCategoryIds,
          price: Number(itemForm.price) || 0,
          display_order: Number(itemForm.display_order) || 0,
          option_groups: normalizeOptionGroups(itemForm.option_groups ?? []),
          ingredients: normalizeRecipeComponents(itemForm.ingredients ?? []),
        };
        if (editingItem) {
          const res = await updateMenuItem(editingItem.ID, payload);
          setItems((current) => current.map((item) => item.ID === res.data.ID ? res.data : item));
          showToast({ title: copy.itemUpdated });
        } else {
          const res = await createMenuItem(payload);
          setItems((current) => [...current, res.data]);
          showToast({ title: copy.itemCreated });
        }
        setEditingItem(null);
        const firstID = sortedCategories[0]?.ID ?? 0;
        setItemForm({ ...emptyItem, category_id: firstID, category_ids: firstID ? [firstID] : [] });
        closeItemDrawer();
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
    setCategoryError("");
  };

  const toggleCategoryEdit = (category: Category) => {
    if (editingCategory?.ID === category.ID) {
      setEditingCategory(null);
      setCategoryName("");
      setCategoryError("");
      return;
    }
    editCategory(category);
  };

  const moveCategoryOrder = async (categoryID: number, direction: -1 | 1) => {
    const currentIndex = sortedCategories.findIndex((category) => category.ID === categoryID);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedCategories.length) return;

    const reordered = [...sortedCategories];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    const normalized = reordered.map((category, index) => ({ ...category, display_order: index + 1 }));
    const previousCategories = categories;

    setSubmitting(true);
    setCategoryError("");
    setCategories(normalized);
    if (editingCategory) {
      const currentEditingCategory = normalized.find((category) => category.ID === editingCategory.ID);
      if (currentEditingCategory) {
        setEditingCategory(currentEditingCategory);
      }
    }

    try {
      await Promise.all(normalized.map((category) => updateCategory(category.ID, {
        name: category.name,
        display_order: category.display_order,
        is_active: true,
      })));
      showToast({ title: copy.orderUpdated });
    } catch {
      setCategories(previousCategories);
      setCategoryError(copy.categorySaveError);
    } finally {
      setSubmitting(false);
    }
  };

  const editItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemErrors({});
    setItemForm(menuItemToInput(item));
    setItemEditorTab("basic");
    setDrawerOpen(true);
  };

  const toggleItemAvailability = async (item: MenuItem, nextAvailable: boolean) => {
    if (!canManage || availabilitySubmittingId === item.ID) return;
    setAvailabilitySubmittingId(item.ID);
    setItems((current) => current.map((currentItem) => currentItem.ID === item.ID ? { ...currentItem, is_available: nextAvailable } : currentItem));
    if (editingItem?.ID === item.ID) {
      setEditingItem((current) => current ? { ...current, is_available: nextAvailable } : current);
      setItemForm((current) => ({ ...current, is_available: nextAvailable }));
    }
    try {
      const res = await updateMenuItemAvailability(item.ID, nextAvailable);
      setItems((current) => current.map((currentItem) => currentItem.ID === res.data.ID ? res.data : currentItem));
      if (editingItem?.ID === item.ID) {
        setEditingItem(res.data);
        setItemForm((current) => ({ ...current, is_available: res.data.is_available }));
      }
    } catch {
      setItems((current) => current.map((currentItem) => currentItem.ID === item.ID ? { ...currentItem, is_available: item.is_available } : currentItem));
      if (editingItem?.ID === item.ID) {
        setEditingItem(item);
        setItemForm((current) => ({ ...current, is_available: item.is_available }));
      }
      showToast({ title: copy.itemSaveError, tone: "error" });
    } finally {
      setAvailabilitySubmittingId(null);
    }
  };

  const startCreateItem = () => {
    setEditingItem(null);
    setItemErrors({});
    const firstID = filterCategory || sortedCategories[0]?.ID || 0;
    setItemForm({ ...emptyItem, category_id: firstID, category_ids: firstID ? [firstID] : [] });
    setInlineCategoryName("");
    setInlineCategoryError("");
    setItemEditorTab("basic");
    setDrawerClosing(false);
    setDrawerOpen(true);
  };

  const closeItemDrawer = () => {
    if (drawerClosing) return;
    setDrawerClosing(true);
    window.setTimeout(() => {
      setDrawerOpen(false);
      setDrawerClosing(false);
      setEditingItem(null);
      setItemErrors({});
    }, 180);
  };

  const closeCategoryModal = () => {
    if (categoryModalClosing) return;
    setCategoryModalClosing(true);
    window.setTimeout(() => {
      setCategoryModalOpen(false);
      setCategoryModalClosing(false);
    }, 180);
  };

  const closeDeleteModal = (force = false) => {
    if (!force && (submitting || deleteClosing)) return;
    setDeleteClosing(true);
    window.setTimeout(() => {
      setDeleteTarget(null);
      setDeleteClosing(false);
    }, 180);
  };
  const categoryBackdrop = useBackdropClose(closeCategoryModal);
  const itemDrawerBackdrop = useBackdropClose(closeItemDrawer);
  const deleteBackdrop = useBackdropClose(closeDeleteModal);

  if (!canView) return <PermissionDenied title={copy.permissionDenied} />;

  const updateOptionGroups = (updater: (groups: MenuOptionGroupInput[]) => MenuOptionGroupInput[]) => {
    setItemForm((current) => ({ ...current, option_groups: updater(current.option_groups ?? []) }));
    setItemErrors((current) => ({ ...current, options: undefined, submit: undefined }));
  };

  const updateOptionGroup = (groupIndex: number, patch: Partial<MenuOptionGroupInput>) => {
    updateOptionGroups((groups) => groups.map((group, index) => index === groupIndex ? { ...group, ...patch } : group));
  };

  const updateOption = (groupIndex: number, optionIndex: number, patch: Partial<MenuOptionGroupInput["options"][number]>) => {
    updateOptionGroups((groups) => groups.map((group, index) => {
      if (index !== groupIndex) return group;
      return {
        ...group,
        options: group.options.map((option, currentOptionIndex) => currentOptionIndex === optionIndex ? { ...option, ...patch } : option),
      };
    }));
  };

  const removeCategory = async (categoryId: number) => {
    if (!canManage) return;
    await deleteCategoryOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        await deleteCategory(categoryId);
        await refresh();
        showToast({ title: copy.categoryDeleted });
      } catch {
        setError(copy.categoryDeleteError);
      } finally {
        setSubmitting(false);
        closeDeleteModal(true);
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
        if (editingItem?.ID === itemId) {
          closeItemDrawer();
        }
        showToast({ title: copy.itemDeleted });
      } catch {
        setError(copy.itemDeleteError);
      } finally {
        setSubmitting(false);
        closeDeleteModal(true);
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
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{canManage ? copy.manageSubtitle : copy.viewSubtitle}</p>
        </div>
        {canManage && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <>
              <button type="button" onClick={() => { setCategoryModalClosing(false); setCategoryModalOpen(true); }} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
                {copy.categoryManager}
              </button>
              <button type="button" onClick={startCreateItem} className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">
                + {copy.createItem}
              </button>
            </>
          </div>
        )}
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="space-y-4">
        <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
          <div className="grid gap-3 lg:grid-cols-[minmax(14rem,20rem)_minmax(16rem,1fr)] lg:items-end">
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{copy.itemCategory}</span>
              <ThemedSelect
                value={String(filterCategory)}
                onChange={(next) => setFilterCategory(Number(next))}
                options={categoryFilterOptions}
              />
            </div>
            <div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
            </div>
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
                <div className="grid grid-cols-3 gap-2 text-[11px] sm:min-w-[330px]">
                  {([
                    { key: "all" as const, label: copy.menuSummary, value: items.length, valueClass: "text-gray-950 dark:text-white" },
                    { key: "available" as const, label: copy.availableSummary, value: availableCount, valueClass: "text-emerald-600 dark:text-emerald-300" },
                    { key: "unavailable" as const, label: copy.unavailableSummary, value: unavailableCount, valueClass: "text-gray-500 dark:text-gray-400" },
                  ]).map((item) => {
                    const selected = availabilityFilter === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setAvailabilityFilter(item.key)}
                        className={`rounded-md border px-3 py-2 text-left transition-[background-color,border-color,box-shadow] ${
                          selected
                            ? "border-orange-300 bg-orange-50 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.18)] dark:border-orange-800 dark:bg-orange-950/25"
                            : "border-gray-200 hover:border-orange-200 hover:bg-orange-50/30 dark:border-gray-800 dark:hover:border-orange-900/60 dark:hover:bg-orange-950/15"
                        }`}
                      >
                        <p className="truncate text-gray-400">{item.label}</p>
                        <p className={`mt-1 font-mono text-[16px] font-semibold tabular-nums ${item.valueClass}`}>{item.value}</p>
                      </button>
                    );
                  })}
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
                  {filteredItems.map((item) => {
                    const availabilityBadgeClassName = item.is_available
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400";

                    return (
                    <article
                      key={item.ID}
                      role={canManage ? "button" : undefined}
                      tabIndex={canManage ? 0 : undefined}
                      onClick={canManage ? () => editItem(item) : undefined}
                      onKeyDown={canManage ? (event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        editItem(item);
                      } : undefined}
                      className={`group flex min-h-[214px] flex-col overflow-hidden rounded-md border border-gray-200 bg-white text-left transition-[border-color,background-color,box-shadow,transform] hover:border-orange-200 hover:bg-orange-50/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/25 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-orange-900/50 dark:hover:bg-orange-900/10 ${canManage ? "cursor-pointer active:scale-[0.99]" : ""} ${!item.is_available ? "opacity-60" : ""}`}
                    >
                      <div
                        className="aspect-[4/3] bg-gray-100 bg-cover bg-center dark:bg-gray-900"
                        style={{ backgroundImage: `url(${item.image_url || "/menu-placeholder-v2.webp"})` }}
                        aria-label={item.image_url ? `${copy.imageAlt} ${item.name}` : undefined}
                      />
                      <div className="flex min-w-0 flex-1 flex-col border-t border-gray-100 p-3 dark:border-gray-800">
                        <h3 className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{item.name}</h3>
                        <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{item.price.toLocaleString()}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {menuCategoryIds(item).slice(0, 3).map((categoryId) => {
                            const category = categories.find((cat) => cat.ID === categoryId);
                            if (!category) return null;
                            return (
                              <span key={categoryId} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                                {category.name}
                              </span>
                            );
                          })}
                        </div>
                        {item.ingredients?.length ? (
                          <p className="mt-1 text-[11px] text-gray-400">
                            {copy.recipeCost}: {formatCurrency(recipeCost(item.ingredients.map((component) => ({ ingredient_id: component.ingredient_id, quantity: component.quantity, unit: component.unit })), recipeIngredients), language, 2)}
                          </p>
                        ) : null}
                        <div className="mt-auto border-t border-gray-100 pt-3 dark:border-gray-800">
                          {canManage ? (
                            <div className="flex items-center justify-between gap-3">
                              <span className={`truncate text-[11px] font-medium ${item.is_available ? "text-emerald-700 dark:text-emerald-300" : "text-gray-500 dark:text-gray-400"}`}>
                                {item.is_available ? copy.available : copy.unavailable}
                              </span>
                              <AvailabilitySwitch
                                checked={item.is_available}
                                disabled={availabilitySubmittingId === item.ID}
                                label={item.is_available ? copy.available : copy.unavailable}
                                onChange={() => void toggleItemAvailability(item, !item.is_available)}
                              />
                            </div>
                          ) : (
                            <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${availabilityBadgeClassName}`}>
                              {item.is_available ? copy.available : copy.unavailable}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                    );
                  })}
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
        <div {...categoryBackdrop} className={`${categoryModalClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}>
          <div className={`${categoryModalClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} flex max-h-[86vh] w-full max-w-sm flex-col rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.categoryManager}</h2>
              <button type="button" onClick={closeCategoryModal} className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {sortedCategories.map((category, index) => (
                  <div
                    key={category.ID}
                    role="button"
                    tabIndex={0}
                    aria-pressed={editingCategory?.ID === category.ID}
                    onClick={() => toggleCategoryEdit(category)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggleCategoryEdit(category);
                    }}
                    className={`grid cursor-pointer grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 py-2 outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-orange-500/30 ${
                      editingCategory?.ID === category.ID
                        ? "border-gray-950 bg-orange-50/70 shadow-[inset_3px_0_0_#f97316] dark:border-white/80 dark:bg-orange-950/20"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-gray-900/60"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-[13px] font-medium ${!category.is_active ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"}`}>{category.name}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{categoryCounts[category.ID] ?? 0} {copy.menuSummary}</p>
                    </div>
                    <div className="flex gap-1">
                      <span className="flex overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                        <button
                          type="button"
                          disabled={submitting || index === 0}
                          aria-label={language === "th" ? "เลื่อนขึ้น" : "Move up"}
                          title={language === "th" ? "เลื่อนขึ้น" : "Move up"}
                          onClick={(event) => {
                            event.stopPropagation();
                            void moveCategoryOrder(category.ID, -1);
                          }}
                          className="grid h-8 w-8 place-items-center text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-300 dark:hover:bg-gray-900"
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={submitting || index === sortedCategories.length - 1}
                          aria-label={language === "th" ? "เลื่อนลง" : "Move down"}
                          title={language === "th" ? "เลื่อนลง" : "Move down"}
                          onClick={(event) => {
                            event.stopPropagation();
                            void moveCategoryOrder(category.ID, 1);
                          }}
                          className="grid h-8 w-8 place-items-center border-l border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </span>
                      <button type="button" disabled={submitting} onClick={(event) => { event.stopPropagation(); setDeleteTarget({ type: "category", id: category.ID, name: category.name }); }} className="h-8 rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>
                    </div>
                  </div>
                ))}
                {!sortedCategories.length && <p className="rounded-md border border-gray-200 px-3 py-6 text-center text-[12px] text-gray-500 dark:border-gray-800">{copy.noCategories}</p>}
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
                <button disabled={submitting} className="ui-press h-10 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                  {editingCategory ? copy.saveCategory : copy.createCategory}
                </button>
                {categoryError ? (
                  <p className="text-[11px] font-medium text-red-600 dark:text-red-300">{categoryError}</p>
                ) : (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{language === "th" ? "คลิกหมวดเพื่อแก้ชื่อ ใช้ปุ่มลูกศรเพื่อจัดลำดับ" : "Click a category to edit it. Use arrows to reorder."}</p>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {drawerOpen && canManage && (
        <>
          <button type="button" aria-label={copy.cancel} {...itemDrawerBackdrop} className={`${drawerClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-30 cursor-default bg-gray-950/45 backdrop-blur-sm`} />
          <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center px-3 pb-3 pt-10 sm:items-center sm:p-6">
          <form onSubmit={saveItem} className={`${drawerClosing ? "motion-dialog-exit" : "motion-dialog"} pointer-events-auto flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{copy.editorTitle}</p>
                <h2 className="mt-0.5 truncate text-[16px] font-semibold text-gray-900 dark:text-white">{editingItem ? copy.editItem : copy.addItem}</h2>
              </div>
              <button type="button" onClick={closeItemDrawer} className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
            </div>
            <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800 sm:px-5">
              <div className="flex gap-2 overflow-x-auto">
                {([
                  { id: "basic", label: language === "th" ? "ข้อมูลหลัก" : "Basic info" },
                  { id: "options", label: language === "th" ? "ตัวเลือก" : "Options" },
                  { id: "recipe", label: language === "th" ? "สูตร/สต็อก" : "Recipe/stock" },
                ] as { id: ItemEditorTab; label: string }[]).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setItemEditorTab(tab.id)}
                    className={`h-9 shrink-0 rounded-md border px-3 text-[12px] font-medium transition-colors ${
                      itemEditorTab === tab.id
                        ? "border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200"
                        : "border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:text-orange-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-orange-700 dark:hover:text-orange-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {itemEditorTab === "basic" && (
                <div className="mx-auto max-w-2xl">
                  <div className="space-y-4">
                <div className="rounded-md border border-gray-200 dark:border-gray-800">
                  <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                    <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.itemCategories}</span>
                  </div>
                  <div className="space-y-3 p-3">
                    {sortedCategories.length ? (
                      <div className="flex flex-wrap gap-2">
                        {sortedCategories.map((category) => {
                          const selected = selectedCategoryIds.includes(category.ID);
                          return (
                            <button
                              key={category.ID}
                              type="button"
                              onClick={() => toggleSelectedCategory(category.ID)}
                              className={`inline-flex h-8 items-center rounded-[4px] border px-3 text-[12px] font-medium transition-[background-color,border-color,color,box-shadow] ${
                                selected
                                  ? "border-orange-300 bg-orange-50 text-orange-800 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.2)] dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-orange-300 hover:bg-gray-50 hover:text-orange-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-orange-700 dark:hover:bg-gray-900 dark:hover:text-orange-200"
                              }`}
                            >
                              {category.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-md bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:bg-gray-900 dark:text-gray-400">{copy.createCategoryFirst}</p>
                    )}
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-md bg-gray-50 p-2 dark:bg-gray-900/70">
                      <input
                        value={inlineCategoryName}
                        onChange={(event) => {
                          setInlineCategoryName(event.target.value);
                          setInlineCategoryError("");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void createInlineCategory();
                          }
                        }}
                        placeholder={copy.inlineCategoryPlaceholder}
                        className="h-9 min-w-0 rounded-md border border-gray-200 bg-white px-3 text-[12px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-950"
                      />
                      <button
                        type="button"
                        disabled={inlineCategorySaving || !inlineCategoryName.trim()}
                        onClick={createInlineCategory}
                        className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-800 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:border-orange-700 dark:hover:text-orange-200"
                      >
                        {inlineCategorySaving ? "..." : copy.createCategory}
                      </button>
                    </div>
                    {(itemErrors.category || inlineCategoryError) && (
                      <p className="text-[11px] font-medium text-red-600 dark:text-red-300">{itemErrors.category || inlineCategoryError}</p>
                    )}
                  </div>
                </div>
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
                    <div className="h-24 rounded-md bg-gray-100 bg-cover bg-center dark:bg-gray-900" style={{ backgroundImage: `url(${itemForm.image_url || "/menu-placeholder-v2.webp"})` }} />
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
                  </div>
                </div>
              )}
              {itemEditorTab === "options" && (
                <div className="rounded-md border border-gray-200 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                    <div>
                      <p className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.optionsTitle}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{copy.optionsHint}</p>
                    </div>
                    <button type="button" onClick={() => updateOptionGroups((groups) => [...groups, emptyOptionGroup()])} className="h-8 shrink-0 rounded-md border border-gray-200 px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                      {copy.addOptionGroup}
                    </button>
                  </div>
                  <div className="space-y-3 p-3">
                    {(itemForm.option_groups ?? []).map((group, groupIndex) => (
                      <div key={groupIndex} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                        <div className="flex items-start justify-between gap-2">
                          <label className="min-w-0 flex-1">
                            <span className="mb-1.5 block text-[11px] font-medium text-gray-500">{copy.optionGroupName}</span>
                            <input value={group.name} onChange={(event) => updateOptionGroup(groupIndex, { name: event.target.value })} placeholder={copy.optionGroupPlaceholder} className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[12px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
                          </label>
                          <button type="button" onClick={() => updateOptionGroups((groups) => groups.filter((_, index) => index !== groupIndex))} className="mt-6 h-8 rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20">
                            {copy.removeOptionGroup}
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="flex h-9 items-center gap-2 rounded-md border border-gray-200 px-3 text-[12px] dark:border-gray-800">
                            <input type="checkbox" checked={group.required} onChange={(event) => updateOptionGroup(groupIndex, { required: event.target.checked, min_select: event.target.checked ? 1 : 0 })} />
                            {copy.requiredOption}
                          </label>
                          <label>
                            <span className="sr-only">{copy.maxSelect}</span>
                            <input type="number" min={1} value={group.max_select || 1} onChange={(event) => updateOptionGroup(groupIndex, { max_select: Number(event.target.value) || 1 })} title={copy.maxSelect} className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[12px] dark:border-gray-700 dark:bg-gray-900" />
                          </label>
                        </div>
                        <div className="mt-3 space-y-2">
                          {group.options.map((option, optionIndex) => (
                            <div key={optionIndex} className="grid grid-cols-[1fr_88px_auto] gap-2">
                              <input value={option.name} onChange={(event) => updateOption(groupIndex, optionIndex, { name: event.target.value })} placeholder={copy.optionNamePlaceholder} className="h-9 min-w-0 rounded-md border border-gray-200 bg-white px-3 text-[12px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
                              <input type="number" min={0} value={option.price_delta || ""} onChange={(event) => updateOption(groupIndex, optionIndex, { price_delta: Number(event.target.value) || 0 })} placeholder={copy.optionPrice} className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-[12px] dark:border-gray-700 dark:bg-gray-900" />
                              <button type="button" onClick={() => updateOptionGroups((groups) => groups.map((currentGroup, currentGroupIndex) => currentGroupIndex === groupIndex ? { ...currentGroup, options: currentGroup.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) } : currentGroup))} className="h-9 rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20">
                                {copy.removeOption}
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => updateOptionGroups((groups) => groups.map((currentGroup, currentGroupIndex) => currentGroupIndex === groupIndex ? { ...currentGroup, options: [...currentGroup.options, { name: "", price_delta: 0, is_default: false, display_order: currentGroup.options.length, is_active: true }] } : currentGroup))} className="h-8 rounded-md border border-gray-200 px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
                            {copy.addOption}
                          </button>
                        </div>
                      </div>
                    ))}
                    {itemErrors.options && <p className="text-[11px] font-medium text-red-600 dark:text-red-300">{itemErrors.options}</p>}
                  </div>
                </div>
              )}
              {itemEditorTab === "recipe" && (
                <div className="rounded-md border border-gray-200 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                    <div>
                      <p className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.recipeTitle}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{copy.recipeHint}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!recipeIngredients.length}
                      onClick={() => updateRecipeComponents((components) => [...components, emptyRecipeComponent()])}
                      className="h-8 shrink-0 rounded-md border border-gray-200 px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                    >
                      {copy.addRecipeComponent}
                    </button>
                  </div>
                  <div className="space-y-3 p-3">
                    {!recipeIngredients.length && (
                      <p className="rounded-md bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:bg-gray-900 dark:text-gray-400">{copy.noIngredients}</p>
                    )}
                    {(itemForm.ingredients ?? []).map((component, componentIndex) => {
                      const selectedIngredient = recipeIngredients.find((ingredient) => ingredient.ID === component.ingredient_id);
                      return (
                        <div key={componentIndex} className="grid gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                          <ThemedSelect
                            value={String(component.ingredient_id || 0)}
                            onChange={(next) => {
                              const ingredient = recipeIngredients.find((item) => item.ID === Number(next));
                              updateRecipeComponents((components) => components.map((current, index) => index === componentIndex ? { ...current, ingredient_id: Number(next), unit: ingredient?.unit ?? current.unit } : current));
                            }}
                            options={[{ value: "0", label: copy.ingredient }, ...recipeIngredients.map((ingredient) => ({ value: String(ingredient.ID), label: `${ingredient.name} (${ingredient.unit})` }))]}
                          />
                          <div className="grid grid-cols-[1fr_80px_auto] gap-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={component.quantity || ""}
                              onChange={(event) => updateRecipeComponents((components) => components.map((current, index) => index === componentIndex ? { ...current, quantity: Number(event.target.value) || 0 } : current))}
                              placeholder={copy.quantity}
                              className="h-9 min-w-0 rounded-md border border-gray-200 bg-white px-3 text-[12px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900"
                            />
                            <input
                              value={component.unit || selectedIngredient?.unit || ""}
                              onChange={(event) => updateRecipeComponents((components) => components.map((current, index) => index === componentIndex ? { ...current, unit: event.target.value } : current))}
                              placeholder={copy.unit}
                              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[12px] dark:border-gray-700 dark:bg-gray-900"
                            />
                            <button
                              type="button"
                              onClick={() => updateRecipeComponents((components) => components.filter((_, index) => index !== componentIndex))}
                              className="h-9 rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                              {copy.removeComponent}
                            </button>
                          </div>
                          <input
                            value={component.note || ""}
                            onChange={(event) => updateRecipeComponents((components) => components.map((current, index) => index === componentIndex ? { ...current, note: event.target.value } : current))}
                            placeholder={copy.note}
                            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] dark:border-gray-700 dark:bg-gray-900"
                          />
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-[12px] dark:bg-gray-900">
                      <span className="font-medium text-gray-500 dark:text-gray-400">{copy.recipeCost}</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(recipeCost(itemForm.ingredients ?? [], recipeIngredients), language, 2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="grid gap-2 border-t border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-[1fr_auto]">
              <button disabled={submitting || uploadingImage || !categories.length} className="ui-press h-10 rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                {editingItem ? copy.saveItem : copy.createItem}
              </button>
              {editingItem ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setDeleteTarget({ type: "item", id: editingItem.ID, name: editingItem.name })}
                  className="ui-press h-10 rounded-md border border-red-200 bg-white px-4 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:bg-gray-950 dark:text-red-300 dark:hover:bg-red-900/20"
                >
                  {copy.delete}
                </button>
              ) : null}
              {itemErrors.submit && <p className="mt-2 text-[11px] font-medium text-red-600 dark:text-red-300">{itemErrors.submit}</p>}
            </div>
          </form>
          </div>
        </>
      )}

      {deleteTarget && (
        <div {...deleteBackdrop} className={`${deleteClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`}>
          <div className={`${deleteClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950`}>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.confirmDeleteTitle}</h2>
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.confirmDeleteBody}</p>
            </div>
            <div className="px-4 py-3">
              <p className="truncate text-[13px] font-medium text-gray-900 dark:text-white">{deleteTarget.name}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <button type="button" onClick={() => closeDeleteModal()} disabled={submitting} className="ui-press h-9 rounded-md border border-gray-200 px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
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
