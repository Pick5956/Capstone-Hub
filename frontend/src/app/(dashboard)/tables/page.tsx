"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { bulkCreateTables, createTable, createTableTag, createTableZone, deleteTable, deleteTableTag, deleteTableZone, listTableTags, listTables, listTableZones, moveTableZone, updateTable, updateTableTag, updateTableZone } from "@/src/lib/table";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { RestaurantTable, RestaurantTableInput, TableStatus, TableTag, TableTagColor, TableTagInput, TableZone, TableZoneInput } from "@/src/types/table";
import { Skeleton } from "@/src/components/shared/Skeleton";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import ThemedSelect from "@/src/components/shared/ThemedSelect";

const emptyTableForm: RestaurantTableInput = { zone_id: null, capacity: 2, status: "free", tag_ids: [] };
const emptyZoneForm: TableZoneInput = { name: "", prefix: "", display_order: 0, is_active: true };
const emptyTagForm: TableTagInput = { name: "", color: "gray", display_order: 0, is_active: true };
const tagColors: TableTagColor[] = ["gray", "orange", "sky", "emerald", "amber"];

function statusMeta(language: "th" | "en") {
  return {
    free: { label: language === "th" ? "ว่าง" : "Free", cls: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200" },
    occupied: { label: language === "th" ? "ใช้งาน" : "Occupied", cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200" },
    reserved: { label: language === "th" ? "จอง" : "Reserved", cls: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-200" },
  } satisfies Record<TableStatus, { label: string; cls: string }>;
}

function tagClass(color: TableTagColor) {
  const classes = {
    gray: "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
    orange: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-300",
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-300",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300",
  } satisfies Record<TableTagColor, string>;
  return classes[color] ?? classes.gray;
}

export default function TablesPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canManage = can(activeMembership, "manage_table");
  const canView = canManage || can(activeMembership, "view_tables");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [tags, setTags] = useState<TableTag[]>([]);
  const [zoneFilter, setZoneFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [tableForm, setTableForm] = useState<RestaurantTableInput>(emptyTableForm);
  const [bulkZoneId, setBulkZoneId] = useState("none");
  const [bulkCount, setBulkCount] = useState(4);
  const [bulkCapacity, setBulkCapacity] = useState(2);
  const [bulkTagIds, setBulkTagIds] = useState<number[]>([]);
  const [zoneForm, setZoneForm] = useState<TableZoneInput>(emptyZoneForm);
  const [editingZone, setEditingZone] = useState<TableZone | null>(null);
  const [zoneManagerOpen, setZoneManagerOpen] = useState(false);
  const [tagForm, setTagForm] = useState<TableTagInput>(emptyTagForm);
  const [editingTag, setEditingTag] = useState<TableTag | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "table"; table: RestaurantTable } | { type: "zone"; zone: TableZone } | { type: "tag"; tag: TableTag } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const saveOnceRef = useRef(createSingleFlight());
  const deleteOnceRef = useRef(createSingleFlight());
  const bulkOnceRef = useRef(createSingleFlight());

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
    const zone = activeZones.find((item) => String(item.ID) === bulkZoneId);
    const existing = tables.filter((table) => bulkZoneId === "none" ? !table.zone_id : table.zone_id === zone?.ID);
    const next = Math.max(0, ...existing.map((table) => table.sequence_number || 0)) + 1;
    const label = (sequence: number) => zone ? `${zone.prefix || "Z"}${String(sequence).padStart(2, "0")}` : `T${sequence}`;
    return count === 1 ? label(next) : `${label(next)}-${label(next + count - 1)}`;
  }, [activeZones, bulkCount, bulkZoneId, tables]);

  if (!canView) return <PermissionDenied title={copy.denied} />;

  const toggleBulkTag = (id: number) => setBulkTagIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleTableTag = (id: number) => setTableForm((current) => ({ ...current, tag_ids: current.tag_ids?.includes(id) ? current.tag_ids.filter((item) => item !== id) : [...(current.tag_ids ?? []), id] }));

  const startEditTable = (table: RestaurantTable) => {
    setEditingTable(table);
    setFormError("");
    setTableForm({ zone_id: table.zone_id ?? null, capacity: table.capacity, status: table.status, tag_ids: table.tags?.map((tag) => tag.ID) ?? [] });
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
        } else {
          const created = (await createTable({ ...tableForm, capacity: Number(tableForm.capacity) || 2 })).data;
          setTables((current) => [...current, created]);
        }
        setEditingTable(null);
        setTableForm(emptyTableForm);
      } catch {
        setFormError(copy.saveError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const createBatch = async () => {
    if (!canManage) return;
    await bulkOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        const res = await bulkCreateTables({ zone_id: bulkZoneId === "none" ? null : Number(bulkZoneId), count: Number(bulkCount) || 1, capacity: Number(bulkCapacity) || 2, tag_ids: bulkTagIds });
        setTables(res.data.tables ?? []);
      } catch {
        setError(copy.saveError);
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
        const payload = { ...tagForm, name: tagForm.name.trim(), display_order: Number(tagForm.display_order) || 0 };
        const res = editingTag ? await updateTableTag(editingTag.ID, payload) : await createTableTag(payload);
        setTags((current) => editingTag ? current.map((tag) => tag.ID === res.data.ID ? res.data : tag) : [...current, res.data]);
        setEditingTag(null);
        setTagForm(emptyTagForm);
      } catch {
        setFormError(copy.saveError);
      } finally {
        setSubmitting(false);
      }
    });
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
        }
        if (deleteTarget.type === "zone") {
          await deleteTableZone(deleteTarget.zone.ID);
          setZones((current) => current.filter((zone) => zone.ID !== deleteTarget.zone.ID));
        }
        if (deleteTarget.type === "tag") {
          await deleteTableTag(deleteTarget.tag.ID);
          setTags((current) => current.filter((tag) => tag.ID !== deleteTarget.tag.ID));
        }
        setDeleteTarget(null);
      } catch {
        setError(copy.deleteError);
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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{canManage ? copy.subtitleManage : copy.subtitleView}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={refresh} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">{copy.refresh}</button>
          {canManage && <button type="button" onClick={() => setZoneManagerOpen(true)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900">{copy.zoneManager}</button>}
          {canManage && <button type="button" onClick={() => setTagManagerOpen(true)} className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-gray-900">{copy.tagManager}</button>}
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

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
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
                      {table.tags.map((tag) => <span key={tag.ID} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tagClass(tag.color)}`}>{tag.name}</span>)}
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

        {canManage && (
          <aside className="space-y-4">
            <form onSubmit={saveTable} className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[14px] font-semibold">{copy.tableEditor}</h2>
                  <p className="mt-0.5 text-[11px] text-gray-400">{editingTable ? `${copy.autoNumber}: ${editingTable.display_label || editingTable.table_number}` : copy.autoNumber}</p>
                </div>
                {editingTable && <button type="button" onClick={() => setDeleteTarget({ type: "table", table: editingTable })} className="h-8 rounded-md px-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>}
              </div>
              <div className="mt-3 space-y-3">
                <ThemedSelect value={tableForm.zone_id ? String(tableForm.zone_id) : "none"} onChange={(next) => setTableForm((current) => ({ ...current, zone_id: next === "none" ? null : Number(next) }))} options={[{ value: "none", label: copy.noZone }, ...activeZones.map((zone) => ({ value: String(zone.ID), label: `${zone.name}${zone.prefix ? ` (${zone.prefix})` : ""}` }))]} />
                <input type="number" min={1} max={50} value={tableForm.capacity} onChange={(event) => setTableForm((current) => ({ ...current, capacity: Number(event.target.value) || 2 }))} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" aria-label={copy.capacity} />
                <ThemedSelect value={tableForm.status} onChange={(next) => setTableForm((current) => ({ ...current, status: next as TableStatus }))} options={[{ value: "free", label: STATUS.free.label }, { value: "occupied", label: STATUS.occupied.label }, { value: "reserved", label: STATUS.reserved.label }]} />
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.tags}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeTags.map((tag) => (
                      <button key={tag.ID} type="button" onClick={() => toggleTableTag(tag.ID)} className={`rounded-md border px-2 py-1 text-[11px] font-medium ${tableForm.tag_ids?.includes(tag.ID) ? tagClass(tag.color) : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900"}`}>{tag.name}</button>
                    ))}
                  </div>
                </div>
              </div>
              <button disabled={submitting} className="mt-3 h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{editingTable ? copy.saveTable : copy.createTable}</button>
              {editingTable && <button type="button" onClick={() => { setEditingTable(null); setTableForm(emptyTableForm); }} className="mt-2 h-10 w-full rounded-md border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.cancel}</button>}
              {formError && <p className="mt-2 text-[11px] font-medium text-red-600 dark:text-red-300">{formError}</p>}
            </form>

            <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
              <h2 className="text-[14px] font-semibold">{copy.bulkCreate}</h2>
              <div className="mt-3 space-y-3">
                <ThemedSelect value={bulkZoneId} onChange={setBulkZoneId} options={[{ value: "none", label: copy.noZone }, ...activeZones.map((zone) => ({ value: String(zone.ID), label: `${zone.name}${zone.prefix ? ` (${zone.prefix})` : ""}` }))]} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={1} max={200} value={bulkCount} onChange={(event) => setBulkCount(Number(event.target.value) || 1)} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" aria-label={copy.count} />
                  <input type="number" min={1} max={50} value={bulkCapacity} onChange={(event) => setBulkCapacity(Number(event.target.value) || 2)} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" aria-label={copy.capacity} />
                </div>
                <p className="rounded-md border border-gray-200 px-3 py-2 text-[12px] text-gray-500 dark:border-gray-800">{copy.preview}: <span className="font-mono font-semibold text-gray-900 dark:text-white">{bulkPreview}</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {activeTags.map((tag) => <button key={tag.ID} type="button" onClick={() => toggleBulkTag(tag.ID)} className={`rounded-md border px-2 py-1 text-[11px] font-medium ${bulkTagIds.includes(tag.ID) ? tagClass(tag.color) : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900"}`}>{tag.name}</button>)}
                </div>
              </div>
              <button type="button" onClick={createBatch} disabled={submitting} className="mt-3 h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{copy.createBatch}</button>
            </div>
          </aside>
        )}
      </div>

      {zoneManagerOpen && (
        <ManagerModal title={copy.zoneManager} onClose={() => setZoneManagerOpen(false)}>
          <div className="space-y-2">
            {zones.map((zone) => <ManagerRow key={zone.ID} title={`${zone.name}${zone.prefix ? ` (${zone.prefix})` : ""}`} muted={!zone.is_active} onEdit={() => { setEditingZone(zone); setZoneForm({ name: zone.name, prefix: zone.prefix, display_order: zone.display_order, is_active: zone.is_active }); }} onDelete={() => setDeleteTarget({ type: "zone", zone })} copy={copy} />)}
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
            {tags.map((tag) => <ManagerRow key={tag.ID} title={tag.name} muted={!tag.is_active} badgeClass={tagClass(tag.color)} onEdit={() => { setEditingTag(tag); setTagForm({ name: tag.name, color: tag.color, display_order: tag.display_order, is_active: tag.is_active }); }} onDelete={() => setDeleteTarget({ type: "tag", tag })} copy={copy} />)}
          </div>
          <form onSubmit={saveTag} className="mt-4 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-800">
            <input value={tagForm.name} onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value }))} placeholder={copy.tagName} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
            <ThemedSelect value={tagForm.color} onChange={(next) => setTagForm((current) => ({ ...current, color: next as TableTagColor }))} options={tagColors.map((color) => ({ value: color, label: color }))} />
            <input type="number" value={tagForm.display_order || ""} onChange={(event) => setTagForm((current) => ({ ...current, display_order: Number(event.target.value) || 0 }))} placeholder={copy.displayOrder} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900" />
            <label className="flex h-9 items-center gap-2 text-[12px]"><input type="checkbox" checked={tagForm.is_active} onChange={(event) => setTagForm((current) => ({ ...current, is_active: event.target.checked }))} />{copy.active}</label>
            <button disabled={submitting} className="h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">{editingTag ? copy.saveTag : copy.addTag}</button>
          </form>
        </ManagerModal>
      )}

      {deleteTarget && (
        <div className="motion-overlay fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
          <div className="motion-bottom-sheet w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.confirmDeleteTitle}</h2>
              <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.confirmDeleteBody}</p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="h-9 rounded-md border border-gray-200 px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">{copy.cancel}</button>
              <button type="button" onClick={confirmDelete} disabled={submitting} className="h-9 rounded-md border border-red-200 px-3 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManagerModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="motion-overlay fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
      <div className="motion-bottom-sheet max-h-[86vh] w-full max-w-md overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ManagerRow({ title, muted, badgeClass, onEdit, onDelete, copy }: { title: string; muted?: boolean; badgeClass?: string; onEdit: () => void; onDelete: () => void; copy: Record<string, string> }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
      <p className={`truncate text-[13px] font-medium ${muted ? "text-gray-400 line-through" : badgeClass ? `w-fit rounded-md border px-2 py-1 ${badgeClass}` : "text-gray-900 dark:text-white"}`}>{title}</p>
      <div className="flex gap-1">
        <button type="button" onClick={onEdit} className="h-8 rounded-md px-2 text-[11px] font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20">{copy.edit}</button>
        <button type="button" onClick={onDelete} className="h-8 rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20">{copy.delete}</button>
      </div>
    </div>
  );
}
