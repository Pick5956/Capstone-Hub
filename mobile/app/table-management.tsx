import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Image, Linking, Modal, Pressable, RefreshControl, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

import {
  bulkCreateTables,
  createTableTag,
  createTableZone,
  deleteTable,
  deleteTableTag,
  deleteTableZone,
  listTableTags,
  listTables,
  listTableZones,
  moveTableZone,
  regenerateTableCustomerToken,
  updateTable,
  updateTableTag,
  updateTableZone,
} from '@/src/api/table';
import { ChoiceRow, FormField, InlineActions } from '@/src/components/form-controls';
import { MotionPressable, MotionView } from '@/src/components/motion';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { tableStatusLabel } from '@/src/lib/format';
import { toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, inputStyles, layout, typeScale } from '@/src/theme';
import type { RestaurantTable, TableStatus, TableTag, TableZone } from '@/src/types/table';

type DeleteTarget =
  | { type: 'table'; table: RestaurantTable }
  | { type: 'zone'; zone: TableZone }
  | { type: 'tag'; tag: TableTag };

type ManagerKind = 'zone' | 'tag' | null;

const statusOptions: Array<{ label: string; value: TableStatus }> = [
  { label: 'ว่าง', value: 'free' },
  { label: 'ใช้งาน', value: 'occupied' },
  { label: 'จอง', value: 'reserved' },
];

