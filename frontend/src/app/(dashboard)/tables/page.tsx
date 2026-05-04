"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { can } from "@/src/lib/rbac";
import { createTable, deleteTable, listTables, updateTable } from "@/src/lib/table";
import { createSingleFlight } from "@/src/lib/singleFlight";
import type { RestaurantTable, RestaurantTableInput, TableStatus } from "@/src/types/table";
import { Skeleton } from "@/src/components/shared/Skeleton";
import PermissionDenied from "@/src/components/shared/PermissionDenied";
import ThemedSelect from "@/src/components/shared/ThemedSelect";

const emptyForm: RestaurantTableInput = { table_number: "", capacity: 2, zone: "", status: "free" };

function getStatusMeta(language: "th" | "en") {
  return {
    free: {
      label: language === "th" ? "ว่าง" : "Free",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/40",
    },
    occupied: {
      label: language === "th" ? "ใช้งาน" : "Occupied",
      cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40",
    },
    reserved: {
      label: language === "th" ? "จอง" : "Reserved",
      cls: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-900/40",
    },
  } satisfies Record<TableStatus, { label: string; cls: string }>;
}

export default function TablesPage() {
  const { activeMembership } = useAuth();
  const { language } = useLanguage();
  const canManage = can(activeMembership, "manage_table");
  const canView = canManage || can(activeMembership, "view_tables");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [form, setForm] = useState<RestaurantTableInput>(emptyForm);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [zoneFilter, setZoneFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const actionOnceRef = useRef(createSingleFlight());

  const copy = language === "th"
    ? {
        denied: "ไม่มีสิทธิ์ดูผังโต๊ะ",
        loadError: "โหลดข้อมูลโต๊ะไม่สำเร็จ",
        tableRequired: "กรุณากรอกเลขโต๊ะ",
        saveError: "บันทึกโต๊ะไม่สำเร็จ",
        deleteError: "ลบโต๊ะไม่สำเร็จ",
        bootstrapError: "สร้างโต๊ะเริ่มต้นไม่สำเร็จ",
        eyebrow: "Tables",
        title: "ผังโต๊ะ",
        subtitleManage: "จัดการโต๊ะและสถานะพื้นฐาน",
        subtitleView: "ดูสถานะโต๊ะแบบ read-only",
        refresh: "รีเฟรช",
        total: "ทั้งหมด",
        occupied: "ใช้งาน",
        reserved: "จอง",
        allZones: "ทุกโซน",
        unspecifiedZone: "ไม่ระบุโซน",
        seats: "ที่นั่ง",
        edit: "แก้ไข",
        remove: "ลบ",
        emptyTitle: "ยังไม่มีโต๊ะ",
        emptyManage: "สร้างโต๊ะเริ่มต้นจากจำนวนโต๊ะของร้าน หรือเพิ่มเองทีละโต๊ะ",
        emptyView: "เจ้าของร้านยังไม่ได้ตั้งค่าโต๊ะ",
        bootstrap: "สร้างโต๊ะเริ่มต้น",
        editForm: "แก้โต๊ะ",
        createForm: "เพิ่มโต๊ะ",
        tableNumber: "เลขโต๊ะ",
        tablePlaceholder: "เลขโต๊ะ เช่น T1",
        capacity: "จำนวนที่นั่ง",
        zone: "โซน",
        zonePlaceholder: "โซน เช่น Main / Outdoor",
        saveButtonEdit: "บันทึกโต๊ะ",
        saveButtonCreate: "เพิ่มโต๊ะ",
        initialZone: "Main",
      }
    : {
        denied: "You do not have permission to view tables.",
        loadError: "Could not load table data.",
        tableRequired: "Please enter a table number.",
        saveError: "Could not save the table.",
        deleteError: "Could not delete the table.",
        bootstrapError: "Could not create the starting tables.",
        eyebrow: "Tables",
        title: "Table layout",
        subtitleManage: "Manage tables and their base statuses.",
        subtitleView: "View table status in read-only mode.",
        refresh: "Refresh",
        total: "Total",
        occupied: "Occupied",
        reserved: "Reserved",
        allZones: "All zones",
        unspecifiedZone: "No zone",
        seats: "seats",
        edit: "Edit",
        remove: "Delete",
        emptyTitle: "No tables yet",
        emptyManage: "Create a starter table set from the restaurant table count, or add tables one by one.",
        emptyView: "The owner has not configured tables yet.",
        bootstrap: "Create starter tables",
        editForm: "Edit table",
        createForm: "Add table",
        tableNumber: "Table number",
        tablePlaceholder: "Table number, for example T1",
        capacity: "Seats",
        zone: "Zone",
        zonePlaceholder: "Zone, for example Main / Outdoor",
        saveButtonEdit: "Save table",
        saveButtonCreate: "Add table",
        initialZone: "Main",
      };

  const STATUS = getStatusMeta(language);

  const refresh = async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const res = await listTables();
      setTables(res.data.tables ?? []);
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

  const zones = useMemo(() => Array.from(new Set(tables.map((table) => table.zone).filter(Boolean))).sort(), [tables]);
  const filteredTables = zoneFilter ? tables.filter((table) => table.zone === zoneFilter) : tables;
  const used = tables.filter((table) => table.status === "occupied").length;
  const reserved = tables.filter((table) => table.status === "reserved").length;

  if (!canView) return <PermissionDenied title={copy.denied} />;

  const saveTable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (!form.table_number.trim()) {
      setFormError(copy.tableRequired);
      return;
    }
    await actionOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      setFormError("");
      try {
        const payload = {
          ...form,
          table_number: form.table_number.trim(),
          capacity: Number(form.capacity) || 2,
          zone: form.zone?.trim(),
        };
        if (editing) {
          const res = await updateTable(editing.ID, payload);
          setTables((current) => current.map((table) => (table.ID === res.data.ID ? res.data : table)));
        } else {
          const res = await createTable(payload);
          setTables((current) => [...current, res.data]);
        }
        setEditing(null);
        setForm(emptyForm);
      } catch {
        setFormError(copy.saveError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const editTable = (table: RestaurantTable) => {
    setEditing(table);
    setFormError("");
    setForm({ table_number: table.table_number, capacity: table.capacity, zone: table.zone, status: table.status });
  };

  const removeTable = async (table: RestaurantTable) => {
    if (!canManage) return;
    await actionOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        await deleteTable(table.ID);
        setTables((current) => current.filter((item) => item.ID !== table.ID));
      } catch {
        setError(copy.deleteError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const quickCreate = async () => {
    if (!canManage || tables.length > 0) return;
    await actionOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        const total = activeMembership?.restaurant?.table_count || 8;
        const created: RestaurantTable[] = [];
        for (let i = 1; i <= total; i += 1) {
          const res = await createTable({ table_number: `T${i}`, capacity: 2, zone: copy.initialZone, status: "free" });
          created.push(res.data);
        }
        setTables(created);
      } catch {
        setError(copy.bootstrapError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{canManage ? copy.subtitleManage : copy.subtitleView}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          {copy.refresh}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-[11px] text-gray-400">{copy.total}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{tables.length}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-[11px] text-gray-400">{copy.occupied}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-amber-600">{used}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
          <p className="text-[11px] text-gray-400">{copy.reserved}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-sky-600">{reserved}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <section className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <ThemedSelect
              className="sm:w-64"
              value={zoneFilter}
              onChange={setZoneFilter}
              options={[{ value: "", label: copy.allZones }, ...zones.map((zone) => ({ value: zone, label: zone }))]}
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-28" />
              ))}
            </div>
          ) : filteredTables.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
              {filteredTables.map((table) => (
                <div key={table.ID} className={`rounded-md border p-4 ${STATUS[table.status].cls}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-semibold">{table.table_number}</h2>
                      <p className="mt-1 text-[12px] opacity-80">{table.zone || copy.unspecifiedZone}</p>
                    </div>
                    <span className="rounded-md bg-white/70 px-2 py-1 text-[11px] font-medium dark:bg-gray-950/40">{STATUS[table.status].label}</span>
                  </div>
                  <p className="mt-4 text-[12px] opacity-80">
                    {table.capacity} {copy.seats}
                  </p>
                  {canManage ? (
                    <div className="mt-3 flex gap-2 text-[12px] font-medium">
                      <button type="button" onClick={() => editTable(table)}>
                        {copy.edit}
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => removeTable(table)}
                        className="text-red-600 disabled:opacity-50 dark:text-red-300"
                      >
                        {copy.remove}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-gray-200 bg-white px-4 py-10 text-center dark:border-gray-800 dark:bg-gray-950">
              <p className="text-[14px] font-semibold">{copy.emptyTitle}</p>
              <p className="mt-1 text-[12px] text-gray-500">{canManage ? copy.emptyManage : copy.emptyView}</p>
              {canManage ? (
                <button
                  type="button"
                  onClick={quickCreate}
                  disabled={submitting}
                  className="mt-4 h-10 rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900"
                >
                  {copy.bootstrap}
                </button>
              ) : null}
            </div>
          )}
        </section>

        {canManage ? (
          <aside>
            <form onSubmit={saveTable} className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
              <h2 className="text-[14px] font-semibold">{editing ? copy.editForm : copy.createForm}</h2>
              <div className="mt-3 space-y-2">
                <input
                  value={form.table_number}
                  onChange={(e) => {
                    setForm({ ...form, table_number: e.target.value });
                    setFormError("");
                  }}
                  placeholder={copy.tablePlaceholder}
                  aria-invalid={Boolean(formError)}
                  className={`h-10 w-full rounded-md border bg-white px-3 text-[13px] outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:bg-gray-900 ${
                    formError ? "border-red-300 dark:border-red-900/60" : "border-gray-200 dark:border-gray-700"
                  }`}
                />
                {formError && <p className="-mt-0.5 text-[11px] font-medium text-red-600 dark:text-red-300">{formError}</p>}
                <input
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  type="number"
                  placeholder={copy.capacity}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900"
                />
                <input
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  placeholder={copy.zonePlaceholder}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] dark:border-gray-700 dark:bg-gray-900"
                />
                <ThemedSelect
                  value={form.status}
                  onChange={(next) => setForm({ ...form, status: next as TableStatus })}
                  options={[
                    { value: "free", label: STATUS.free.label },
                    { value: "occupied", label: STATUS.occupied.label },
                    { value: "reserved", label: STATUS.reserved.label },
                  ]}
                />
              </div>
              <button
                disabled={submitting}
                className="mt-3 h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900"
              >
                {editing ? copy.saveButtonEdit : copy.saveButtonCreate}
              </button>
            </form>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
