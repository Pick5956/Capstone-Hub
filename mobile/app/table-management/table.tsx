import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  bulkCreateTables,
  deleteTable,
  listTableTags,
  listTables,
  listTableZones,
  moveTableZone,
  regenerateTableCustomerToken,
  updateTable,
} from '@/src/api/table';
import { ChoiceRow, FormField, InlineActions } from '@/src/components/form-controls';
import { StateMessage } from '@/src/components/mobile-screen';
import { toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, inputStyles, layout, typeScale } from '@/src/theme';
import type { RestaurantTable, TableStatus, TableTag, TableZone } from '@/src/types/table';

const statusOptions: Array<{ label: string; value: TableStatus }> = [
  { label: 'ว่าง', value: 'free' },
  { label: 'ใช้งาน', value: 'occupied' },
  { label: 'จอง', value: 'reserved' },
];

const webUrl = (process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://dishy.pro').replace(/\/$/, '');

type TableForm = {
  zoneId: number;
  capacity: string;
  count: string;
  status: TableStatus;
  tagIds: number[];
};

function emptyTableForm(): TableForm {
  return { zoneId: 0, capacity: '2', count: '1', status: 'free', tagIds: [] };
}

export default function TableFormScreen() {
  const { activeMembership } = useAuth();
  const params = useLocalSearchParams<{ tableId?: string; mode?: string }>();
  const editingId = params.tableId ? Number(params.tableId) : null;
  const isEditing = Number.isFinite(editingId) && editingId !== null;
  const canManage = can(activeMembership, 'manage_table');
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const footerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(keyboard.height.value - insets.bottom, 0) }],
  }));

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [tags, setTags] = useState<TableTag[]>([]);
  const [form, setForm] = useState<TableForm>(emptyTableForm());
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const editingTable = useMemo(
    () => (isEditing ? tables.find((table) => table.ID === editingId) ?? null : null),
    [editingId, isEditing, tables],
  );
  const activeZones = useMemo(() => zones.filter((zone) => zone.is_active), [zones]);
  const activeTags = useMemo(() => tags.filter((tag) => tag.is_active), [tags]);
  const zoneOptions = useMemo(() => [
    { label: 'ไม่มีโซน', value: 0 },
    ...activeZones.map((zone) => ({ label: `${zone.name}${zone.prefix ? ` (${zone.prefix})` : ''}`, value: zone.ID })),
  ], [activeZones]);
  const bulkPreview = useMemo(() => {
    const count = Math.max(1, toInt(form.count, 1));
    const zone = activeZones.find((item) => item.ID === form.zoneId);
    const existing = tables.filter((table) => (form.zoneId ? table.zone_id === form.zoneId : !table.zone_id));
    const next = Math.max(0, ...existing.map((table) => table.sequence_number || 0)) + 1;
    const label = (sequence: number) => (zone ? `${zone.prefix || 'Z'}${String(sequence).padStart(2, '0')}` : `T${sequence}`);
    return count === 1 ? label(next) : `${label(next)}-${label(next + count - 1)}`;
  }, [activeZones, form.count, form.zoneId, tables]);
  const customerOrderLink = editingTable?.customer_token ? `${webUrl}/customer/t/${editingTable.customer_token}` : '';
  const customerOrderQr = customerOrderLink ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(customerOrderLink)}` : '';

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
      setError(err instanceof Error ? err.message : 'โหลดข้อมูลโต๊ะไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialized || loading) return;
    if (isEditing) {
      if (!editingTable) return;
      setForm({
        zoneId: editingTable.zone_id || 0,
        capacity: String(editingTable.capacity || 2),
        count: '1',
        status: editingTable.status,
        tagIds: editingTable.tags?.map((tag) => tag.ID) || [],
      });
    } else {
      setForm(emptyTableForm());
    }
    setInitialized(true);
  }, [editingTable, initialized, isEditing, loading]);

  if (!activeMembership) return <Redirect href="/restaurants" />;

  function toggleTag(id: number) {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(id) ? current.tagIds.filter((tagId) => tagId !== id) : [...current.tagIds, id],
    }));
  }

  async function persist() {
    if (!canManage || submitting) return;
    const safeCapacity = Math.min(50, Math.max(1, toInt(form.capacity, 2)));
    const safeCount = Math.min(200, Math.max(1, toInt(form.count, 1)));
    const payload = {
      zone_id: form.zoneId || null,
      capacity: safeCapacity,
      status: form.status,
      tag_ids: form.tagIds,
    };

    setSubmitting(true);
    setFormError(null);
    try {
      if (editingTable) {
        let nextZone = editingTable.zone_id ?? null;
        if ((editingTable.zone_id || 0) !== form.zoneId) {
          const moved = await moveTableZone(editingTable.ID, { zone_id: payload.zone_id });
          nextZone = moved.zone_id ?? null;
        }
        await updateTable(editingTable.ID, { ...payload, zone_id: nextZone });
      } else {
        await bulkCreateTables({ ...payload, count: safeCount });
      }
      router.replace('/table-management' as never);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกข้อมูลโต๊ะไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTable() {
    if (!editingTable && Math.max(1, toInt(form.count, 1)) > 1) {
      Alert.alert('สร้างโต๊ะเป็นชุด?', 'ระบบจะเพิ่มโต๊ะหลายรายการตามจำนวนที่ตั้งไว้และอัปเดตผังโต๊ะทันที', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ยืนยันสร้างโต๊ะ', onPress: persist },
      ]);
      return;
    }
    await persist();
  }

  function confirmDelete() {
    if (!editingTable) return;
    Alert.alert('ยืนยันการลบ', `ต้องการลบโต๊ะ ${editingTable.display_label || editingTable.table_number} ใช่ไหม?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          setFormError(null);
          try {
            await deleteTable(editingTable.ID);
            router.replace('/table-management' as never);
          } catch (err) {
            setFormError(err instanceof Error ? err.message : 'ลบโต๊ะไม่สำเร็จ');
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
          setSubmitting(true);
          setFormError(null);
          try {
            const updated = await regenerateTableCustomerToken(editingTable.ID);
            setTables((current) => current.map((table) => (table.ID === updated.ID ? updated : table)));
          } catch (err) {
            setFormError(err instanceof Error ? err.message : 'สร้าง QR ใหม่ไม่สำเร็จ');
          } finally {
            setSubmitting(false);
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
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[layout.scrollContainer, { paddingBottom: 150 }]}
      >
        <View style={layout.headerRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text selectable style={typeScale.kicker}>TABLES</Text>
            <Text selectable style={typeScale.hero}>{editingTable ? 'บันทึกโต๊ะ' : 'เพิ่มโต๊ะ'}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              {editingTable ? `เลขโต๊ะออกให้อัตโนมัติ: ${editingTable.display_label || editingTable.table_number}` : 'สร้างโต๊ะเดี่ยวหรือสร้างเป็นชุดในครั้งเดียว'}
            </Text>
          </View>
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>กลับ</Text>
          </Pressable>
        </View>

        {!canManage ? (
          <StateMessage title="ไม่มีสิทธิ์จัดการโต๊ะ" detail="หน้านี้สำหรับ owner, manager หรือสิทธิ์ manage_table" />
        ) : null}
        {error ? <StateMessage title="ทำรายการไม่สำเร็จ" detail={error} /> : null}
        {isEditing && !loading && !editingTable ? (
          <StateMessage title="ไม่พบโต๊ะ" detail="โต๊ะนี้อาจถูกลบหรือข้อมูลยังไม่ถูกรีเฟรช" />
        ) : null}

        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>ตั้งค่าโต๊ะ</Text>
          <ChoiceRow
            label="โซน"
            value={form.zoneId}
            options={zoneOptions}
            onChange={(value) => setForm((current) => ({ ...current, zoneId: value }))}
          />
          {!editingTable ? (
            <FormField
              keyboardType="numeric"
              label="จำนวนโต๊ะ"
              onChangeText={(value) => setForm((current) => ({ ...current, count: value }))}
              value={form.count}
            />
          ) : null}
          <FormField
            keyboardType="numeric"
            label="จำนวนที่นั่ง"
            onChangeText={(value) => setForm((current) => ({ ...current, capacity: value }))}
            value={form.capacity}
          />
          <ChoiceRow
            label="สถานะ"
            value={form.status}
            options={statusOptions}
            onChange={(value) => setForm((current) => ({ ...current, status: value }))}
          />
          {!editingTable ? (
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }}>
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                ตัวอย่างเลข: <Text style={{ color: colors.text, fontWeight: '900' }}>{bulkPreview}</Text>
              </Text>
            </View>
          ) : null}
        </View>

        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>Tags</Text>
          {activeTags.length ? (
            <InlineActions>
              {activeTags.map((tag) => {
                const active = form.tagIds.includes(tag.ID);
                return (
                  <Pressable
                    key={tag.ID}
                    onPress={() => toggleTag(tag.ID)}
                    style={[layout.secondaryButton, active && { borderColor: colors.text, backgroundColor: '#FFF7ED' }]}
                  >
                    <Text style={layout.secondaryButtonText}>{tag.name}</Text>
                  </Pressable>
                );
              })}
            </InlineActions>
          ) : (
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>ยังไม่มี tag สำหรับโต๊ะ</Text>
          )}
        </View>

        {editingTable && customerOrderLink ? (
          <View style={layout.panel}>
            <Text selectable style={typeScale.cardTitle}>QR สั่งอาหาร</Text>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <Image source={{ uri: customerOrderQr }} style={{ width: 112, height: 112, borderRadius: 8, backgroundColor: '#FFFFFF' }} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  ให้ลูกค้าสแกนเพื่อเปิดเมนูโต๊ะนี้และส่งออเดอร์เข้าครัวโดยไม่ต้องล็อกอิน
                </Text>
                <Text selectable numberOfLines={2} style={[typeScale.caption, { color: colors.placeholder }]}>{customerOrderLink}</Text>
              </View>
            </View>
            <View style={layout.headerRow}>
              <Pressable onPress={shareCustomerLink} style={[layout.secondaryButton, { flex: 1 }]}>
                <Text style={layout.secondaryButtonText}>แชร์/คัดลอกลิงก์</Text>
              </Pressable>
              <Pressable onPress={openQrImage} style={[layout.secondaryButton, { flex: 1 }]}>
                <Text style={layout.secondaryButtonText}>โหลด QR</Text>
              </Pressable>
            </View>
            <Pressable onPress={openCustomerMenu} style={layout.primaryButton}>
              <Text style={layout.primaryButtonText}>เปิดหน้าเมนูลูกค้า</Text>
            </Pressable>
            <Pressable onPress={regenerateCustomerQr} style={layout.secondaryButton}>
              <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>สร้าง QR ใหม่</Text>
            </Pressable>
          </View>
        ) : null}

        {editingTable ? (
          <View style={layout.panel}>
            <Text selectable style={typeScale.cardTitle}>การลบโต๊ะ</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>ลบเฉพาะเมื่อโต๊ะนี้ไม่ได้ใช้งานแล้ว</Text>
            <Pressable onPress={confirmDelete} style={layout.secondaryButton}>
              <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>ลบโต๊ะ</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.canvas,
            padding: 16,
            paddingBottom: Math.max(insets.bottom, 12) + 10,
          },
          footerStyle,
        ]}
      >
        {formError ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{formError}</Text> : null}
        <Pressable disabled={!canManage || submitting || (isEditing && !editingTable)} onPress={saveTable} style={[layout.primaryButton, (!canManage || submitting || (isEditing && !editingTable)) && { opacity: 0.65 }]}>
          <Text style={layout.primaryButtonText}>
            {submitting ? 'กำลังบันทึก...' : editingTable ? 'บันทึกโต๊ะ' : 'เพิ่มโต๊ะ'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
