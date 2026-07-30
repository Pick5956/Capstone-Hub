import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
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
import { AppText as Text } from '@/src/components/app-text';
import { ChoiceRow, FormField, InlineActions } from '@/src/components/form-controls';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { StatusBadge } from '@/src/components/ui';
import { tableStatusLabel } from '@/src/lib/format';
import { toInt } from '@/src/lib/forms';
import { customerTableUrl } from '@/src/lib/public-web-url';
import { can } from '@/src/lib/rbac';
import { parsePositiveRouteId } from '@/src/lib/route-id';
import { canEditTableAvailability, tableEditorSaveStatus } from '@/src/lib/table-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { colors, layout, typeScale } from '@/src/theme';
import type { RestaurantTable, TableStatus, TableTag, TableZone } from '@/src/types/table';

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
  const { copy, language } = useDisplayPreferences();
  const params = useLocalSearchParams<{ tableId?: string; mode?: string }>();
  const routeId = parsePositiveRouteId(params.tableId);
  const editingId = routeId.kind === 'valid' ? routeId.id : null;
  const isEditing = routeId.kind === 'valid';
  const invalidRoute = routeId.kind === 'invalid';
  const canManage = can(activeMembership, 'manage_table');
  const insets = useSafeAreaInsets();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [tags, setTags] = useState<TableTag[]>([]);
  const [form, setForm] = useState<TableForm>(emptyTableForm());
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'bulk' | 'delete' | 'qr' | null>(null);

  const editingTable = useMemo(
    () => (isEditing ? tables.find((table) => table.ID === editingId) ?? null : null),
    [editingId, isEditing, tables],
  );
  const activeZones = useMemo(() => zones.filter((zone) => zone.is_active), [zones]);
  const activeTags = useMemo(() => tags.filter((tag) => tag.is_active), [tags]);
  const availabilityStatusEditable = !editingTable || canEditTableAvailability(editingTable.status);
  const statusOptions = useMemo<Array<{ label: string; value: TableStatus }>>(() => [
    { label: copy('เปิดใช้งาน', 'Active'), value: 'free' },
    { label: copy('ปิดใช้งาน', 'Inactive'), value: 'inactive' },
  ], [copy]);
  const zoneOptions = useMemo(() => [
    { label: copy('ไม่มีโซน', 'No zone'), value: 0 },
    ...activeZones.map((zone) => ({ label: `${zone.name}${zone.prefix ? ` (${zone.prefix})` : ''}`, value: zone.ID })),
  ], [activeZones, copy]);
  const bulkPreview = useMemo(() => {
    const count = Math.max(1, toInt(form.count, 1));
    const zone = activeZones.find((item) => item.ID === form.zoneId);
    const existing = tables.filter((table) => (form.zoneId ? table.zone_id === form.zoneId : !table.zone_id));
    const next = Math.max(0, ...existing.map((table) => table.sequence_number || 0)) + 1;
    const label = (sequence: number) => (zone ? `${zone.prefix || 'Z'}${String(sequence).padStart(2, '0')}` : `T${sequence}`);
    return count === 1 ? label(next) : `${label(next)}-${label(next + count - 1)}`;
  }, [activeZones, form.count, form.zoneId, tables]);
  const customerOrderLink = editingTable?.customer_token ? customerTableUrl(editingTable.customer_token) : '';

  const load = useCallback(async () => {
    if (!canManage || invalidRoute) {
      setLoading(false);
      return;
    }
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
      setError(err instanceof Error
        ? err.message
        : copy('โหลดข้อมูลโต๊ะไม่สำเร็จ', 'Unable to load table data'));
    } finally {
      setLoading(false);
    }
  }, [canManage, copy, invalidRoute]);

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
  if (invalidRoute) {
    return (
      <MobileScreen kicker={copy('โต๊ะ', 'TABLES')} title={copy('รายละเอียดโต๊ะ', 'Table details')}>
        <StateMessage
          title={copy('ไม่พบโต๊ะ', 'Table not found')}
          detail={copy(
            'ลิงก์โต๊ะนี้ไม่ถูกต้อง กรุณากลับไปเลือกรายการจากหน้าจัดการโต๊ะ',
            'This table link is invalid. Go back and choose a table from table management.',
          )}
        />
        <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>{copy('ย้อนกลับ', 'Go back')}</Text>
        </Pressable>
      </MobileScreen>
    );
  }
  if (!canManage) {
    return <MobileScreen kicker={copy('โต๊ะ', 'TABLES')} title={copy('จัดการโต๊ะ', 'Manage tables')}><StateMessage title={copy('ไม่มีสิทธิ์จัดการโต๊ะ', 'No table management access')} detail={copy('ต้องมีสิทธิ์ manage_table', 'You need the manage_table permission.')} /></MobileScreen>;
  }
  if (isEditing && loading) {
    return (
      <MobileScreen kicker={copy('โต๊ะ', 'TABLES')} title={copy('รายละเอียดโต๊ะ', 'Table details')}>
        <StateMessage title={copy('กำลังโหลดโต๊ะ', 'Loading table')} detail={copy('กำลังตรวจสอบข้อมูลรายการนี้', 'Checking this table now.')} />
      </MobileScreen>
    );
  }
  if (isEditing && error) {
    return (
      <MobileScreen kicker={copy('โต๊ะ', 'TABLES')} title={copy('รายละเอียดโต๊ะ', 'Table details')}>
        <StateMessage title={copy('โหลดโต๊ะไม่สำเร็จ', 'Unable to load table')} detail={error} />
        <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>{copy('ย้อนกลับ', 'Go back')}</Text>
        </Pressable>
      </MobileScreen>
    );
  }
  if (isEditing && !editingTable) {
    return (
      <MobileScreen kicker={copy('โต๊ะ', 'TABLES')} title={copy('รายละเอียดโต๊ะ', 'Table details')}>
        <StateMessage
          title={copy('ไม่พบโต๊ะ', 'Table not found')}
          detail={copy(
            'โต๊ะนี้อาจถูกลบไปแล้ว กรุณากลับไปเลือกรายการจากหน้าจัดการโต๊ะ',
            'This table may have been deleted. Go back and choose a table from table management.',
          )}
        />
        <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>{copy('ย้อนกลับ', 'Go back')}</Text>
        </Pressable>
      </MobileScreen>
    );
  }

  function toggleTag(id: number) {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(id) ? current.tagIds.filter((tagId) => tagId !== id) : [...current.tagIds, id],
    }));
  }

  async function persist() {
    if (!canManage || submitting || invalidRoute || (isEditing && !editingTable)) return;
    const safeCapacity = Math.min(50, Math.max(1, toInt(form.capacity, 2)));
    const safeCount = Math.min(200, Math.max(1, toInt(form.count, 1)));
    const payload = {
      zone_id: form.zoneId || null,
      capacity: safeCapacity,
      status: editingTable
        ? tableEditorSaveStatus(editingTable.status, form.status)
        : form.status,
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
      setFormError(err instanceof Error
        ? err.message
        : copy('บันทึกข้อมูลโต๊ะไม่สำเร็จ', 'Unable to save table data'));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTable() {
    if (invalidRoute || (isEditing && !editingTable)) return;
    if (!editingTable && Math.max(1, toInt(form.count, 1)) > 1) {
      if (confirmAction !== 'bulk') {
        setConfirmAction('bulk');
        setFormError(copy(
          'ตรวจจำนวนและตัวอย่างเลขโต๊ะ แล้วกดยืนยันสร้างโต๊ะอีกครั้ง',
          'Review the quantity and table-number preview, then confirm creation again.',
        ));
        return;
      }
      setConfirmAction(null);
      await persist();
      return;
    }
    await persist();
  }

  async function confirmDelete() {
    if (!canManage || !editingTable) return;
    if (confirmAction !== 'delete') { setConfirmAction('delete'); setFormError(copy('กดยืนยันอีกครั้งเพื่อลบโต๊ะนี้', 'Press confirm again to delete this table.')); return; }
    setSubmitting(true); setFormError(null);
    try { await deleteTable(editingTable.ID); router.replace('/table-management' as never); }
    catch (err) { setFormError(err instanceof Error ? err.message : copy('ลบโต๊ะไม่สำเร็จ', 'Unable to delete table')); }
    finally { setSubmitting(false); }
  }

  async function regenerateCustomerLink() {
    if (!canManage || !editingTable) return;
    if (confirmAction !== 'qr') { setConfirmAction('qr'); setFormError(copy('กดยืนยันอีกครั้งเพื่อสร้างลิงก์ใหม่ ลิงก์เดิมจะใช้ไม่ได้ทันที', 'Press confirm again to create a new link. The old link will stop working immediately.')); return; }
    setSubmitting(true); setFormError(null);
    try { const updated = await regenerateTableCustomerToken(editingTable.ID); setTables((current) => current.map((table) => (table.ID === updated.ID ? updated : table))); setConfirmAction(null); }
    catch (err) { setFormError(err instanceof Error ? err.message : copy('สร้างลิงก์ใหม่ไม่สำเร็จ', 'Unable to regenerate the link')); }
    finally { setSubmitting(false); }
  }

  async function shareCustomerLink() {
    if (!customerOrderLink) return;
    await Share.share({
      title: copy('ลิงก์เมนูลูกค้า', 'Customer menu link'),
      message: copy(
        `สแกนหรือเปิดลิงก์นี้เพื่อสั่งอาหารจากโต๊ะ\n${customerOrderLink}`,
        `Scan or open this link to order from the table.\n${customerOrderLink}`,
      ),
      url: customerOrderLink,
    });
  }

  async function openCustomerMenu() {
    if (!customerOrderLink) return;
    await Linking.openURL(customerOrderLink);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[layout.scrollContainer, { paddingBottom: 150 }]}
      >
        <View style={layout.headerRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text selectable style={typeScale.kicker}>{copy('โต๊ะ', 'TABLES')}</Text>
            <Text selectable style={typeScale.hero}>{editingTable ? copy('บันทึกโต๊ะ', 'Edit table') : copy('เพิ่มโต๊ะ', 'Add table')}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              {editingTable
                ? copy(
                  `เลขโต๊ะออกให้อัตโนมัติ: ${editingTable.display_label || editingTable.table_number}`,
                  `Table number is assigned automatically: ${editingTable.display_label || editingTable.table_number}`,
                )
                : copy('สร้างโต๊ะเดี่ยวหรือสร้างเป็นชุดในครั้งเดียว', 'Create one table or a batch of tables at once.')}
            </Text>
          </View>
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>{copy('กลับ', 'Back')}</Text>
          </Pressable>
        </View>

        {!canManage ? (
          <StateMessage title={copy('ไม่มีสิทธิ์จัดการโต๊ะ', 'No table management access')} detail={copy('หน้านี้สำหรับเจ้าของร้าน ผู้จัดการ หรือผู้มีสิทธิ์ manage_table', 'This page is for owners, managers, or staff with the manage_table permission.')} />
        ) : null}
        {error ? <StateMessage title={copy('ทำรายการไม่สำเร็จ', 'Unable to complete action')} detail={error} /> : null}
        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>{copy('ตั้งค่าโต๊ะ', 'Table settings')}</Text>
          <ChoiceRow
            label={copy('โซน', 'Zone')}
            value={form.zoneId}
            options={zoneOptions}
            onChange={(value) => setForm((current) => ({ ...current, zoneId: value }))}
          />
          {!editingTable ? (
            <FormField
              keyboardType="numeric"
              label={copy('จำนวนโต๊ะ', 'Number of tables')}
              onChangeText={(value) => setForm((current) => ({ ...current, count: value }))}
              value={form.count}
            />
          ) : null}
          <FormField
            keyboardType="numeric"
            label={copy('จำนวนที่นั่ง', 'Seating capacity')}
            onChangeText={(value) => setForm((current) => ({ ...current, capacity: value }))}
            value={form.capacity}
          />
          {availabilityStatusEditable ? (
            <ChoiceRow
              label={copy('สถานะ', 'Status')}
              value={form.status}
              options={statusOptions}
              onChange={(value) => setForm((current) => ({ ...current, status: value }))}
            />
          ) : editingTable ? (
            <View style={{ gap: 10 }}>
              <Text selectable style={typeScale.caption}>{copy('สถานะ', 'Status')}</Text>
              <StatusBadge
                label={tableStatusLabel(editingTable.status, language)}
                tone={editingTable.status === 'reserved' ? 'info' : 'warning'}
              />
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                {copy(
                  'สถานะนี้อัปเดตจากการจองหรือออเดอร์โดยอัตโนมัติ คุณยังแก้โซน จำนวนที่นั่ง และแท็กได้',
                  'This status is managed automatically by the reservation or order. You can still edit the zone, seating capacity, and tags.',
                )}
              </Text>
            </View>
          ) : null}
          {!editingTable ? (
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }}>
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                {copy('ตัวอย่างเลข:', 'Number preview:')} <Text style={{ color: colors.text, fontWeight: '900' }}>{bulkPreview}</Text>
              </Text>
            </View>
          ) : null}
        </View>

        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>{copy('แท็ก', 'Tags')}</Text>
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
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>{copy('ยังไม่มีแท็กสำหรับโต๊ะ', 'No table tags yet')}</Text>
          )}
        </View>

        {editingTable && customerOrderLink ? (
          <View style={layout.panel}>
            <Text selectable style={typeScale.cardTitle}>{copy('ลิงก์สั่งอาหารของลูกค้า', 'Customer ordering link')}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              {copy(
                'แชร์ลิงก์นี้ให้ลูกค้าเพื่อเปิดเมนูโต๊ะและส่งออเดอร์เข้าครัวโดยไม่ต้องล็อกอิน',
                'Share this link so guests can open the table menu and send orders to the kitchen without signing in.',
              )}
            </Text>
            <Text selectable numberOfLines={2} style={[typeScale.caption, { color: colors.placeholder }]}>{customerOrderLink}</Text>
            <Pressable onPress={shareCustomerLink} style={layout.secondaryButton}>
              <Text style={layout.secondaryButtonText}>{copy('แชร์/คัดลอกลิงก์', 'Share/copy link')}</Text>
            </Pressable>
            <Pressable onPress={openCustomerMenu} style={layout.primaryButton}>
              <Text style={layout.primaryButtonText}>{copy('เปิดหน้าเมนูลูกค้า', 'Open customer menu')}</Text>
            </Pressable>
            <Pressable onPress={regenerateCustomerLink} style={layout.secondaryButton}>
              <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>{confirmAction === 'qr' ? copy('ยืนยันสร้างลิงก์ใหม่', 'Confirm new link') : copy('สร้างลิงก์ใหม่', 'Regenerate link')}</Text>
            </Pressable>
          </View>
        ) : null}

        {editingTable ? (
          <View style={layout.panel}>
            <Text selectable style={typeScale.cardTitle}>{copy('การลบโต๊ะ', 'Delete table')}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>{copy('ลบเฉพาะเมื่อโต๊ะนี้ไม่ได้ใช้งานแล้ว', 'Delete this table only after it is no longer in use.')}</Text>
            <Pressable onPress={confirmDelete} style={layout.secondaryButton}>
              <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>{confirmAction === 'delete' ? copy('ยืนยันลบโต๊ะ', 'Confirm delete table') : copy('ลบโต๊ะ', 'Delete table')}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
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
          }}
      >
        {formError ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{formError}</Text> : null}
        <Pressable disabled={!canManage || submitting || (isEditing && !editingTable)} onPress={saveTable} style={[layout.primaryButton, (!canManage || submitting || (isEditing && !editingTable)) && { opacity: 0.65 }]}>
          <Text style={layout.primaryButtonText}>
            {submitting
              ? copy('กำลังบันทึก...', 'Saving...')
              : confirmAction === 'bulk'
                ? copy('ยืนยันสร้างโต๊ะ', 'Confirm table creation')
                : editingTable
                  ? copy('บันทึกโต๊ะ', 'Save table')
                  : copy('เพิ่มโต๊ะ', 'Add table')}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
