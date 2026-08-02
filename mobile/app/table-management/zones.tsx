import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createTableZone, deleteTableZone, listTableZones, updateTableZone } from '@/src/api/table';
import { AppText as Text } from '@/src/components/app-text';
import { FormField } from '@/src/components/form-controls';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { colors, layout, typeScale } from '@/src/theme';
import type { TableZone } from '@/src/types/table';

export default function ZoneManagerScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_table');
  const insets = useSafeAreaInsets();

  const [zones, setZones] = useState<TableZone[]>([]);
  const [editingZone, setEditingZone] = useState<TableZone | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zonePrefix, setZonePrefix] = useState('');
  const [zoneOrder, setZoneOrder] = useState('1');
  const [zoneActive, setZoneActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const response = await listTableZones();
      setZones(response.zones ?? []);
      setZoneOrder((current) => (editingZone ? current : String((response.zones ?? []).length + 1)));
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('โหลดโซนไม่สำเร็จ', 'Unable to load zones'));
    } finally {
      setLoading(false);
    }
  }, [canManage, copy, editingZone]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeMembership) return <Redirect href="/restaurants" />;
  if (!canManage) {
    return <MobileScreen kicker={copy('โต๊ะ', 'TABLES')} title={copy('จัดการโซน', 'Manage zones')}><StateMessage title={copy('ไม่มีสิทธิ์จัดการโต๊ะ', 'No table management access')} detail={copy('ต้องมีสิทธิ์ manage_table', 'You need the manage_table permission.')} /></MobileScreen>;
  }

  function resetForm() {
    setEditingZone(null);
    setZoneName('');
    setZonePrefix('');
    setZoneOrder(String(zones.length + 1));
    setZoneActive(true);
    setFormError(null);
  }

  function toggleEdit(zone: TableZone) {
    if (editingZone?.ID === zone.ID) {
      resetForm();
      return;
    }
    setEditingZone(zone);
    setZoneName(zone.name);
    setZonePrefix(zone.prefix || '');
    setZoneOrder(String(zone.display_order || 0));
    setZoneActive(zone.is_active);
    setFormError(null);
  }

  async function saveZone() {
    if (!canManage) return;
    if (!zoneName.trim()) {
      setFormError(copy('กรอกชื่อโซนก่อนบันทึก', 'Enter a zone name before saving.'));
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
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error
        ? err.message
        : copy('บันทึกโซนไม่สำเร็จ', 'Unable to save zone'));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(zone: TableZone) {
    if (!canManage) return;
    if (confirmDeleteId !== zone.ID) { setConfirmDeleteId(zone.ID); setFormError(copy(`กดยืนยันอีกครั้งเพื่อลบโซน ${zone.name}`, `Press confirm again to delete the ${zone.name} zone.`)); return; }
    setSubmitting(true); setFormError(null);
    try { await deleteTableZone(zone.ID); if (editingZone?.ID === zone.ID) resetForm(); setConfirmDeleteId(null); await load(); }
    catch (err) { setFormError(err instanceof Error ? err.message : copy('ลบโซนไม่สำเร็จ', 'Unable to delete zone')); }
    finally { setSubmitting(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[layout.scrollContainer, { paddingBottom: 156 }]}
      >
        <View style={layout.headerRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text selectable style={typeScale.kicker}>{copy('โต๊ะ', 'TABLES')}</Text>
            <Text selectable style={typeScale.hero}>{copy('จัดการโซน', 'Manage zones')}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>{copy('กดรายการเพื่อแก้ไข กดซ้ำเพื่อยกเลิก', 'Tap a zone to edit it. Tap it again to cancel.')}</Text>
          </View>
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>{copy('กลับ', 'Back')}</Text>
          </Pressable>
        </View>

        {!canManage ? <StateMessage title={copy('ไม่มีสิทธิ์จัดการโต๊ะ', 'No table management access')} detail={copy('หน้านี้สำหรับสิทธิ์ manage_table', 'This page requires the manage_table permission.')} /> : null}
        {error ? <StateMessage title={copy('ทำรายการไม่สำเร็จ', 'Unable to complete action')} detail={error} /> : null}

        <View style={{ gap: 10 }}>
          {zones.map((zone) => {
            const selected = editingZone?.ID === zone.ID;
            return (
              <Pressable
                key={zone.ID}
                onPress={() => toggleEdit(zone)}
                style={[layout.card, selected && { borderColor: colors.primary, backgroundColor: '#FFF7ED' }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text selectable style={[typeScale.cardTitle, !zone.is_active && { color: colors.placeholder, textDecorationLine: 'line-through' }]}>
                    {zone.name}
                  </Text>
                  <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                    {zone.prefix ? copy(`คำนำหน้า ${zone.prefix}`, `Prefix ${zone.prefix}`) : copy('ไม่มีคำนำหน้า', 'No prefix')} · {copy(`ลำดับ ${zone.display_order.toLocaleString('th-TH')}`, `Order ${zone.display_order.toLocaleString('en-US')}`)}
                  </Text>
                </View>
                <Pressable onPress={() => confirmDelete(zone)} style={layout.secondaryButton}>
                  <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>{confirmDeleteId === zone.ID ? copy('ยืนยันลบ', 'Confirm delete') : copy('ลบ', 'Delete')}</Text>
                </Pressable>
              </Pressable>
            );
          })}
          {!loading && zones.length === 0 ? <StateMessage title={copy('ยังไม่มีโซน', 'No zones yet')} detail={copy('เพิ่มโซนแรกเพื่อจัดกลุ่มโต๊ะในร้าน', 'Add the first zone to group tables in the restaurant.')} /> : null}
        </View>

        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>{editingZone ? copy('แก้ไขโซน', 'Edit zone') : copy('เพิ่มโซน', 'Add zone')}</Text>
          <FormField label={copy('ชื่อโซน', 'Zone name')} value={zoneName} onChangeText={setZoneName} />
          <FormField label={copy('คำนำหน้า', 'Prefix')} value={zonePrefix} onChangeText={setZonePrefix} />
          <FormField keyboardType="numeric" label={copy('ลำดับ', 'Display order')} value={zoneOrder} onChangeText={setZoneOrder} />
          <View style={layout.headerRow}>
            <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{copy('เปิดใช้งาน', 'Active')}</Text>
            <Switch value={zoneActive} onValueChange={setZoneActive} />
          </View>
          {editingZone ? (
            <Pressable onPress={resetForm} style={layout.secondaryButton}>
              <Text style={layout.secondaryButtonText}>{copy('ยกเลิกแก้ไข', 'Cancel editing')}</Text>
            </Pressable>
          ) : null}
        </View>
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
        <Pressable disabled={!canManage || submitting} onPress={saveZone} style={[layout.primaryButton, (!canManage || submitting) && { opacity: 0.65 }]}>
          <Text style={layout.primaryButtonText}>{submitting ? copy('กำลังบันทึก...', 'Saving...') : editingZone ? copy('บันทึกโซน', 'Save zone') : copy('เพิ่มโซน', 'Add zone')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
