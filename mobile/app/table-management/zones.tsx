import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { createTableZone, deleteTableZone, listTableZones, updateTableZone } from '@/src/api/table';
import { AppIcon } from '@/src/components/app-icon';
import { AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { ActionDock, Button, Divider, EdgeRow, EdgeSection, EdgeSectionHeader, EmptyState, Feedback, Surface, TextField } from '@/src/components/ui';
import { toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';
import type { TableZone } from '@/src/types/table';

export default function ZoneManagerScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_table');
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;

  const [zones, setZones] = useState<TableZone[]>([]);
  const [editingZone, setEditingZone] = useState<TableZone | null>(null);
  const [formVisible, setFormVisible] = useState(false);
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
      setError(err instanceof Error ? err.message : copy('โหลดโซนไม่สำเร็จ', 'Unable to load zones'));
    } finally {
      setLoading(false);
    }
  }, [canManage, copy, editingZone]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!activeMembership) return <Redirect href="/restaurants" />;

  function resetForm() {
    setEditingZone(null);
    setFormVisible(false);
    setZoneName('');
    setZonePrefix('');
    setZoneOrder(String(zones.length + 1));
    setZoneActive(true);
    setFormError(null);
  }

  function startCreate() {
    if (formVisible || editingZone) {
      resetForm();
      return;
    }
    setEditingZone(null);
    setZoneName('');
    setZonePrefix('');
    setZoneOrder(String(zones.length + 1));
    setZoneActive(true);
    setFormError(null);
    setFormVisible(true);
  }

  function toggleEdit(zone: TableZone) {
    if (editingZone?.ID === zone.ID) {
      resetForm();
      return;
    }
    setEditingZone(zone);
    setFormVisible(true);
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
      setFormError(err instanceof Error ? err.message : copy('บันทึกโซนไม่สำเร็จ', 'Unable to save zone'));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(zone: TableZone) {
    if (!canManage) return;
    if (confirmDeleteId !== zone.ID) {
      setConfirmDeleteId(zone.ID);
      setFormError(copy(`กดยืนยันอีกครั้งเพื่อลบโซน ${zone.name}`, `Press confirm again to delete the ${zone.name} zone.`));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await deleteTableZone(zone.ID);
      if (editingZone?.ID === zone.ID) resetForm();
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : copy('ลบโซนไม่สำเร็จ', 'Unable to delete zone'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManage) {
    return <AppScreen title={copy('จัดการโซน', 'Manage zones')} topLevel={false}><EmptyState title={copy('ไม่มีสิทธิ์จัดการโต๊ะ', 'No table management access')} /></AppScreen>;
  }

  const showForm = tabletWorkspace || formVisible || Boolean(editingZone);
  const form = (
    <Surface style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppIcon color={palette.text} name={editingZone ? 'create-outline' : 'add-circle-outline'} size={22} />
        <Text style={[typeScale.cardTitle, { flex: 1 }]}>{editingZone ? copy('แก้ไขโซน', 'Edit zone') : copy('เพิ่มโซน', 'Add zone')}</Text>
        {editingZone || formVisible ? <Button compact variant="ghost" icon="close" label={copy('ปิด', 'Close')} onPress={resetForm} /> : null}
      </View>
      <TextField label={copy('ชื่อโซน', 'Zone name')} value={zoneName} onChangeText={setZoneName} icon="map-outline" error={formError && !zoneName.trim() ? formError : null} />
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', gap: spacing.md }}>
        <View style={{ flex: 1 }}><TextField label={copy('คำนำหน้า', 'Prefix')} value={zonePrefix} onChangeText={setZonePrefix} /></View>
        <View style={{ flex: 1 }}><TextField keyboardType="numeric" label={copy('ลำดับ', 'Display order')} value={zoneOrder} onChangeText={setZoneOrder} /></View>
      </View>
      {tabletWorkspace ? <Button icon="checkmark" label={editingZone ? copy('บันทึกโซน', 'Save zone') : copy('เพิ่มโซน', 'Add zone')} onPress={saveZone} loading={submitting} /> : null}
    </Surface>
  );

  const zoneList = tabletWorkspace ? (
    <Surface style={{ minWidth: 0, flex: 1.1, gap: 0, padding: 0, overflow: 'hidden' }}>
      {zones.map((zone, index) => {
        const selected = editingZone?.ID === zone.ID;
        return (
          <View key={zone.ID}>
            {index ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: selected ? palette.accentSoft : palette.surface, paddingHorizontal: spacing.md }}>
              <Button compact variant="ghost" icon="map-outline" label={zone.name} onPress={() => toggleEdit(zone)} style={{ minWidth: 0, flex: 1, justifyContent: 'flex-start' }} />
              <Text numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{zone.prefix || '−'} · {zone.display_order}</Text>
              <Button compact variant={confirmDeleteId === zone.ID ? 'danger' : 'ghost'} icon="trash-outline" label={confirmDeleteId === zone.ID ? copy('ยืนยัน', 'Confirm') : copy('ลบ', 'Delete')} onPress={() => { void confirmDelete(zone); }} />
            </View>
          </View>
        );
      })}
      {!loading && !zones.length ? <View style={{ paddingHorizontal: spacing.lg }}><EmptyState title={copy('ยังไม่มีโซน', 'No zones yet')} detail={copy('เพิ่มโซนเพื่อจัดกลุ่มโต๊ะ', 'Add a zone to group tables.')} /></View> : null}
    </Surface>
  ) : (
    <View style={{ width: '100%', gap: spacing.sm }}>
      <EdgeSectionHeader title={copy('โซนทั้งหมด', 'All zones')} detail={copy(`${zones.length.toLocaleString('th-TH')} โซน`, `${zones.length.toLocaleString('en-US')} zones`)} />
      <EdgeSection>
        {zones.map((zone) => {
          const selected = editingZone?.ID === zone.ID;
          return (
            <EdgeRow
              detail={`${zone.prefix || '−'} · ${zone.display_order}`}
              icon="map-outline"
              iconColor={selected ? palette.accent : palette.muted}
              key={zone.ID}
              style={{ backgroundColor: selected ? palette.accentSoft : palette.surface }}
              title={zone.name}
              trailing={(
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <Button compact variant="secondary" icon="create-outline" label={copy('แก้ไข', 'Edit')} onPress={() => toggleEdit(zone)} />
                  <Button compact variant={confirmDeleteId === zone.ID ? 'danger' : 'ghost'} icon="trash-outline" label={confirmDeleteId === zone.ID ? copy('ยืนยัน', 'Confirm') : copy('ลบ', 'Delete')} onPress={() => { void confirmDelete(zone); }} />
                </View>
              )}
            />
          );
        })}
        {!loading && !zones.length ? <View style={{ paddingHorizontal: spacing.lg }}><EmptyState title={copy('ยังไม่มีโซน', 'No zones yet')} detail={copy('เพิ่มโซนเพื่อจัดกลุ่มโต๊ะ', 'Add a zone to group tables.')} /></View> : null}
      </EdgeSection>
    </View>
  );

  return (
    <AppScreen
      title={copy('จัดการโซน', 'Manage zones')}
      subtitle={copy(`${zones.length.toLocaleString('th-TH')} โซน`, `${zones.length.toLocaleString('en-US')} zones`)}
      topLevel={false}
      action={<Button compact icon={formVisible ? 'close' : 'add'} variant="secondary" label={formVisible ? copy('ปิด', 'Close') : copy('เพิ่ม', 'Add')} onPress={startCreate} />}
      footer={!tabletWorkspace && showForm ? <ActionDock><Button icon="checkmark" label={editingZone ? copy('บันทึกโซน', 'Save zone') : copy('เพิ่มโซน', 'Add zone')} onPress={saveZone} loading={submitting} /></ActionDock> : undefined}
    >
      {error ? <Feedback title={copy('โหลดโซนไม่ได้', 'Unable to load zones')} detail={error} tone="danger" /> : null}
      {formError && (confirmDeleteId || zoneName.trim()) ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete action')} detail={formError} tone={confirmDeleteId ? 'warning' : 'danger'} /> : null}
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        {zoneList}
        {showForm ? <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 0.9 : undefined }}>{form}</View> : null}
      </View>
    </AppScreen>
  );
}
