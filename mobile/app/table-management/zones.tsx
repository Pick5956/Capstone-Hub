import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createTableZone, deleteTableZone, listTableZones, updateTableZone } from '@/src/api/table';
import { FormField } from '@/src/components/form-controls';
import { StateMessage } from '@/src/components/mobile-screen';
import { toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';
import type { TableZone } from '@/src/types/table';

export default function ZoneManagerScreen() {
  const { activeMembership } = useAuth();
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
    setError(null);
    try {
      const response = await listTableZones();
      setZones(response.zones ?? []);
      setZoneOrder((current) => (editingZone ? current : String((response.zones ?? []).length + 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดโซนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [editingZone]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeMembership) return <Redirect href="/restaurants" />;

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
    if (!zoneName.trim()) {
      setFormError('กรอกชื่อโซนก่อนบันทึก');
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
      setFormError(err instanceof Error ? err.message : 'บันทึกโซนไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(zone: TableZone) {
    if (confirmDeleteId !== zone.ID) { setConfirmDeleteId(zone.ID); setFormError(`กดยืนยันอีกครั้งเพื่อลบโซน ${zone.name}`); return; }
    setSubmitting(true); setFormError(null);
    try { await deleteTableZone(zone.ID); if (editingZone?.ID === zone.ID) resetForm(); setConfirmDeleteId(null); await load(); }
    catch (err) { setFormError(err instanceof Error ? err.message : 'ลบโซนไม่สำเร็จ'); }
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
            <Text selectable style={typeScale.kicker}>TABLES</Text>
            <Text selectable style={typeScale.hero}>จัดการโซน</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>กดรายการเพื่อแก้ไข กดซ้ำเพื่อยกเลิก</Text>
          </View>
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>กลับ</Text>
          </Pressable>
        </View>

        {!canManage ? <StateMessage title="ไม่มีสิทธิ์จัดการโต๊ะ" detail="หน้านี้สำหรับสิทธิ์ manage_table" /> : null}
        {error ? <StateMessage title="ทำรายการไม่สำเร็จ" detail={error} /> : null}

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
                    {zone.prefix ? `Prefix ${zone.prefix}` : 'ไม่มี prefix'} · ลำดับ {zone.display_order}
                  </Text>
                </View>
                <Pressable onPress={() => confirmDelete(zone)} style={layout.secondaryButton}>
                  <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>{confirmDeleteId === zone.ID ? 'ยืนยันลบ' : 'ลบ'}</Text>
                </Pressable>
              </Pressable>
            );
          })}
          {!loading && zones.length === 0 ? <StateMessage title="ยังไม่มีโซน" detail="เพิ่มโซนแรกเพื่อจัดกลุ่มโต๊ะในร้าน" /> : null}
        </View>

        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>{editingZone ? 'แก้ไขโซน' : 'เพิ่มโซน'}</Text>
          <FormField label="ชื่อโซน" value={zoneName} onChangeText={setZoneName} />
          <FormField label="Prefix" value={zonePrefix} onChangeText={setZonePrefix} />
          <FormField keyboardType="numeric" label="ลำดับ" value={zoneOrder} onChangeText={setZoneOrder} />
          <View style={layout.headerRow}>
            <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>เปิดใช้งาน</Text>
            <Switch value={zoneActive} onValueChange={setZoneActive} />
          </View>
          {editingZone ? (
            <Pressable onPress={resetForm} style={layout.secondaryButton}>
              <Text style={layout.secondaryButtonText}>ยกเลิกแก้ไข</Text>
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
          <Text style={layout.primaryButtonText}>{submitting ? 'กำลังบันทึก...' : editingZone ? 'บันทึกโซน' : 'เพิ่มโซน'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
