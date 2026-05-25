"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { bulkCreateTables, createTableTag, createTableZone, deleteTable, deleteTableTag, deleteTableZone, listTableTags, listTables, listTableZones, moveTableZone, regenerateTableCustomerToken, updateTable, updateTableTag, updateTableZone } from "@/src/lib/table";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { RestaurantTable, RestaurantTableInput, TableStatus, TableTag, TableTagInput, TableZone, TableZoneInput } from "@/src/types/table";
import { Skeleton } from "@/src/components/shared/Skeleton";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { useConfirm, useToast } from "@/src/components/shared/FeedbackProvider";

const emptyTableForm: RestaurantTableInput = { zone_id: null, capacity: 2, status: "free", tag_ids: [] };
const emptyZoneForm: TableZoneInput = { name: "", prefix: "", display_order: 0, is_active: true };
const emptyTagForm: TableTagInput = { name: "", color: "gray", display_order: 0, is_active: true };

function statusMeta(language: "th" | "en") {
  return {
    free: { label: language === "th" ? "ว่าง" : "Free", cls: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200" },
    occupied: { label: language === "th" ? "ใช้งาน" : "Occupied", cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200" },
    reserved: { label: language === "th" ? "จอง" : "Reserved", cls: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-200" },
  } satisfies Record<TableStatus, { label: string; cls: string }>;
}

const tagBadgeClass = "border-gray-950 bg-white/85 text-gray-950 shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06)] dark:border-white/80 dark:bg-gray-950/80 dark:text-white";

function safeQrFileName(label: string) {
  const safeLabel = label.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-") || "table";
  return `qr-${safeLabel}.png`;
}

export default function TablesPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canManage = can(activeMembership, "manage_table");
  const canView = canManage || can(activeMembership, "view_tables");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [tags, setTags] = useState<TableTag[]>([]);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [tableForm, setTableForm] = useState<RestaurantTableInput>(emptyTableForm);
  const [tableDrawerOpen, setTableDrawerOpen] = useState(false);
  const [tableDrawerClosing, setTableDrawerClosing] = useState(false);
  const [bulkCount, setBulkCount] = useState(1);
  const [zoneForm, setZoneForm] = useState<TableZoneInput>(emptyZoneForm);
  const [editingZone, setEditingZone] = useState<TableZone | null>(null);
  const [zoneManagerOpen, setZoneManagerOpen] = useState(false);
  const [tagForm, setTagForm] = useState<TableTagInput>(emptyTagForm);
  const [editingTag, setEditingTag] = useState<TableTag | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "table"; table: RestaurantTable } | { type: "zone"; zone: TableZone } | { type: "tag"; tag: TableTag } | null>(null);
  const [deleteClosing, setDeleteClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const saveOnceRef = useRef(createSingleFlight());
  const deleteOnceRef = useRef(createSingleFlight());
  const qrOnceRef = useRef(createSingleFlight());

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์ดูผังโต๊ะ",
        eyebrow: "Tables",
        title: "ผังโต๊ะ",
        subtitleManage: "จัดโซน เลขโต๊ะ และคุณสมบัติโต๊ะสำหรับร้านทุกขนาด",
        subtitleView: "ดูสถานะโต๊ะและโซนแบบ read-only",
        refresh: "รีเฟรช",
        total: "โต๊ะทั้งหมด",
        occupied: "ใช้งาน",
        reserved: "จอง",
        zones: "โซน",
        allZones: "ทุกโซน",
        noZone: "ไม่มีโซน",
        allTags: "ทุก tag",
        seats: "ที่นั่ง",
        edit: "แก้ไข",
        delete: "ลบ",
        createTable: "เพิ่มโต๊ะ",
        saveTable: "บันทึกโต๊ะ",
        tableEditor: "ตั้งค่าโต๊ะ",
        autoNumber: "เลขโต๊ะออกให้อัตโนมัติ",
        zone: "โซน",
        tags: "Tags",
        capacity: "จำนวนที่นั่ง",
        status: "สถานะ",
        bulkCreate: "สร้างโต๊ะเป็นชุด",
        count: "จำนวนโต๊ะ",
        preview: "ตัวอย่างเลข",
        createBatch: "สร้างชุดโต๊ะ",
        zoneManager: "จัดการโซน",
        tagManager: "จัดการ tags",
        zoneName: "ชื่อโซน",
        prefix: "Prefix",
        displayOrder: "ลำดับ",
        active: "เปิดใช้งาน",
        addZone: "เพิ่มโซน",
        saveZone: "บันทึกโซน",
        tagName: "ชื่อ tag",
        color: "สี",
        addTag: "เพิ่ม tag",
        saveTag: "บันทึก tag",
        cancel: "ยกเลิก",
        emptyTitle: "ยังไม่มีโต๊ะ",
        emptyManage: "สร้างโต๊ะเป็นชุดเพื่อให้ระบบออกเลขให้อัตโนมัติ",
        emptyView: "เจ้าของร้านยังไม่ได้ตั้งค่าโต๊ะ",
        confirmDeleteTitle: "ยืนยันการลบ",
        confirmDeleteBody: "ต้องการลบรายการนี้ใช่ไหม?",
        loadError: "โหลดข้อมูลผังโต๊ะไม่สำเร็จ",
        saveError: "บันทึกข้อมูลไม่สำเร็จ",
        deleteError: "ลบข้อมูลไม่สำเร็จ",
        requiredName: "กรอกชื่อก่อนบันทึก",
        tableCreated: "เพิ่มโต๊ะแล้ว",
        tableUpdated: "อัปเดตโต๊ะแล้ว",
        batchCreated: "สร้างชุดโต๊ะแล้ว",
        zoneCreated: "เพิ่มโซนแล้ว",
        zoneUpdated: "อัปเดตโซนแล้ว",
        tagCreated: "เพิ่ม tag แล้ว",
        tagUpdated: "อัปเดต tag แล้ว",
        itemDeleted: "ลบข้อมูลแล้ว",
        confirmBatchTitle: "สร้างโต๊ะเป็นชุด?",
        confirmBatchBody: "ระบบจะเพิ่มโต๊ะหลายรายการตามจำนวนที่ตั้งไว้และอัปเดตผังโต๊ะทันที",
        confirmBatch: "ยืนยันสร้างโต๊ะ",
        qrOrder: "QR สั่งอาหาร",
        qrHint: "ให้ลูกค้าสแกนเพื่อเปิดเมนูโต๊ะนี้และส่งออเดอร์เข้าครัวโดยไม่ต้องล็อกอิน",
        copyLink: "คัดลอกลิงก์",
        openCustomerMenu: "เปิดหน้าเมนูลูกค้า",
        downloadQr: "โหลด QR",
        customerLinkCopied: "คัดลอกลิงก์สั่งอาหารแล้ว",
        qrDownloaded: "ดาวน์โหลด QR แล้ว",
        qrDownloadError: "ดาวน์โหลด QR ไม่สำเร็จ",
        regenerateQr: "สร้าง QR ใหม่",
        regenerateQrTitle: "สร้าง QR โต๊ะนี้ใหม่?",
        regenerateQrBody: "ลิงก์และ QR เดิมจะใช้ไม่ได้ทันที ลูกค้าที่เปิดจาก QR เก่าจะต้องสแกน QR ใหม่",
        regenerateQrConfirm: "สร้าง QR ใหม่",
        qrRegenerated: "สร้าง QR ใหม่แล้ว",
      }
    : {
        denied: "You do not have permission to view tables.",
        eyebrow: "Tables",
        title: "Table layout",
        subtitleManage: "Manage zones, automatic table numbering, and table attributes.",
        subtitleView: "View table status and zones in read-only mode.",
        refresh: "Refresh",
        total: "Total tables",
        occupied: "Occupied",
        reserved: "Reserved",
        zones: "Zones",
        allZones: "All zones",
        noZone: "No zone",
        allTags: "All tags",
        seats: "seats",
        edit: "Edit",
        delete: "Delete",
        createTable: "Add table",
        saveTable: "Save table",
        tableEditor: "Table settings",
        autoNumber: "Table number is generated automatically",
        zone: "Zone",
        tags: "Tags",
        capacity: "Seats",
        status: "Status",
        bulkCreate: "Bulk create tables",
        count: "Table count",
        preview: "Number preview",
        createBatch: "Create tables",
        zoneManager: "Manage zones",
        tagManager: "Manage tags",
        zoneName: "Zone name",
        prefix: "Prefix",
        displayOrder: "Display order",
        active: "Active",
        addZone: "Add zone",
        saveZone: "Save zone",
        tagName: "Tag name",
        color: "Color",
        addTag: "Add tag",
        saveTag: "Save tag",
        cancel: "Cancel",
        emptyTitle: "No tables yet",
        emptyManage: "Bulk create tables and let the system number them automatically.",
        emptyView: "The owner has not configured tables yet.",
        confirmDeleteTitle: "Confirm delete",
        confirmDeleteBody: "Delete this item?",
        loadError: "Could not load table layout.",
        saveError: "Could not save data.",
        deleteError: "Could not delete data.",
        requiredName: "Enter a name before saving.",
        tableCreated: "Table added",
        tableUpdated: "Table updated",
        batchCreated: "Tables created",
        zoneCreated: "Zone added",
        zoneUpdated: "Zone updated",
        tagCreated: "Tag added",
        tagUpdated: "Tag updated",
        itemDeleted: "Item deleted",
        confirmBatchTitle: "Create tables in bulk?",
        confirmBatchBody: "The system will add multiple tables and update the layout immediately.",
        confirmBatch: "Create tables",
        qrOrder: "Ordering QR",
        qrHint: "Guests scan this table QR to open the menu and send orders to the kitchen without login.",
        copyLink: "Copy link",
        openCustomerMenu: "Open guest menu",
        downloadQr: "Download QR",
        customerLinkCopied: "Ordering link copied",
        qrDownloaded: "QR downloaded",
        qrDownloadError: "Could not download QR",
        regenerateQr: "Regenerate QR",
        regenerateQrTitle: "Regenerate this table QR?",
        regenerateQrBody: "The old link and QR code will stop working immediately. Guests using the old QR must scan the new one.",
        regenerateQrConfirm: "Regenerate QR",
        qrRegenerated: "QR regenerated",
      };

  const STATUS = statusMeta(language);

  const refresh = async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const [tableRes, zoneRes, tagRes] = await Promise.all([listTables(), listTableZones(), listTableTags()]);
      setTables(tableRes.data.tables ?? []);
      setZones(zoneRes.data.zones ?? []);
      setTags(tagRes.data.tags ?? []);
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, language]);

  const activeZones = zones.filter((zone) => zone.is_active);
  const activeTags = tags.filter((tag) => tag.is_active);
  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const zoneMatch = zoneFilter === "all" || (zoneFilter === "none" ? !table.zone_id : table.zone_id === Number(zoneFilter));
      const tagMatch = tagFilter === "all" || table.tags?.some((tag) => tag.ID === Number(tagFilter));
      return zoneMatch && tagMatch;
    });
  }, [tagFilter, tables, zoneFilter]);
  const occupiedCount = tables.filter((table) => table.status === "occupied").length;
  const reservedCount = tables.filter((table) => table.status === "reserved").length;
  const bulkPreview = useMemo(() => {
    const count = Math.max(1, Number(bulkCount) || 1);
    const zone = activeZones.find((item) => item.ID === tableForm.zone_id);
    const existing = tables.filter((table) => tableForm.zone_id ? table.zone_id === tableForm.zone_id : !table.zone_id);
    const next = Math.max(0, ...existing.map((table) => table.sequence_number || 0)) + 1;
    const label = (sequence: number) => zone ? `${zone.prefix || "Z"}${String(sequence).padStart(2, "0")}` : `T${sequence}`;
    return count === 1 ? label(next) : `${label(next)}-${label(next + count - 1)}`;
  }, [activeZones, bulkCount, tableForm.zone_id, tables]);
  const customerOrderLink = useMemo(() => {
    if (!editingTable?.customer_token || typeof window === "undefined") return "";
    return `${window.location.origin}/customer/t/${editingTable.customer_token}`;
  }, [editingTable]);
  const customerOrderQr = customerOrderLink ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(customerOrderLink)}` : "";

  if (!canView) return <PermissionDenied title={copy.denied} />;

  const toggleTableTag = (id: number) => setTableForm((current) => ({ ...current, tag_ids: current.tag_ids?.includes(id) ? current.tag_ids.filter((item) => item !== id) : [...(current.tag_ids ?? []), id] }));

  const startEditTable = (table: RestaurantTable) => {
    setEditingTable(table);
    setFormError("");
    setTableForm({ zone_id: table.zone_id ?? null, capacity: table.capacity, status: table.status, tag_ids: table.tags?.map((tag) => tag.ID) ?? [] });
    setTableDrawerClosing(false);
    setTableDrawerOpen(true);
  };

  const startCreateTable = () => {
    setEditingTable(null);
    setFormError("");
    setTableForm(emptyTableForm);
    setBulkCount(1);
    setTableDrawerClosing(false);
    setTableDrawerOpen(true);
  };

  const closeTableDrawer = () => {
    if (tableDrawerClosing) return;
    setTableDrawerClosing(true);
    window.setTimeout(() => {
      setTableDrawerOpen(false);
      setTableDrawerClosing(false);
      setEditingTable(null);
      setTableForm(emptyTableForm);
      setFormError("");
    }, 180);
  };

  const saveTable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    await saveOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      setFormError("");
      try {
        if (editingTable) {
          const originalZone = editingTable.zone_id ?? null;
          const nextZone = tableForm.zone_id ?? null;
          let updated: RestaurantTable;
          if (originalZone !== nextZone) {
            updated = (await moveTableZone(editingTable.ID, { zone_id: nextZone })).data;
          } else {
            updated = editingTable;
          }
          updated = (await updateTable(editingTable.ID, { ...tableForm, zone_id: updated.zone_id ?? null, capacity: Number(tableForm.capacity) || 2 })).data;
          setTables((current) => current.map((table) => table.ID === updated.ID ? updated : table));
          showToast({ title: copy.tableUpdated });
        } else {
          const count = Math.max(1, Number(bulkCount) || 1);
          const res = await bulkCreateTables({ ...tableForm, count, capacity: Number(tableForm.capacity) || 2 });
          setTables(res.data.tables ?? []);
          showToast({ title: count > 1 ? copy.batchCreated : copy.tableCreated });
        }
        closeTableDrawer();
      } catch {
        setFormError(copy.saveError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const saveZone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!zoneForm.name.trim()) {
      setFormError(copy.requiredName);
      return;
    }
    await saveOnceRef.current(async () => {
      setSubmitting(true);
      setFormError("");
      try {
        const payload = { ...zoneForm, name: zoneForm.name.trim(), prefix: zoneForm.prefix?.trim().toUpperCase(), display_order: Number(zoneForm.display_order) || 0 };
        const res = editingZone ? await updateTableZone(editingZone.ID, payload) : await createTableZone(payload);
        setZones((current) => editingZone ? current.map((zone) => zone.ID === res.data.ID ? res.data : zone) : [...current, res.data]);
        showToast({ title: editingZone ? copy.zoneUpdated : copy.zoneCreated });
        setEditingZone(null);
        setZoneForm(emptyZoneForm);
      } catch {
        setFormError(copy.saveError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const saveTag = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tagForm.name.trim()) {
      setFormError(copy.requiredName);
      return;
    }
    await saveOnceRef.current(async () => {
      setSubmitting(true);
      setFormError("");
      try {
        const payload = { ...tagForm, name: tagForm.name.trim(), color: "gray" as const, display_order: Number(tagForm.display_order) || 0 };
        const res = editingTag ? await updateTableTag(editingTag.ID, payload) : await createTableTag(payload);
        setTags((current) => editingTag ? current.map((tag) => tag.ID === res.data.ID ? res.data : tag) : [...current, res.data]);
        showToast({ title: editingTag ? copy.tagUpdated : copy.tagCreated });
        setEditingTag(null);
        setTagForm(emptyTagForm);
      } catch {
        setFormError(copy.saveError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const toggleZoneEdit = (zone: TableZone) => {
    setFormError("");
    if (editingZone?.ID === zone.ID) {
      setEditingZone(null);
      setZoneForm(emptyZoneForm);
      return;
    }
    setEditingZone(zone);
    setZoneForm({ name: zone.name, prefix: zone.prefix, display_order: zone.display_order, is_active: zone.is_active });
  };

  const toggleTagEdit = (tag: TableTag) => {
    setFormError("");
    if (editingTag?.ID === tag.ID) {
      setEditingTag(null);
      setTagForm(emptyTagForm);
      return;
    }
    setEditingTag(tag);
    setTagForm({ name: tag.name, color: "gray", display_order: tag.display_order, is_active: tag.is_active });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        if (deleteTarget.type === "table") {
          await deleteTable(deleteTarget.table.ID);
          setTables((current) => current.filter((table) => table.ID !== deleteTarget.table.ID));
          closeTableDrawer();
        }
        if (deleteTarget.type === "zone") {
          await deleteTableZone(deleteTarget.zone.ID);
          setZones((current) => current.filter((zone) => zone.ID !== deleteTarget.zone.ID));
          if (editingZone?.ID === deleteTarget.zone.ID) {
            setEditingZone(null);
            setZoneForm(emptyZoneForm);
          }
        }
        if (deleteTarget.type === "tag") {
          await deleteTableTag(deleteTarget.tag.ID);
          setTags((current) => current.filter((tag) => tag.ID !== deleteTarget.tag.ID));
          if (editingTag?.ID === deleteTarget.tag.ID) {
            setEditingTag(null);
            setTagForm(emptyTagForm);
          }
        }
        showToast({ title: copy.itemDeleted });
        closeDeleteModal();
      } catch {
        setError(copy.deleteError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const closeDeleteModal = () => {
    if (deleteClosing) return;
    setDeleteClosing(true);
    window.setTimeout(() => {
      setDeleteTarget(null);
      setDeleteClosing(false);
    }, 180);
  };

  const copyCustomerOrderLink = async () => {
    if (!customerOrderLink) return;
    await navigator.clipboard.writeText(customerOrderLink);
    showToast({ title: copy.customerLinkCopied });
  };

  const downloadCustomerQr = async () => {
    if (!editingTable || !customerOrderQr) return;
    setDownloadingQr(true);
    try {
      const response = await fetch(customerOrderQr);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = safeQrFileName(editingTable.display_label || editingTable.table_number || String(editingTable.ID));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      showToast({ title: copy.qrDownloaded });
    } catch {
      showToast({ title: copy.qrDownloadError, tone: "error" });
    } finally {
      setDownloadingQr(false);
    }
  };

  const regenerateCustomerQr = async () => {
    if (!editingTable || !canManage) return;
    const confirmed = await confirm({
      title: copy.regenerateQrTitle,
      message: copy.regenerateQrBody,
      confirmLabel: copy.regenerateQrConfirm,
      cancelLabel: copy.cancel,
      tone: "warning",
    });
    if (!confirmed) return;
    await qrOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        const updated = (await regenerateTableCustomerToken(editingTable.ID)).data;
        setEditingTable(updated);
        setTables((current) => current.map((table) => table.ID === updated.ID ? updated : table));
        showToast({ title: copy.qrRegenerated });
      } catch {
        setError(copy.saveError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{canManage ? copy.subtitleManage : copy.subtitleView}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">{copy.refresh}</button>
          {canManage && <button type="button" onClick={() => setZoneManagerOpen(true)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900">{copy.zoneManager}</button>}
          {canManage && <button type="button" onClick={() => setTagManagerOpen(true)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900">{copy.tagManager}</button>}
          {canManage && <button type="button" onClick={startCreateTable} className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">+ {copy.createTable}</button>}
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ label: copy.total, value: tables.length }, { label: copy.occupied, value: occupiedCount }, { label: copy.reserved, value: reservedCount }, { label: copy.zones, value: zones.length }].map((item) => (
          <div key={item.label} className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
            <p className="text-[11px] text-gray-400">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4">
        <section className="space-y-4">
          <div className="grid gap-2 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950 sm:grid-cols-2">
            <ThemedSelect value={zoneFilter} onChange={setZoneFilter} options={[{ value: "all", label: copy.allZones }, { value: "none", label: copy.noZone }, ...activeZones.map((zone) => ({ value: String(zone.ID), label: zone.name }))]} />
            <ThemedSelect value={tagFilter} onChange={setTagFilter} options={[{ value: "all", label: copy.allTags }, ...activeTags.map((tag) => ({ value: String(tag.ID), label: tag.name }))]} />
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-32" />)}
            </div>
          ) : filteredTables.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
              {filteredTables.map((table) => (
                <button key={table.ID} type="button" disabled={!canManage} onClick={() => startEditTable(table)} className={`min-h-36 rounded-md border p-4 text-left transition-[transform,box-shadow] ${canManage ? "ui-press hover:-translate-y-0.5 hover:shadow-sm" : ""} ${STATUS[table.status].cls}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-semibold">{table.display_label || table.table_number}</h2>
                      <p className="mt-1 truncate text-[12px] opacity-80">{table.table_zone?.name || table.zone || copy.noZone}</p>
                    </div>
                    <span className="rounded-md bg-white/70 px-2 py-1 text-[11px] font-semibold dark:bg-gray-950/35">{STATUS[table.status].label}</span>
                  </div>
                  <p className="mt-4 text-[12px] opacity-80">{table.capacity} {copy.seats}</p>
                  {table.tags?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {table.tags.map((tag) => <span key={tag.ID} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tagBadgeClass}`}>{tag.name}</span>)}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-gray-200 bg-white px-4 py-10 text-center dark:border-gray-800 dark:bg-gray-950">
              <p className="text-[14px] font-semibold">{copy.emptyTitle}</p>
              <p className="mt-1 text-[12px] text-gray-500">{canManage ? copy.emptyManage : copy.emptyView}</p>
            </div>
          )}
        </section>

      </div>

      {tableDrawerOpen && canManage && (
        <>
          <button type="button" aria-label={copy.cancel} onClick={closeTableDrawer} className={`${tableDrawerClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-30 cursor-default bg-gray-950/45 backdrop-blur-sm`} />
          <form onSubmit={saveTable} className={`${tableDrawerClosing ? "motion-drawer-exit" : "motion-drawer"} fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{copy.tableEditor}</p>
                <h2 className="mt-0.5 text-[15px] font-semibold text-gray-900 dark:text-white">{editingTable ? copy.saveTable : copy.createTable}</h2>
                <p className="mt-1 text-[11px] text-gray-400">{editingTable ? `${copy.autoNumber}: ${editingTable.display_label || editingTable.table_number}` : copy.autoNumber}</p>
              </div>
              <button type="button" onClick={closeTableDrawer} className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="rounded-md border border-gray-200 dark:border-gray-800">
                  <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                    <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.tableEditor}</span>
                  </div>
                  <div className="space-y-3 p-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.zone}</span>
                      <ThemedSelect value={tableForm.zone_id ? String(tableForm.zone_id) : "none"} onChange={(next) => setTableForm((current) => ({ ...current, zone_id: next === "none" ? null : Number(next) }))} options={[{ value: "none", label: copy.noZone }, ...activeZones.map((zone) => ({ value: String(zone.ID), label: `${zone.name}${zone.prefix ? ` (${zone.prefix})` : ""}` }))]} />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {!editingTable && (
                        <label className="block">
                          <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.count}</span>
                          <input type="number" min={1} max={200} value={bulkCount} onChange={(event) => setBulkCount(Number(event.target.value) || 1)} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" aria-label={copy.count} />
                        </label>
                      )}
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.capacity}</span>
                        <input type="number" min={1} max={50} value={tableForm.capacity} onChange={(event) => setTableForm((current) => ({ ...current, capacity: Number(event.target.value) || 2 }))} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:border-gray-700 dark:bg-gray-900" aria-label={copy.capacity} />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.status}</span>
                        <ThemedSelect value={tableForm.status} onChange={(next) => setTableForm((current) => ({ ...current, status: next as TableStatus }))} options={[{ value: "free", label: STATUS.free.label }, { value: "occupied", label: STATUS.occupied.label }, { value: "reserved", label: STATUS.reserved.label }]} />
                      </label>
                    </div>
                    {!editingTable && (
                      <p className="rounded-md border border-gray-200 px-3 py-2 text-[12px] text-gray-500 dark:border-gray-800">
                        {copy.preview}: <span className="font-mono font-semibold text-gray-900 dark:text-white">{bulkPreview}</span>
                      </p>
                    )}
                    <div>
                      <p className="mb-1.5 text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.tags}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {activeTags.map((tag) => (
                          <button key={tag.ID} type="button" onClick={() => toggleTableTag(tag.ID)} className={`rounded-md border px-2 py-1 text-[11px] font-medium ${tableForm.tag_ids?.includes(tag.ID) ? tagBadgeClass : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900"}`}>{tag.name}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {editingTable && customerOrderLink && (
                  <div className="relative rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/40">
                    <button
                      type="button"
                      onClick={regenerateCustomerQr}
                      disabled={submitting}
                      aria-label={copy.regenerateQr}
                      title={copy.regenerateQr}
                      className="ui-press absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-red-900/60 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div className="grid grid-cols-[96px_1fr] gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={customerOrderQr} alt={copy.qrOrder} className="h-24 w-24 rounded-md border border-gray-200 bg-white p-1 dark:border-gray-700" />
                      <div className="min-w-0 pr-9">
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{copy.qrOrder}</p>
                        <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{copy.qrHint}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-gray-400">{customerOrderLink}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={copyCustomerOrderLink} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">{copy.copyLink}</button>
                      <button type="button" onClick={downloadCustomerQr} disabled={downloadingQr} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {copy.downloadQr}
                      </button>
                      <a href={customerOrderLink} target="_blank" rel="noreferrer" className="col-span-2 flex h-9 items-center justify-center rounded-md bg-gray-900 px-2 text-center text-[11px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">{copy.openCustomerMenu}</a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 border-t border-gray-200 p-4 dark:border-gray-800">
              {editingTable && <button type="button" onClick={() => setDeleteTarget({ type: "table", table: editingTable })} className="h-10 w-full rounded-md border border-red-200 text-[13px] font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>}
              <button disabled={submitting} className="ui-press h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{editingTable ? copy.saveTable : copy.createTable}</button>
              {formError && <p className="text-[11px] font-medium text-red-600 dark:text-red-300">{formError}</p>}
            </div>
          </form>
        </>
      )}

      {zoneManagerOpen && (
        <ManagerModal title={copy.zoneManager} onClose={() => setZoneManagerOpen(false)}>
          <div className="space-y-2">
            {zones.map((zone) => <ManagerRow key={zone.ID} title={`${zone.name}${zone.prefix ? ` (${zone.prefix})` : ""}`} muted={!zone.is_active} selected={editingZone?.ID === zone.ID} onToggle={() => toggleZoneEdit(zone)} onDelete={() => setDeleteTarget({ type: "zone", zone })} copy={copy} />)}
          </div>
          <form onSubmit={saveZone} className="mt-4 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-800">
            <input value={zoneForm.name} onChange={(event) => setZoneForm((current) => ({ ...current, name: event.target.value }))} placeholder={copy.zoneName} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
            <div className="grid grid-cols-2 gap-2">
              <input value={zoneForm.prefix} onChange={(event) => setZoneForm((current) => ({ ...current, prefix: event.target.value }))} placeholder={copy.prefix} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
              <input type="number" value={zoneForm.display_order || ""} onChange={(event) => setZoneForm((current) => ({ ...current, display_order: Number(event.target.value) || 0 }))} placeholder={copy.displayOrder} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
            </div>
            <label className="flex h-9 items-center gap-2 text-[12px]"><input type="checkbox" checked={zoneForm.is_active} onChange={(event) => setZoneForm((current) => ({ ...current, is_active: event.target.checked }))} />{copy.active}</label>
            <button disabled={submitting} className="h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{editingZone ? copy.saveZone : copy.addZone}</button>
          </form>
        </ManagerModal>
      )}

      {tagManagerOpen && (
        <ManagerModal title={copy.tagManager} onClose={() => setTagManagerOpen(false)}>
          <div className="space-y-2">
            {tags.map((tag) => <ManagerRow key={tag.ID} title={tag.name} muted={!tag.is_active} badgeClass={tagBadgeClass} selected={editingTag?.ID === tag.ID} onToggle={() => toggleTagEdit(tag)} onDelete={() => setDeleteTarget({ type: "tag", tag })} copy={copy} />)}
          </div>
          <form onSubmit={saveTag} className="mt-4 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-800">
            <input value={tagForm.name} onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value }))} placeholder={copy.tagName} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
            <input type="number" value={tagForm.display_order || ""} onChange={(event) => setTagForm((current) => ({ ...current, display_order: Number(event.target.value) || 0 }))} placeholder={copy.displayOrder} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
            <label className="flex h-9 items-center gap-2 text-[12px]"><input type="checkbox" checked={tagForm.is_active} onChange={(event) => setTagForm((current) => ({ ...current, is_active: event.target.checked }))} />{copy.active}</label>
            <button disabled={submitting} className="h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{editingTag ? copy.saveTag : copy.addTag}</button>
          </form>
        </ManagerModal>
      )}

      {deleteTarget && (
        <div className={`${deleteClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`} onClick={closeDeleteModal}>
          <div className={`${deleteClosing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950`} onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.confirmDeleteTitle}</h2>
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.confirmDeleteBody}</p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3">
              <button type="button" onClick={closeDeleteModal} className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.cancel}</button>
              <button type="button" onClick={confirmDelete} disabled={submitting} className="h-9 rounded-md border border-red-200 px-3 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManagerModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  return (
    <div className={`${closing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0`} onClick={close}>
      <div className={`${closing ? "motion-bottom-sheet-exit" : "motion-bottom-sheet"} max-h-[86vh] w-full max-w-md overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950`} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button type="button" onClick={close} className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ManagerRow({ title, muted, badgeClass, selected, onToggle, onDelete, copy }: { title: string; muted?: boolean; badgeClass?: string; selected?: boolean; onToggle: () => void; onDelete: () => void; copy: Record<string, string> }) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className={`grid cursor-pointer grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 py-2 outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-orange-500/30 ${
        selected
          ? "border-gray-950 bg-orange-50/70 shadow-[inset_3px_0_0_#f97316] dark:border-white/80 dark:bg-orange-950/20"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-gray-900/60"
      }`}
    >
      <p className={`truncate text-[13px] font-medium ${muted ? "text-gray-400 line-through" : badgeClass ? `w-fit rounded-md border px-2 py-1 ${badgeClass}` : "text-gray-900 dark:text-white"}`}>{title}</p>
      <div className="flex gap-1">
        <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} className="h-8 rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>
      </div>
    </div>
  );
}
