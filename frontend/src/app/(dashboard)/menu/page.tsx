"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { can } from "@/src/lib/rbac";
import { createCategory, createMenuItem, deleteCategory, deleteMenuItem, listCategories, listMenuItems, updateCategory, updateMenuItem, uploadMenuImage } from "@/src/lib/menu";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { Category, MenuItem, MenuItemInput } from "@/src/types/menu";
import { RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import ThemedSelect from "@/src/components/shared/ThemedSelect";

const emptyItem: MenuItemInput = { category_id: 0, name: "", price: 0, image_url: "", description: "", is_available: true, display_order: 0 };

export default function MenuPage() {
  const { activeMembership } = useAuth();
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
  const actionOnceRef = useRef(createSingleFlight());

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
      setError("โหลดข้อมูลเมนูไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatch = !filterCategory || item.category_id === filterCategory;
      const searchMatch = !keyword || item.name.toLowerCase().includes(keyword) || item.description.toLowerCase().includes(keyword);
      return categoryMatch && searchMatch;
    });
  }, [filterCategory, items, search]);

  if (!canView) return <PermissionDenied title="ไม่มีสิทธิ์ดูเมนู" />;

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const name = categoryName.trim();
    if (!name) {
      setError("กรุณากรอกชื่อหมวดหมู่");
      return;
    }
    await actionOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
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
        setError("บันทึกหมวดหมู่ไม่สำเร็จ");
      } finally {
        setSubmitting(false);
      }
    });
  };

  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (!itemForm.category_id || !itemForm.name.trim()) {
      setError("กรุณาเลือกหมวดหมู่และกรอกชื่อเมนู");
      return;
    }
    await actionOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
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
      } catch {
        setError("บันทึกเมนูไม่สำเร็จ");
      } finally {
        setSubmitting(false);
      }
    });
  };

  const editCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryOrder(String(category.display_order));
  };

  const editItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({
      category_id: item.category_id,
      name: item.name,
      price: item.price,
      image_url: item.image_url,
      description: item.description,
      is_available: item.is_available,
      display_order: item.display_order,
    });
  };

  const removeCategory = async (category: Category) => {
    if (!canManage) return;
    await actionOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        await deleteCategory(category.ID);
        await refresh();
      } catch {
        setError("ลบหมวดหมู่ไม่สำเร็จ");
      } finally {
        setSubmitting(false);
      }
    });
  };

  const removeItem = async (item: MenuItem) => {
    if (!canManage) return;
    await actionOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        await deleteMenuItem(item.ID);
        setItems((current) => current.filter((menuItem) => menuItem.ID !== item.ID));
      } catch {
        setError("ลบเมนูไม่สำเร็จ");
      } finally {
        setSubmitting(false);
      }
    });
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    setUploadingImage(true);
    setError("");
    try {
      const res = await uploadMenuImage(file);
      setItemForm((current) => ({ ...current, image_url: res.data.image_url }));
    } catch {
      setError("อัปโหลดรูปไม่สำเร็จ กรุณาใช้ไฟล์ jpg, png หรือ webp ขนาดไม่เกิน 5MB");
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Menu</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">เมนูอาหาร</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{canManage ? "จัดการหมวดหมู่และเมนูของร้าน" : "ดูเมนูทั้งหมดแบบ read-only"}</p>
        </div>
        <button type="button" onClick={refresh} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">รีเฟรช</button>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr]">
              <ThemedSelect
                value={String(filterCategory)}
                onChange={(next) => setFilterCategory(Number(next))}
                options={[
                  { value: "0", label: "ทุกหมวดหมู่" },
                  ...categories.map((category) => ({ value: String(category.ID), label: category.name })),
                ]}
              />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเมนู" className="h-10 rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" />
            </div>
          </div>

          {loading ? (
            <div className="space-y-3"><RestaurantCardSkeleton /><RestaurantCardSkeleton /></div>
          ) : filteredItems.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredItems.map((item) => (
                <div key={item.ID} className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex gap-3">
                    <div
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100 bg-cover bg-center dark:bg-gray-900"
                      style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined}
                      aria-label={item.image_url ? `รูปเมนู ${item.name}` : undefined}
                    >
                      {!item.image_url && <div className="flex h-full items-center justify-center text-[11px] text-gray-400">ไม่มีรูป</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-[15px] font-semibold text-gray-900 dark:text-white">{item.name}</h2>
                          <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{item.category?.name ?? "ไม่ระบุหมวด"}</p>
                        </div>
                        <p className="font-mono text-[14px] font-semibold text-gray-900 dark:text-white">฿{item.price.toLocaleString()}</p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[12px] text-gray-500 dark:text-gray-400">{item.description || "ไม่มีรายละเอียด"}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${item.is_available ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400"}`}>{item.is_available ? "พร้อมขาย" : "ปิดขาย"}</span>
                        {canManage && <div className="flex gap-2">
                          <button type="button" onClick={() => editItem(item)} className="text-[12px] font-medium text-orange-600 dark:text-orange-400">แก้ไข</button>
                          <button type="button" disabled={submitting} onClick={() => removeItem(item)} className="text-[12px] font-medium text-red-600 disabled:opacity-50 dark:text-red-300">ลบ</button>
                        </div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-gray-200 bg-white px-4 py-10 text-center dark:border-gray-800 dark:bg-gray-950">
              <p className="text-[14px] font-semibold text-gray-900 dark:text-white">ยังไม่มีเมนู</p>
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{canManage ? "สร้างหมวดหมู่และเพิ่มเมนูแรกจากแผงด้านขวา" : "เจ้าของร้านยังไม่ได้เปิดเมนูให้ดู"}</p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800"><h2 className="text-[14px] font-semibold">หมวดหมู่</h2></div>
            <div className="space-y-2 p-4">
              {categories.map((category) => (
                <div key={category.ID} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-[12px] dark:border-gray-800">
                  <span className={!category.is_active ? "text-gray-400 line-through" : ""}>{category.name}</span>
                  {canManage && <div className="flex gap-2"><button onClick={() => editCategory(category)} className="text-orange-600 dark:text-orange-400">แก้</button><button disabled={submitting} onClick={() => removeCategory(category)} className="text-red-600 disabled:opacity-50 dark:text-red-300">ลบ</button></div>}
                </div>
              ))}
              {!categories.length && <p className="text-[12px] text-gray-500">ยังไม่มีหมวดหมู่</p>}
            </div>
          </div>

          {canManage && <>
            <form onSubmit={saveCategory} className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
              <h2 className="text-[14px] font-semibold">{editingCategory ? "แก้หมวดหมู่" : "เพิ่มหมวดหมู่"}</h2>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">ชื่อหมวดหมู่</span>
                <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="เช่น อาหารจานเดียว / เครื่องดื่ม" className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="mt-2 block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">ลำดับแสดงผลของหมวดหมู่</span>
                <input value={categoryOrder} onChange={(e) => setCategoryOrder(e.target.value)} placeholder="เช่น 1" type="number" className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">เลขน้อยจะแสดงก่อน ถ้าไม่แน่ใจใส่ 0 ได้</p>
              </label>
              <button disabled={submitting} className="mt-3 h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{editingCategory ? "บันทึกหมวดหมู่" : "เพิ่มหมวดหมู่"}</button>
            </form>

            <form onSubmit={saveItem} className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
              <h2 className="text-[14px] font-semibold">{editingItem ? "แก้เมนู" : "เพิ่มเมนู"}</h2>
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">หมวดหมู่เมนู</span>
                  <ThemedSelect
                    value={String(itemForm.category_id)}
                    onChange={(next) => setItemForm({ ...itemForm, category_id: Number(next) })}
                    disabled={!categories.length}
                    options={
                      categories.length
                        ? categories.map((cat) => ({ value: String(cat.ID), label: cat.name }))
                        : [{ value: "0", label: "สร้างหมวดหมู่ก่อนเพิ่มเมนู" }]
                    }
                  />
                  {!categories.length && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">เพิ่มหมวดหมู่ เช่น อาหารจานเดียว / เครื่องดื่ม ก่อน แล้วค่อยเพิ่มเมนูในหมวดนั้น</p>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">ชื่อเมนู</span>
                  <input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="เช่น ข้าวกะเพราหมูสับ" className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">ราคาเมนู (บาท)</span>
                  <input value={itemForm.price || ""} onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value) })} placeholder="เช่น 65" type="number" min={0} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">ลำดับแสดงผลของเมนู</span>
                  <input value={itemForm.display_order || ""} onChange={(e) => setItemForm({ ...itemForm, display_order: Number(e.target.value) })} placeholder="เช่น 1" type="number" className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">เลขน้อยจะแสดงก่อนในหมวดหมู่นั้น ถ้าไม่แน่ใจเว้นว่างได้</p>
                </label>
                <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                  <span className="mb-2 block text-[12px] font-medium text-gray-700 dark:text-gray-300">รูปเมนู</span>
                  <div className="flex gap-3">
                    <div
                      className="h-20 w-20 shrink-0 rounded-md bg-gray-100 bg-cover bg-center dark:bg-gray-900"
                      style={itemForm.image_url ? { backgroundImage: `url(${itemForm.image_url})` } : undefined}
                    >
                      {!itemForm.image_url && <div className="flex h-full items-center justify-center text-[11px] text-gray-400">ไม่มีรูป</div>}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={uploadingImage}
                        onChange={(event) => uploadImage(event.target.files?.[0])}
                        className="block w-full text-[12px] text-gray-500 file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:text-[12px] file:font-semibold file:text-white disabled:opacity-60 dark:text-gray-400 dark:file:bg-white dark:file:text-gray-900"
                      />
                      <input value={itemForm.image_url} onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })} placeholder="หรือวาง URL รูปภาพเอง" className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-[12px] dark:border-gray-700 dark:bg-gray-900" />
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">{uploadingImage ? "กำลังอัปโหลดรูป..." : "รองรับ jpg, png, webp ไม่เกิน 5MB"}</p>
                    </div>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">รายละเอียดเมนู</span>
                  <textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} placeholder="เช่น เผ็ดน้อยได้ เพิ่มไข่ดาวได้" className="h-20 w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
                </label>
                <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={itemForm.is_available} onChange={(e) => setItemForm({ ...itemForm, is_available: e.target.checked })} /> พร้อมขายในหน้าพนักงาน</label>
              </div>
              <button disabled={submitting || uploadingImage || !categories.length} className="mt-3 h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{editingItem ? "บันทึกเมนู" : "เพิ่มเมนู"}</button>
            </form>
          </>}
        </aside>
      </div>
    </div>
  );
}
