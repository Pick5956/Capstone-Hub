"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import { getCustomerTableOrder, submitCustomerTableOrder, type CustomerCartItemInput, type CustomerTablePayload } from "@/src/lib/customerOrder";
import { apiErrorMessage } from "@/src/lib/apiErrors";
import { menuCategoryIds, menuOptionLimits } from "@/src/lib/menuUtils";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import { useLanguage } from "@/src/providers/LanguageProvider";
import LanguageToggle from "@/src/components/shared/LanguageToggle";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import type { MenuItem } from "@/src/types/menu";

type CartItem = CustomerCartItemInput & {
  key: string;
  name: string;
  unit_price: number;
  options_total: number;
  selected_options: { id: number; group: string; name: string; price_delta: number }[];
};

export default function CustomerTableOrderPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { language } = useLanguage();
  const [payload, setPayload] = useState<CustomerTablePayload | null>(null);
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [selectedMenuClosing, setSelectedMenuClosing] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryClosing, setSummaryClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const copy = language === "th"
    ? {
        loading: "กำลังโหลดเมนู",
        loadError: "โหลดหน้าโต๊ะไม่สำเร็จ ลองสแกน QR ใหม่อีกครั้ง",
        all: "ทั้งหมด",
        search: "ค้นหาเมนู",
        noMenu: "ยังไม่มีเมนูที่สั่งได้",
        category: "หมวดหมู่เมนู",
        add: "เพิ่ม",
        addToCart: "เพิ่มลงตะกร้า",
        required: "ต้องเลือก",
        chooseRequired: "เลือกตัวเลือกที่จำเป็นให้ครบก่อน",
        quantity: "จำนวน",
        note: "หมายเหตุ",
        cart: "ตะกร้า",
        emptyCart: "ยังไม่มีรายการในตะกร้า",
        submit: "ส่งออเดอร์เข้าครัว",
        reviewOrder: "ตรวจสอบรายการ",
        summaryTitle: "สรุปรายการที่จะสั่งเพิ่ม",
        summaryHint: "ตรวจรายการก่อนส่งเข้าครัว รายการจะเข้าเป็นรอบใหม่ของโต๊ะนี้",
        noActiveOrderTitle: "โต๊ะนี้ยังไม่เปิดรับออเดอร์",
        noActiveOrderBody: "กรุณาเรียกพนักงานให้เปิดโต๊ะในระบบก่อน ลูกค้าจึงจะสั่งอาหารผ่าน QR ได้",
        submitting: "กำลังส่ง",
        submitted: "ส่งออเดอร์เข้าครัวแล้ว",
        currentOrder: "รายการที่ส่งแล้ว",
        currentRound: "รายการรอบนี้",
        itemUnit: "รายการ",
        added: "เพิ่มแล้ว",
        noImage: "ไม่มีรูป",
        total: "รวม",
        close: "ปิด",
        remove: "ลบ",
        table: "โต๊ะ",
        openTime: "เวลาเปิด",
      }
    : {
        loading: "Loading menu",
        loadError: "Could not load this table. Scan the QR code again.",
        all: "All",
        search: "Search menu",
        noMenu: "No menu items available",
        category: "Menu category",
        add: "Add",
        addToCart: "Add to cart",
        required: "Required",
        chooseRequired: "Choose required options first.",
        quantity: "Qty",
        note: "Note",
        cart: "Cart",
        emptyCart: "No items in cart",
        submit: "Send order to kitchen",
        reviewOrder: "Review order",
        summaryTitle: "Review items to add",
        summaryHint: "Check the items before sending. They will be sent as a new round for this table.",
        noActiveOrderTitle: "This table is not open yet",
        noActiveOrderBody: "Ask staff to open this table in POS before guests can order from the QR code.",
        submitting: "Sending",
        submitted: "Order sent to kitchen",
        currentOrder: "Sent items",
        currentRound: "Current round",
        itemUnit: "items",
        added: "Added",
        noImage: "No image",
        total: "Total",
        close: "Close",
        remove: "Remove",
        table: "Table",
        openTime: "Open",
      };

  const optionLimitLabel = (selected: number, minSelect: number, maxSelect: number) => {
    if (maxSelect <= 1) return selected ? (language === "th" ? "เลือกแล้ว" : "Selected") : (language === "th" ? "เลือก 1 อย่าง" : "Choose 1");
    const range = minSelect > 0 && minSelect !== maxSelect ? `${minSelect}-${maxSelect}` : String(maxSelect);
    return language === "th" ? `เลือก ${selected}/${range}` : `${selected}/${range} selected`;
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getCustomerTableOrder(token);
      setPayload(res.data);
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, language]);

  const categories = useMemo(() => payload?.categories ?? [], [payload?.categories]);
  const menuItems = useMemo(() => payload?.menu_items ?? [], [payload?.menu_items]);
  const categoryOptions = useMemo(() => [
    { value: "all", label: copy.all },
    ...categories.map((category) => ({ value: String(category.ID), label: category.name })),
  ], [categories, copy.all]);
  const filteredMenu = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (categoryId !== "all" && !menuCategoryIds(item).includes(categoryId)) return false;
      if (keyword && !item.name.toLowerCase().includes(keyword)) return false;
      return item.is_available;
    });
  }, [categoryId, menuItems, search]);

  const selectedOptions = useMemo(() => {
    if (!selectedMenu) return [];
    return (selectedMenu.option_groups ?? []).flatMap((group) =>
      (group.options ?? [])
        .filter((option) => selectedOptionIds.includes(option.ID))
        .map((option) => ({ id: option.ID, group: group.name, name: option.name, price_delta: option.price_delta }))
    );
  }, [selectedMenu, selectedOptionIds]);

  const selectedOptionsTotal = selectedOptions.reduce((sum, option) => sum + option.price_delta, 0);
  const requiredOptionsMissing = Boolean(selectedMenu?.option_groups?.some((group) => {
    if (!group.is_active) return false;
    const { minSelect } = menuOptionLimits(group);
    if (minSelect <= 0) return false;
    const count = (group.options ?? []).filter((option) => option.is_active && selectedOptionIds.includes(option.ID)).length;
    return count < minSelect;
  }));
  const cartTotal = cart.reduce((sum, item) => sum + (item.unit_price + item.options_total) * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartMenuQuantities = useMemo(() => {
    const quantities = new Map<number, number>();
    for (const item of cart) {
      quantities.set(item.menu_id, (quantities.get(item.menu_id) ?? 0) + item.quantity);
    }
    return quantities;
  }, [cart]);
  const sentItems = payload?.order?.items ?? [];
  const canOrder = Boolean(payload?.order);

  const openMenu = (item: MenuItem) => {
    if (!canOrder) {
      setError(copy.noActiveOrderBody);
      return;
    }
    const defaultOptionIds = (item.option_groups ?? []).flatMap((group) => {
      const { maxSelect } = menuOptionLimits(group);
      return (group.options ?? [])
        .filter((option) => option.is_active && option.is_default)
        .slice(0, maxSelect)
        .map((option) => option.ID);
    });
    setSelectedMenuClosing(false);
    setSelectedMenu(item);
    setSelectedOptionIds(defaultOptionIds);
    setQuantity(1);
    setNote("");
    setSuccess("");
    setError("");
  };

  const closeMenu = () => {
    if (selectedMenuClosing) return;
    setSelectedMenuClosing(true);
    window.setTimeout(() => {
      setSelectedMenu(null);
      setSelectedOptionIds([]);
      setSelectedMenuClosing(false);
    }, 180);
  };

  const toggleOption = (groupOptionIds: number[], optionId: number, minSelect: number, maxSelect: number) => {
    setSelectedOptionIds((current) => {
      const selectedInGroup = current.filter((id) => groupOptionIds.includes(id));
      const withoutGroup = current.filter((id) => !groupOptionIds.includes(id));
      if (selectedInGroup.includes(optionId)) {
        if (selectedInGroup.length <= minSelect) return current;
        return [...withoutGroup, ...selectedInGroup.filter((id) => id !== optionId)];
      }
      if (maxSelect <= 1) return [...withoutGroup, optionId];
      if (selectedInGroup.length >= maxSelect) return current;
      return [...withoutGroup, ...selectedInGroup, optionId];
    });
  };

  const openSummary = () => {
    if (!canOrder) {
      setError(copy.noActiveOrderBody);
      return;
    }
    if (!cart.length) return;
    setSummaryClosing(false);
    setSummaryOpen(true);
  };

  const increaseCartItem = (key: string) => {
    setCart((current) => current.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item));
  };

  const decreaseCartItem = (key: string) => {
    setCart((current) => current.flatMap((item) => {
      if (item.key !== key) return [item];
      if (item.quantity <= 1) return [];
      return [{ ...item, quantity: item.quantity - 1 }];
    }));
  };

  const removeCartItem = (key: string) => {
    setCart((current) => current.filter((item) => item.key !== key));
  };

  const closeSummary = () => {
    if (summaryClosing) return;
    setSummaryClosing(true);
    window.setTimeout(() => {
      setSummaryOpen(false);
      setSummaryClosing(false);
    }, 180);
  };
  const summaryBackdrop = useBackdropClose(closeSummary);
  const menuBackdrop = useBackdropClose(closeMenu);

  const addToCart = () => {
    if (!canOrder || !selectedMenu || requiredOptionsMissing) return;
    const item: CartItem = {
      key: `${selectedMenu.ID}-${Date.now()}-${Math.random()}`,
      menu_id: selectedMenu.ID,
      name: selectedMenu.name,
      unit_price: selectedMenu.price,
      options_total: selectedOptionsTotal,
      quantity,
      note: note.trim(),
      selected_option_ids: selectedOptionIds,
      selected_options: selectedOptions,
    };
    setCart((current) => [...current, item]);
    closeMenu();
  };

  const submitOrder = async () => {
    if (!canOrder || !cart.length) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await submitCustomerTableOrder(token, {
        items: cart.map(({ menu_id, quantity, note, selected_option_ids }) => ({ menu_id, quantity, note, selected_option_ids })),
      });
      setPayload(res.data);
      setCart([]);
      setSuccess(copy.submitted);
      closeSummary();
    } catch (err) {
      setError(apiErrorMessage(err) || copy.loadError);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">{copy.loading}</div>;
  }

  if (error && !payload) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center text-sm text-red-600 dark:bg-gray-950 dark:text-red-300">{error}</div>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 pb-32 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[12px] text-orange-600 dark:text-orange-400">{payload?.restaurant.name}</p>
            <h1 className="truncate text-lg font-semibold">{copy.table} {payload?.table.display_label || payload?.table.table_number}</h1>
            <p className="truncate text-[11px] text-gray-500">{copy.openTime} {payload?.restaurant.open_time}-{payload?.restaurant.close_time}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4">
        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        {success && <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">{success}</div>}
        {!canOrder && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            <p className="font-semibold text-amber-900 dark:text-amber-100">{copy.noActiveOrderTitle}</p>
            <p>{copy.noActiveOrderBody}</p>
          </div>
        )}

        <div className="mb-3 rounded-md border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{copy.category}</span>
            <ThemedSelect
              value={categoryId === "all" ? "all" : String(categoryId)}
              onChange={(next) => setCategoryId(next === "all" ? "all" : Number(next))}
              options={categoryOptions}
              className="w-full"
            />
          </label>
        </div>

        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="mb-4 h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-[16px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-800 dark:bg-gray-950" />

        {filteredMenu.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredMenu.map((item) => {
              const orderedQuantity = cartMenuQuantities.get(item.ID) ?? 0;

              return (
                <button key={item.ID} type="button" onClick={() => openMenu(item)} disabled={!canOrder} className={`ui-press relative flex min-h-[214px] flex-col overflow-hidden rounded-md border bg-white text-left shadow-sm transition-[border-color,background-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-55 dark:bg-gray-950 sm:hover:-translate-y-0.5 ${orderedQuantity > 0 ? "border-orange-300 shadow-[0_0_0_1px_rgba(249,115,22,0.18)] hover:bg-orange-50/30 dark:border-orange-700/70 dark:shadow-[0_0_0_1px_rgba(251,146,60,0.18)] dark:hover:bg-orange-900/10" : "border-gray-200 hover:border-orange-200 hover:bg-orange-50/20 dark:border-gray-800 dark:hover:border-orange-900/50 dark:hover:bg-orange-900/10"}`}>
                  {orderedQuantity > 0 && (
                    <span className="absolute right-2 top-2 z-10 rounded-md bg-orange-500 px-2 py-1 text-[11px] font-semibold text-white shadow-md shadow-orange-950/10 dark:bg-orange-400 dark:text-gray-950 dark:shadow-black/30">
                      {copy.added} x{orderedQuantity}
                    </span>
                  )}
                  <div className="aspect-[4/3] bg-gray-100 bg-cover bg-center dark:bg-gray-900" style={item.image_url ? { backgroundImage: `url(${item.image_url})` } : undefined} aria-label={item.image_url ? `${item.name}` : undefined}>
                    {!item.image_url && <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-gray-400">{copy.noImage}</div>}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col border-t border-gray-100 p-3 dark:border-gray-800">
                    <h2 className="truncate text-[15px] font-semibold text-gray-900 dark:text-white">{item.name}</h2>
                    <p className="mt-auto pt-2 text-right font-mono text-[20px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{item.price.toLocaleString()}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-12 text-center text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-950">{copy.noMenu}</div>
        )}

        {sentItems.length ? (
          <section className="mt-5 rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold">{copy.currentOrder}</h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {sentItems.map((item) => (
                <div key={item.ID} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-[13px]">
                  <div>
                    <p className="font-semibold">{item.quantity}x {item.menu_name}</p>
                    {item.selected_options?.map((option) => <p key={option.ID} className="mt-0.5 text-[11px] text-gray-500">{option.group_name}: {option.option_name}</p>)}
                  </div>
                  <p className="font-mono font-semibold tabular-nums">฿{item.subtotal.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <div className="fixed inset-x-3 bottom-3 z-30 rounded-md border border-gray-200 bg-white/95 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.2)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 dark:shadow-black/40">
        <div className="mx-auto max-w-5xl">
          <div className="mb-2 grid grid-cols-[1fr_auto] items-stretch gap-2">
            <div className="min-w-0 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
              <span className="block text-[10px] font-medium text-gray-500 dark:text-gray-400">{copy.currentRound}</span>
              <span className="mt-0.5 block truncate font-mono text-[16px] font-semibold tabular-nums text-gray-900 dark:text-white">
                ฿{cartTotal.toLocaleString()}
              </span>
            </div>
            <div className="flex min-w-[76px] flex-col justify-center rounded-md border border-gray-200 px-3 text-center dark:border-gray-800">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{copy.cart}</span>
              <span className="font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">{cartItemCount}</span>
            </div>
          </div>
          <button type="button" onClick={openSummary} disabled={!canOrder || !cartItemCount || submitting} className="h-12 w-full rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
            {submitting ? copy.submitting : copy.reviewOrder}
          </button>
        </div>
      </div>

      {summaryOpen && (
        <div {...summaryBackdrop} className={`${summaryClosing ? "motion-overlay-exit" : "motion-overlay"} fixed left-0 top-0 z-40 h-dvh w-dvw max-w-full bg-gray-950/45 p-3 backdrop-blur-sm`}>
          <div className="fixed left-1/2 top-1/2 w-[calc(100dvw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2">
            <div className={`${summaryClosing ? "motion-dialog-exit" : "motion-dialog"} flex max-h-[calc(100dvh-1.5rem)] min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
              <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white">{copy.summaryTitle}</h2>
                <p className="mt-1 text-[12px] leading-5 text-gray-500 dark:text-gray-400">{copy.summaryHint}</p>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-gray-200 overflow-y-auto overscroll-contain dark:divide-gray-800">
                {cart.map((item) => (
                  <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-[13px]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">{item.name}</p>
                      {item.selected_options.map((option) => <p key={option.id} className="mt-0.5 text-[11px] text-gray-500">{option.group}: {option.name}</p>)}
                      {item.note ? <p className="mt-1 text-[11px] text-gray-500">{copy.note}: {item.note}</p> : null}
                      <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-gray-900 dark:text-white">฿{((item.unit_price + item.options_total) * item.quantity).toLocaleString()}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => decreaseCartItem(item.key)} disabled={submitting} className="ui-press h-9 w-9 rounded-md border border-gray-200 text-[16px] font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900">-</button>
                      <span className="min-w-6 text-center font-mono text-[14px] font-semibold tabular-nums">{item.quantity}</span>
                      <button type="button" onClick={() => increaseCartItem(item.key)} disabled={submitting} className="ui-press h-9 w-9 rounded-md border border-gray-200 text-[16px] font-semibold hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900">+</button>
                      <button type="button" onClick={() => removeCartItem(item.key)} disabled={submitting} className="ui-press h-9 rounded-md border border-red-200 px-2.5 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20">{copy.remove}</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="shrink-0 space-y-3 border-t border-gray-200 p-4 dark:border-gray-800">
                <div className="flex items-center justify-between text-[14px] font-semibold">
                  <span>{copy.total}</span>
                  <span className="font-mono tabular-nums">฿{cartTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeSummary} className="h-10 rounded-md border border-gray-200 px-3 text-[12px] font-semibold dark:border-gray-800">{copy.close}</button>
                  <button type="button" onClick={submitOrder} disabled={submitting || !cartItemCount} className="h-10 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{submitting ? copy.submitting : copy.submit}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedMenu && (
        <div {...menuBackdrop} className={`${selectedMenuClosing ? "motion-overlay-exit" : "motion-overlay"} fixed left-0 top-0 z-40 h-dvh w-dvw max-w-full bg-gray-950/45 p-3 backdrop-blur-sm`}>
          <div className="fixed left-1/2 top-1/2 w-[calc(100dvw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2">
            <div className={`${selectedMenuClosing ? "motion-dialog-exit" : "motion-dialog"} max-h-[calc(100dvh-1.5rem)] overflow-auto rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
              <div className="relative aspect-[4/3] rounded-t-md bg-gray-100 bg-cover bg-center dark:bg-gray-900" style={selectedMenu.image_url ? { backgroundImage: `url(${selectedMenu.image_url})` } : undefined}>
                <button type="button" aria-label={copy.close} onClick={closeMenu} className="ui-press absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/70 bg-white/95 text-gray-700 shadow-md shadow-gray-950/15 hover:bg-white dark:border-gray-700 dark:bg-gray-950/90 dark:text-gray-200 dark:shadow-black/30">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <h2 className="min-w-0 text-[16px] font-semibold">{selectedMenu.name}</h2>
                  <p className="shrink-0 text-right font-mono text-lg font-semibold tabular-nums">฿{((selectedMenu.price + selectedOptionsTotal) * quantity).toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">
                  {selectedMenu.description?.trim() ? selectedMenu.description : "..."}
                </p>
                {selectedMenu.option_groups?.filter((group) => group.is_active).map((group) => {
                  const options = (group.options ?? []).filter((option) => option.is_active);
                  const { minSelect, maxSelect } = menuOptionLimits(group);
                  const selectedCount = options.filter((option) => selectedOptionIds.includes(option.ID)).length;
                  return (
                    <div key={group.ID}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px] font-medium">
                        <span>{group.name}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                            {optionLimitLabel(selectedCount, minSelect, maxSelect)}
                          </span>
                          {group.required && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">{copy.required}</span>}
                        </div>
                      </div>
                      <div className="grid gap-2">
                        {options.map((option) => {
                          const selected = selectedOptionIds.includes(option.ID);
                          const limitReached = maxSelect > 1 && selectedCount >= maxSelect && !selected;
                          return (
                            <button key={option.ID} type="button" disabled={limitReached} aria-pressed={selected} onClick={() => toggleOption(options.map((current) => current.ID), option.ID, minSelect, maxSelect)} className={`grid min-h-10 grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 text-left text-[12px] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900" : "border-gray-200 text-gray-700 dark:border-gray-800 dark:text-gray-300"}`}>
                              <span>{option.name}</span>
                              <span className="font-mono">{option.price_delta ? `+฿${option.price_delta.toLocaleString()}` : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium">{copy.quantity}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="h-10 w-10 rounded-md border border-gray-200 text-lg font-semibold dark:border-gray-800">-</button>
                    <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="h-10 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 text-center text-[16px] dark:border-gray-800 dark:bg-gray-900" />
                    <button type="button" onClick={() => setQuantity((current) => current + 1)} className="h-10 w-10 rounded-md border border-gray-200 text-lg font-semibold dark:border-gray-800">+</button>
                  </div>
                </label>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.note} className="min-h-20 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-[16px] dark:border-gray-800 dark:bg-gray-900" />
                {requiredOptionsMissing && <p className="text-[12px] font-medium text-red-600 dark:text-red-300">{copy.chooseRequired}</p>}
              </div>
              <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                <button type="button" onClick={addToCart} disabled={requiredOptionsMissing} className="h-11 w-full rounded-md bg-gray-900 px-3 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{copy.add}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