const webUrl = (process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://dishy.pro').replace(/\/$/, '');

function emptyTableForm() {
  return { zoneId: 0, capacity: '2', count: '1', status: 'free' as TableStatus, tagIds: [] as number[] };
}

function statusTileStyle(status: TableStatus) {
  if (status === 'occupied') return { borderColor: '#FDE68A', backgroundColor: '#FFFBEB', color: '#B45309' };
  if (status === 'reserved') return { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF', color: '#0369A1' };
  return { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5', color: '#047857' };
}

export default function TableManagementScreen() {
  const { activeMembership } = useAuth();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [tags, setTags] = useState<TableTag[]>([]);
  const [zoneFilter, setZoneFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [tableDrawerOpen, setTableDrawerOpen] = useState(false);
  const [tableForm, setTableForm] = useState(emptyTableForm());
  const [managerOpen, setManagerOpen] = useState<ManagerKind>(null);
  const [editingZone, setEditingZone] = useState<TableZone | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zonePrefix, setZonePrefix] = useState('');
  const [zoneOrder, setZoneOrder] = useState('0');
  const [zoneActive, setZoneActive] = useState(true);
  const [editingTag, setEditingTag] = useState<TableTag | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagOrder, setTagOrder] = useState('0');
  const [tagActive, setTagActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canManage = can(activeMembership, 'manage_table');
  const activeZones = useMemo(() => zones.filter((zone) => zone.is_active), [zones]);
  const activeTags = useMemo(() => tags.filter((tag) => tag.is_active), [tags]);
  const occupiedCount = useMemo(() => tables.filter((table) => table.status === 'occupied').length, [tables]);
  const reservedCount = useMemo(() => tables.filter((table) => table.status === 'reserved').length, [tables]);
  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const zoneMatch = zoneFilter === 'all' || (zoneFilter === 'none' ? !table.zone_id : table.zone_id === Number(zoneFilter));
      const tagMatch = tagFilter === 'all' || table.tags?.some((tag) => tag.ID === Number(tagFilter));
      return zoneMatch && tagMatch;
    });
  }, [tables, tagFilter, zoneFilter]);
  const bulkPreview = useMemo(() => {
    const count = Math.max(1, toInt(tableForm.count, 1));
    const zone = activeZones.find((item) => item.ID === tableForm.zoneId);
    const existing = tables.filter((table) => tableForm.zoneId ? table.zone_id === tableForm.zoneId : !table.zone_id);
    const next = Math.max(0, ...existing.map((table) => table.sequence_number || 0)) + 1;
    const label = (sequence: number) => zone ? `${zone.prefix || 'Z'}${String(sequence).padStart(2, '0')}` : `T${sequence}`;
    return count === 1 ? label(next) : `${label(next)}-${label(next + count - 1)}`;
  }, [activeZones, tableForm.count, tableForm.zoneId, tables]);
  const customerOrderLink = editingTable?.customer_token ? `${webUrl}/customer/t/${editingTable.customer_token}` : '';
  const customerOrderQr = customerOrderLink ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(customerOrderLink)}` : '';

  const zoneOptions = useMemo(() => [
    { label: 'ไม่มีโซน', value: 0 },
    ...activeZones.map((zone) => ({ label: `${zone.name}${zone.prefix ? ` (${zone.prefix})` : ''}`, value: zone.ID })),
  ], [activeZones]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tableResponse, zoneResponse, tagResponse] = await Promise.all([
        listTables(),
        listTableZones(),
        listTableTags(),
      ]);
      setTables(tableResponse.tables ?? []);
      setZones(zoneResponse.zones ?? []);
      setTags(tagResponse.tags ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดข้อมูลผังโต๊ะไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startCreateTable() {
    setEditingTable(null);
    setTableForm(emptyTableForm());
    setFormError(null);
    router.push({ pathname: '/table-management/table', params: { mode: 'create' } } as never);
  }

  function startEditTable(table: RestaurantTable) {
    setEditingTable(table);
    setTableForm({
      zoneId: table.zone_id || 0,
      capacity: String(table.capacity || 2),
      count: '1',
      status: table.status,
      tagIds: table.tags?.map((tag) => tag.ID) || [],
    });
    setFormError(null);
    router.push({ pathname: '/table-management/table', params: { tableId: String(table.ID) } } as never);
  }

  function closeTableDrawer() {
    setTableDrawerOpen(false);
    setEditingTable(null);
    setTableForm(emptyTableForm());
    setFormError(null);
  }

  function toggleTableTag(id: number) {
    setTableForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(id) ? current.tagIds.filter((tagId) => tagId !== id) : [...current.tagIds, id],
    }));
  }

  async function saveTable() {
    if (!canManage || submitting) return;
    const safeCapacity = Math.min(50, Math.max(1, toInt(tableForm.capacity, 2)));
    const safeCount = Math.min(200, Math.max(1, toInt(tableForm.count, 1)));
    const payload = {
      zone_id: tableForm.zoneId || null,
      capacity: safeCapacity,
      status: tableForm.status,
      tag_ids: tableForm.tagIds,
    };

    const persist = async () => {
      setSubmitting(true);
      setFormError(null);
      setMessage(null);
      try {
        if (editingTable) {
          let nextZone = editingTable.zone_id ?? null;
          if ((editingTable.zone_id || 0) !== tableForm.zoneId) {
            const moved = await moveTableZone(editingTable.ID, { zone_id: payload.zone_id });
            nextZone = moved.zone_id ?? null;
          }
          await updateTable(editingTable.ID, { ...payload, zone_id: nextZone });
          setMessage('อัปเดตโต๊ะแล้ว');
        } else {
          await bulkCreateTables({ ...payload, count: safeCount });
          setMessage(safeCount > 1 ? 'สร้างชุดโต๊ะแล้ว' : 'เพิ่มโต๊ะแล้ว');
        }
        closeTableDrawer();
        await load();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
      } finally {
        setSubmitting(false);
      }
    };

    if (!editingTable && safeCount > 1) {
      Alert.alert('สร้างโต๊ะเป็นชุด?', 'ระบบจะเพิ่มโต๊ะหลายรายการตามจำนวนที่ตั้งไว้และอัปเดตผังโต๊ะทันที', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ยืนยันสร้างโต๊ะ', onPress: persist },
      ]);
      return;
    }

    await persist();
  }

  function openZoneManager(zone?: TableZone) {
    setManagerOpen('zone');
    setFormError(null);
    if (zone) {
      setEditingZone(zone);
      setZoneName(zone.name);
      setZonePrefix(zone.prefix || '');
      setZoneOrder(String(zone.display_order || 0));
      setZoneActive(zone.is_active);
    } else if (!editingZone) {
      setZoneName('');
      setZonePrefix('');
      setZoneOrder(String(zones.length + 1));
      setZoneActive(true);
    }
  }

  function openTagManager(tag?: TableTag) {
    setManagerOpen('tag');
    setFormError(null);
    if (tag) {
      setEditingTag(tag);
      setTagName(tag.name);
      setTagOrder(String(tag.display_order || 0));
      setTagActive(tag.is_active);
    } else if (!editingTag) {
      setTagName('');
      setTagOrder(String(tags.length + 1));
      setTagActive(true);
    }
  }

  function resetZoneForm() {
    setEditingZone(null);
    setZoneName('');
    setZonePrefix('');
    setZoneOrder(String(zones.length + 1));
    setZoneActive(true);
  }

  function resetTagForm() {
    setEditingTag(null);
    setTagName('');
    setTagOrder(String(tags.length + 1));
    setTagActive(true);
  }

  async function saveZone() {
    if (!zoneName.trim()) {
      setFormError('กรอกชื่อก่อนบันทึก');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: zoneName.trim(),
        prefix: zonePrefix.trim().toUpperCase(),
        display_order: toInt(zoneOrder, 0),
        is_active: zoneActive,
      };
      if (editingZone) await updateTableZone(editingZone.ID, payload);
      else await createTableZone(payload);
      setMessage(editingZone ? 'อัปเดตโซนแล้ว' : 'เพิ่มโซนแล้ว');
      resetZoneForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTag() {
    if (!tagName.trim()) {
      setFormError('กรอกชื่อก่อนบันทึก');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = { name: tagName.trim(), color: 'gray', display_order: toInt(tagOrder, 0), is_active: tagActive };
      if (editingTag) await updateTableTag(editingTag.ID, payload);
      else await createTableTag(payload);
      setMessage(editingTag ? 'อัปเดต tag แล้ว' : 'เพิ่ม tag แล้ว');
      resetTagForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDelete(target: DeleteTarget) {
    Alert.alert('ยืนยันการลบ', 'ต้องการลบรายการนี้ใช่ไหม?', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            if (target.type === 'table') {
              await deleteTable(target.table.ID);
              closeTableDrawer();
            }
            if (target.type === 'zone') {
              await deleteTableZone(target.zone.ID);
              resetZoneForm();
            }
            if (target.type === 'tag') {
              await deleteTableTag(target.tag.ID);
              resetTagForm();
            }
            setMessage('ลบข้อมูลแล้ว');
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'ลบข้อมูลไม่สำเร็จ');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }

  function regenerateCustomerQr() {
    if (!editingTable) return;
    Alert.alert('สร้าง QR โต๊ะนี้ใหม่?', 'ลิงก์และ QR เดิมจะใช้ไม่ได้ทันที ลูกค้าที่เปิดจาก QR เก่าจะต้องสแกน QR ใหม่', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'สร้าง QR ใหม่',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = await regenerateTableCustomerToken(editingTable.ID);
            setEditingTable(updated);
            setMessage('สร้าง QR ใหม่แล้ว');
            await load();
          } catch (err) {
            setFormError(err instanceof Error ? err.message : 'สร้าง QR ใหม่ไม่สำเร็จ');
          }
        },
      },
    ]);
  }

  async function shareCustomerLink() {
    if (!customerOrderLink) return;
    await Share.share({ message: customerOrderLink, url: customerOrderLink });
  }

  async function openCustomerMenu() {
    if (!customerOrderLink) return;
    await Linking.openURL(customerOrderLink);
  }

  async function openQrImage() {
    if (!customerOrderQr) return;
    await Linking.openURL(customerOrderQr);
  }

  return (
    <>
      <MobileScreen
        kicker="TABLES"
        title="ผังโต๊ะ"
        subtitle="จัดโซน เลขโต๊ะ และคุณสมบัติโต๊ะสำหรับร้านทุกขนาด"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {!canManage ? (
          <StateMessage title="ไม่มีสิทธิ์จัดการโต๊ะ" detail="หน้านี้สำหรับ owner, manager หรือสิทธิ์ manage_table" />
        ) : null}

        {error ? <StateMessage title="ทำรายการไม่สำเร็จ" detail={error} /> : null}
        {message ? <Text selectable style={[typeScale.caption, { color: colors.accent }]}>{message}</Text> : null}

        <Pressable onPress={load} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>รีเฟรช</Text>
        </Pressable>

        <View style={layout.grid}>
          {[
            { label: 'โต๊ะทั้งหมด', value: tables.length },
            { label: 'ใช้งาน', value: occupiedCount },
            { label: 'จอง', value: reservedCount },
            { label: 'โซน', value: zones.length },
          ].map((item) => (
            <View key={item.label} style={[layout.tile, { minHeight: 82 }]}>
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>{item.label}</Text>
              <Text selectable style={[typeScale.title, { fontVariant: ['tabular-nums'] }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        {canManage ? (
          <View style={layout.panel}>
            <Pressable onPress={startCreateTable} style={layout.primaryButton}>
              <Text style={layout.primaryButtonText}>+ เพิ่มโต๊ะ</Text>
            </Pressable>
            <View style={layout.headerRow}>
              <Pressable onPress={() => router.push('/table-management/zones' as never)} style={[layout.secondaryButton, { flex: 1 }]}>
                <Text style={layout.secondaryButtonText}>จัดการโซน</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/table-management/tags' as never)} style={[layout.secondaryButton, { flex: 1 }]}>
                <Text style={layout.secondaryButtonText}>จัดการ tags</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={layout.panel}>
          <ChoiceRow
            label="โซน"
            value={zoneFilter}
            options={[{ label: 'ทุกโซน', value: 'all' }, { label: 'ไม่มีโซน', value: 'none' }, ...activeZones.map((zone) => ({ label: zone.name, value: String(zone.ID) }))]}
            onChange={setZoneFilter}
          />
          <ChoiceRow
            label="Tag"
            value={tagFilter}
            options={[{ label: 'ทุก tag', value: 'all' }, ...activeTags.map((tag) => ({ label: tag.name, value: String(tag.ID) }))]}
            onChange={setTagFilter}
          />
        </View>

        {!loading && filteredTables.length === 0 ? (
          <StateMessage title="ยังไม่มีโต๊ะ" detail={canManage ? 'สร้างโต๊ะเป็นชุดเพื่อให้ระบบออกเลขให้อัตโนมัติ' : 'เจ้าของร้านยังไม่ได้ตั้งค่าโต๊ะ'} />
        ) : null}

        <View style={layout.grid}>
          {filteredTables.map((table, index) => {
            const meta = statusTileStyle(table.status);
            return (
              <MotionPressable
                key={table.ID}
                delay={80 + index * 25}
                disabled={!canManage}
                onPress={() => startEditTable(table)}
                style={({ pressed }) => [
                  layout.tile,
                  { minHeight: 148, backgroundColor: meta.backgroundColor, borderColor: meta.borderColor },
                  pressed && { borderColor: colors.primary },
                ]}
              >
                <View style={layout.headerRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text selectable numberOfLines={1} style={typeScale.title}>{table.display_label || table.table_number}</Text>
                    <Text selectable numberOfLines={1} style={[typeScale.caption, { color: colors.muted }]}>
                      {table.table_zone?.name || table.zone || 'ไม่มีโซน'}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.72)', paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text selectable style={[typeScale.caption, { color: meta.color, fontWeight: '900' }]}>{tableStatusLabel(table.status)}</Text>
                  </View>
                </View>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>{table.capacity} ที่นั่ง</Text>
                {table.tags?.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {table.tags.map((tag) => (
                      <View key={tag.ID} style={{ borderWidth: 1, borderColor: colors.text, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.85)' }}>
                        <Text selectable style={[typeScale.caption, { fontSize: 12, lineHeight: 16, color: colors.text, fontWeight: '800' }]}>{tag.name}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </MotionPressable>
            );
          })}
        </View>
      </MobileScreen>

      <TableDrawer
        activeTags={activeTags}
        bulkPreview={bulkPreview}
        canManage={canManage}
        customerOrderLink={customerOrderLink}
        customerOrderQr={customerOrderQr}
        editingTable={editingTable}
        formError={formError}
        onClose={closeTableDrawer}
        onDelete={() => editingTable && confirmDelete({ type: 'table', table: editingTable })}
        onOpenCustomerMenu={openCustomerMenu}
        onOpenQrImage={openQrImage}
        onRegenerateQr={regenerateCustomerQr}
        onSave={saveTable}
        onShareLink={shareCustomerLink}
        onToggleTag={toggleTableTag}
        open={tableDrawerOpen}
        setTableForm={setTableForm}
        submitting={submitting}
        tableForm={tableForm}
        zoneOptions={zoneOptions}
      />

      <ZoneManagerModal
        editingZone={editingZone}
        formError={formError}
        onClose={() => setManagerOpen(null)}
        onDelete={(zone) => confirmDelete({ type: 'zone', zone })}
        onEdit={openZoneManager}
        onReset={resetZoneForm}
        onSave={saveZone}
        open={managerOpen === 'zone'}
        setZoneActive={setZoneActive}
        setZoneName={setZoneName}
        setZoneOrder={setZoneOrder}
        setZonePrefix={setZonePrefix}
        submitting={submitting}
        zoneActive={zoneActive}
        zoneName={zoneName}
        zoneOrder={zoneOrder}
        zonePrefix={zonePrefix}
        zones={zones}
      />

      <TagManagerModal
        editingTag={editingTag}
        formError={formError}
        onClose={() => setManagerOpen(null)}
        onDelete={(tag) => confirmDelete({ type: 'tag', tag })}
        onEdit={openTagManager}
        onReset={resetTagForm}
        onSave={saveTag}
        open={managerOpen === 'tag'}
        setTagActive={setTagActive}
        setTagName={setTagName}
        setTagOrder={setTagOrder}
        submitting={submitting}
        tagActive={tagActive}
        tagName={tagName}
        tagOrder={tagOrder}
        tags={tags}
      />
    </>
  );
}

function AppModal({ children, onClose, open }: { children: React.ReactNode; onClose: () => void; open: boolean }) {
  const keyboard = useAnimatedKeyboard();
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(keyboard.height.value - 10, 0) }],
  }));

  return (
    <Modal animationType="none" transparent visible={open} onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.44)', padding: 14 }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <Animated.View
          entering={SlideInDown.duration(220)}
          exiting={SlideOutDown.duration(160)}
          style={[layout.panel, { maxHeight: '74%', padding: 0, overflow: 'hidden' }, sheetStyle]}
        >
          <ScrollView
            contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 34 }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function TableDrawer({
  activeTags,
  bulkPreview,
  canManage,
  customerOrderLink,
  customerOrderQr,
  editingTable,
  formError,
  onClose,
  onDelete,
  onOpenCustomerMenu,
  onOpenQrImage,
  onRegenerateQr,
  onSave,
  onShareLink,
  onToggleTag,
  open,
  setTableForm,
  submitting,
  tableForm,
  zoneOptions,
}: {
  activeTags: TableTag[];
  bulkPreview: string;
  canManage: boolean;
  customerOrderLink: string;
  customerOrderQr: string;
  editingTable: RestaurantTable | null;
  formError: string | null;
  onClose: () => void;
  onDelete: () => void;
  onOpenCustomerMenu: () => void;
  onOpenQrImage: () => void;
  onRegenerateQr: () => void;
  onSave: () => void;
  onShareLink: () => void;
  onToggleTag: (id: number) => void;
  open: boolean;
  setTableForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyTableForm>>>;
  submitting: boolean;
  tableForm: ReturnType<typeof emptyTableForm>;
  zoneOptions: Array<{ label: string; value: number }>;
}) {
  return (
    <AppModal open={open && canManage} onClose={onClose}>
      <View style={layout.headerRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text selectable style={typeScale.kicker}>ตั้งค่าโต๊ะ</Text>
          <Text selectable style={typeScale.title}>{editingTable ? 'บันทึกโต๊ะ' : 'เพิ่มโต๊ะ'}</Text>
          <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
            {editingTable ? `เลขโต๊ะออกให้อัตโนมัติ: ${editingTable.display_label || editingTable.table_number}` : 'เลขโต๊ะออกให้อัตโนมัติ'}
          </Text>
        </View>
        <Pressable onPress={onClose} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>ปิด</Text>
        </Pressable>
      </View>

      <View style={{ gap: 12 }}>
        <ChoiceRow
          label="โซน"
          value={tableForm.zoneId}
          options={zoneOptions}
          onChange={(value) => setTableForm((current) => ({ ...current, zoneId: value }))}
        />
        {!editingTable ? (
          <FormField
            keyboardType="numeric"
            label="จำนวนโต๊ะ"
            onChangeText={(value) => setTableForm((current) => ({ ...current, count: value }))}
            value={tableForm.count}
          />
        ) : null}
        <FormField
          keyboardType="numeric"
          label="จำนวนที่นั่ง"
          onChangeText={(value) => setTableForm((current) => ({ ...current, capacity: value }))}
          value={tableForm.capacity}
        />
        <ChoiceRow
          label="สถานะ"
          value={tableForm.status}
          options={statusOptions}
          onChange={(value) => setTableForm((current) => ({ ...current, status: value }))}
        />
        {!editingTable ? (
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }}>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              ตัวอย่างเลข: <Text style={{ color: colors.text, fontWeight: '900' }}>{bulkPreview}</Text>
            </Text>
          </View>
        ) : null}
        {activeTags.length ? (
          <View style={{ gap: 8 }}>
            <Text selectable style={inputStyles.label}>Tags</Text>
            <InlineActions>
              {activeTags.map((tag) => {
                const active = tableForm.tagIds.includes(tag.ID);
                return (
                  <Pressable
                    key={tag.ID}
                    onPress={() => onToggleTag(tag.ID)}
                    style={[layout.secondaryButton, active && { borderColor: colors.text }]}
                  >
                    <Text style={layout.secondaryButtonText}>{tag.name}</Text>
                  </Pressable>
                );
              })}
            </InlineActions>
          </View>
        ) : null}
      </View>

      {editingTable && customerOrderLink ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: '#F8FAFC', padding: 12, gap: 12 }}>
          <View style={layout.headerRow}>
            <Image source={{ uri: customerOrderQr }} style={{ width: 96, height: 96, borderRadius: 8, backgroundColor: '#FFFFFF' }} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text selectable style={typeScale.cardTitle}>QR สั่งอาหาร</Text>
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                ให้ลูกค้าสแกนเพื่อเปิดเมนูโต๊ะนี้และส่งออเดอร์เข้าครัวโดยไม่ต้องล็อกอิน
              </Text>
              <Text selectable numberOfLines={1} style={[typeScale.caption, { color: colors.placeholder }]}>{customerOrderLink}</Text>
            </View>
          </View>
          <View style={layout.headerRow}>
            <Pressable onPress={onShareLink} style={[layout.secondaryButton, { flex: 1 }]}>
              <Text style={layout.secondaryButtonText}>คัดลอกลิงก์</Text>
            </Pressable>
            <Pressable onPress={onOpenQrImage} style={[layout.secondaryButton, { flex: 1 }]}>
              <Text style={layout.secondaryButtonText}>โหลด QR</Text>
            </Pressable>
          </View>
          <Pressable onPress={onOpenCustomerMenu} style={layout.primaryButton}>
            <Text style={layout.primaryButtonText}>เปิดหน้าเมนูลูกค้า</Text>
          </Pressable>
          <Pressable onPress={onRegenerateQr} style={layout.secondaryButton}>
            <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>สร้าง QR ใหม่</Text>
          </Pressable>
        </View>
      ) : null}

      {editingTable ? (
        <Pressable onPress={onDelete} style={layout.secondaryButton}>
          <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>ลบ</Text>
        </Pressable>
      ) : null}
      <Pressable disabled={submitting} onPress={onSave} style={[layout.primaryButton, submitting && { opacity: 0.65 }]}>
        <Text style={layout.primaryButtonText}>{submitting ? 'กำลังบันทึก...' : editingTable ? 'บันทึกโต๊ะ' : 'เพิ่มโต๊ะ'}</Text>
      </Pressable>
      {formError ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{formError}</Text> : null}
    </AppModal>
  );
}

function ZoneManagerModal(props: {
  editingZone: TableZone | null;
  formError: string | null;
  onClose: () => void;
  onDelete: (zone: TableZone) => void;
  onEdit: (zone: TableZone) => void;
  onReset: () => void;
  onSave: () => void;
  open: boolean;
  setZoneActive: (value: boolean) => void;
  setZoneName: (value: string) => void;
  setZoneOrder: (value: string) => void;
  setZonePrefix: (value: string) => void;
  submitting: boolean;
  zoneActive: boolean;
  zoneName: string;
  zoneOrder: string;
  zonePrefix: string;
  zones: TableZone[];
}) {
  return (
    <AppModal open={props.open} onClose={props.onClose}>
      <ManagerHeader title="จัดการโซน" onClose={props.onClose} />
      <View style={{ gap: 10 }}>
        {props.zones.map((zone) => (
          <ManagerRow
            key={zone.ID}
            muted={!zone.is_active}
            onDelete={() => props.onDelete(zone)}
            onPress={() => props.onEdit(zone)}
            selected={props.editingZone?.ID === zone.ID}
            title={`${zone.name}${zone.prefix ? ` (${zone.prefix})` : ''}`}
          />
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 12 }}>
        <FormField label="ชื่อโซน" value={props.zoneName} onChangeText={props.setZoneName} />
        <FormField label="Prefix" value={props.zonePrefix} onChangeText={props.setZonePrefix} />
        <FormField keyboardType="numeric" label="ลำดับ" value={props.zoneOrder} onChangeText={props.setZoneOrder} />
        <ToggleLine label="เปิดใช้งาน" value={props.zoneActive} onValueChange={props.setZoneActive} />
        <Pressable disabled={props.submitting} onPress={props.onSave} style={layout.primaryButton}>
          <Text style={layout.primaryButtonText}>{props.editingZone ? 'บันทึกโซน' : 'เพิ่มโซน'}</Text>
        </Pressable>
        {props.editingZone ? (
          <Pressable onPress={props.onReset} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>ยกเลิกแก้ไข</Text>
          </Pressable>
        ) : null}
        {props.formError ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{props.formError}</Text> : null}
      </View>
    </AppModal>
  );
}

function TagManagerModal(props: {
  editingTag: TableTag | null;
  formError: string | null;
  onClose: () => void;
  onDelete: (tag: TableTag) => void;
  onEdit: (tag: TableTag) => void;
  onReset: () => void;
  onSave: () => void;
  open: boolean;
  setTagActive: (value: boolean) => void;
  setTagName: (value: string) => void;
  setTagOrder: (value: string) => void;
  submitting: boolean;
  tagActive: boolean;
  tagName: string;
  tagOrder: string;
  tags: TableTag[];
}) {
  return (
    <AppModal open={props.open} onClose={props.onClose}>
      <ManagerHeader title="จัดการ tags" onClose={props.onClose} />
      <View style={{ gap: 10 }}>
        {props.tags.map((tag) => (
          <ManagerRow
            key={tag.ID}
            badge
            muted={!tag.is_active}
            onDelete={() => props.onDelete(tag)}
            onPress={() => props.onEdit(tag)}
            selected={props.editingTag?.ID === tag.ID}
            title={tag.name}
          />
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 12 }}>
        <FormField label="ชื่อ tag" value={props.tagName} onChangeText={props.setTagName} />
        <FormField keyboardType="numeric" label="ลำดับ" value={props.tagOrder} onChangeText={props.setTagOrder} />
        <ToggleLine label="เปิดใช้งาน" value={props.tagActive} onValueChange={props.setTagActive} />
        <Pressable disabled={props.submitting} onPress={props.onSave} style={layout.primaryButton}>
          <Text style={layout.primaryButtonText}>{props.editingTag ? 'บันทึก tag' : 'เพิ่ม tag'}</Text>
        </Pressable>
        {props.editingTag ? (
          <Pressable onPress={props.onReset} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>ยกเลิกแก้ไข</Text>
          </Pressable>
        ) : null}
        {props.formError ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{props.formError}</Text> : null}
      </View>
    </AppModal>
  );
}

function ManagerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={layout.headerRow}>
      <Text selectable style={[typeScale.title, { flex: 1 }]}>{title}</Text>
      <Pressable onPress={onClose} style={layout.secondaryButton}>
        <Text style={layout.secondaryButtonText}>ปิด</Text>
      </Pressable>
    </View>
  );
}

function ManagerRow({
  badge,
  muted,
  onDelete,
  onPress,
  selected,
  title,
}: {
  badge?: boolean;
  muted?: boolean;
  onDelete: () => void;
  onPress: () => void;
  selected?: boolean;
  title: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        layout.card,
        selected && { borderColor: colors.primary, backgroundColor: '#FFF7ED' },
      ]}
    >
      <View style={{ flex: 1 }}>
        {badge ? (
          <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.text, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text selectable style={[typeScale.caption, { color: colors.text, fontWeight: '900' }]}>{title}</Text>
          </View>
        ) : (
          <Text selectable style={[typeScale.cardTitle, muted && { color: colors.placeholder, textDecorationLine: 'line-through' }]}>{title}</Text>
        )}
      </View>
      <Pressable onPress={onDelete} style={layout.secondaryButton}>
        <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>ลบ</Text>
      </Pressable>
    </Pressable>
  );
}

function ToggleLine({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={layout.headerRow}>
      <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}
