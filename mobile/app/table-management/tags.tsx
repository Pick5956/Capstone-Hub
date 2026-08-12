import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Switch, useWindowDimensions, View } from 'react-native';

import { createTableTag, deleteTableTag, listTableTags, updateTableTag } from '@/src/api/table';
import { AppIcon } from '@/src/components/app-icon';
import { AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { ActionDock, Button, Divider, EmptyState, Feedback, Surface, TextField } from '@/src/components/ui';
import { toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';
import type { TableTag } from '@/src/types/table';

export default function TagManagerScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_table');
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;

  const [tags, setTags] = useState<TableTag[]>([]);
  const [editingTag, setEditingTag] = useState<TableTag | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagOrder, setTagOrder] = useState('1');
  const [tagActive, setTagActive] = useState(true);
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
      const response = await listTableTags();
      setTags(response.tags ?? []);
      setTagOrder((current) => (editingTag ? current : String((response.tags ?? []).length + 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('โหลดแท็กไม่สำเร็จ', 'Unable to load tags'));
    } finally {
      setLoading(false);
    }
  }, [canManage, copy, editingTag]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!activeMembership) return <Redirect href="/restaurants" />;

  function resetForm() {
    setEditingTag(null);
    setFormVisible(false);
    setTagName('');
    setTagOrder(String(tags.length + 1));
    setTagActive(true);
    setFormError(null);
  }

  function startCreate() {
    if (formVisible || editingTag) {
      resetForm();
      return;
    }
    setEditingTag(null);
    setTagName('');
    setTagOrder(String(tags.length + 1));
    setTagActive(true);
    setFormError(null);
    setFormVisible(true);
  }

  function toggleEdit(tag: TableTag) {
    if (editingTag?.ID === tag.ID) {
      resetForm();
      return;
    }
    setEditingTag(tag);
    setFormVisible(true);
    setTagName(tag.name);
    setTagOrder(String(tag.display_order || 0));
    setTagActive(tag.is_active);
    setFormError(null);
  }

  async function saveTag() {
    if (!canManage) return;
    if (!tagName.trim()) {
      setFormError(copy('กรอกชื่อแท็กก่อนบันทึก', 'Enter a tag name before saving.'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = { name: tagName.trim(), color: 'gray', display_order: toInt(tagOrder, 0), is_active: tagActive };
      if (editingTag) await updateTableTag(editingTag.ID, payload);
      else await createTableTag(payload);
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : copy('บันทึกแท็กไม่สำเร็จ', 'Unable to save tag'));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(tag: TableTag) {
    if (!canManage) return;
    if (confirmDeleteId !== tag.ID) {
      setConfirmDeleteId(tag.ID);
      setFormError(copy(`กดยืนยันอีกครั้งเพื่อลบแท็ก ${tag.name}`, `Press confirm again to delete the ${tag.name} tag.`));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await deleteTableTag(tag.ID);
      if (editingTag?.ID === tag.ID) resetForm();
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : copy('ลบแท็กไม่สำเร็จ', 'Unable to delete tag'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManage) {
    return <AppScreen title={copy('จัดการแท็ก', 'Manage tags')} topLevel={false}><EmptyState title={copy('ไม่มีสิทธิ์จัดการโต๊ะ', 'No table management access')} /></AppScreen>;
  }

  const showForm = tabletWorkspace || formVisible || Boolean(editingTag);
  const form = (
    <Surface style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppIcon color={palette.text} name={editingTag ? 'create-outline' : 'add-circle-outline'} size={22} />
        <Text style={[typeScale.cardTitle, { flex: 1 }]}>{editingTag ? copy('แก้ไขแท็ก', 'Edit tag') : copy('เพิ่มแท็ก', 'Add tag')}</Text>
        {editingTag || formVisible ? <Button compact variant="ghost" icon="close" label={copy('ปิด', 'Close')} onPress={resetForm} /> : null}
      </View>
      <TextField label={copy('ชื่อแท็ก', 'Tag name')} value={tagName} onChangeText={setTagName} icon="pricetag-outline" error={formError && !tagName.trim() ? formError : null} />
      <TextField keyboardType="numeric" label={copy('ลำดับ', 'Display order')} value={tagOrder} onChangeText={setTagOrder} />
      <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={typeScale.cardTitle}>{copy('เปิดใช้งาน', 'Active')}</Text>
          <Text style={[typeScale.caption, { color: palette.muted }]}>{copy('แสดงแท็กนี้ตอนจัดโต๊ะ', 'Show this tag when organizing tables')}</Text>
        </View>
        <Switch value={tagActive} onValueChange={setTagActive} />
      </View>
      {tabletWorkspace ? <Button icon="checkmark" label={editingTag ? copy('บันทึกแท็ก', 'Save tag') : copy('เพิ่มแท็ก', 'Add tag')} onPress={saveTag} loading={submitting} /> : null}
    </Surface>
  );

  return (
    <AppScreen
      title={copy('จัดการแท็ก', 'Manage tags')}
      subtitle={copy(`${tags.length.toLocaleString('th-TH')} แท็ก`, `${tags.length.toLocaleString('en-US')} tags`)}
      topLevel={false}
      action={<Button compact icon={formVisible ? 'close' : 'add'} variant="secondary" label={formVisible ? copy('ปิด', 'Close') : copy('เพิ่ม', 'Add')} onPress={startCreate} />}
      footer={!tabletWorkspace && showForm ? <ActionDock><Button icon="checkmark" label={editingTag ? copy('บันทึกแท็ก', 'Save tag') : copy('เพิ่มแท็ก', 'Add tag')} onPress={saveTag} loading={submitting} /></ActionDock> : undefined}
    >
      {error ? <Feedback title={copy('โหลดแท็กไม่ได้', 'Unable to load tags')} detail={error} tone="danger" /> : null}
      {formError && (confirmDeleteId || tagName.trim()) ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete action')} detail={formError} tone={confirmDeleteId ? 'warning' : 'danger'} /> : null}
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        <Surface style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 1.1 : undefined, gap: 0, padding: 0, overflow: 'hidden' }}>
          {tags.map((tag, index) => {
            const selected = editingTag?.ID === tag.ID;
            return (
              <View key={tag.ID}>
                {index ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: selected ? palette.accentSoft : palette.surface, paddingHorizontal: spacing.md }}>
                  <Button compact variant="ghost" icon="pricetag-outline" label={tag.name} onPress={() => toggleEdit(tag)} style={{ minWidth: 0, flex: 1, justifyContent: 'flex-start' }} />
                  <Text numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{tag.display_order}{tag.is_active ? '' : copy(' · ปิด', ' · Off')}</Text>
                  <Button compact variant={confirmDeleteId === tag.ID ? 'danger' : 'ghost'} icon="trash-outline" label={confirmDeleteId === tag.ID ? copy('ยืนยัน', 'Confirm') : copy('ลบ', 'Delete')} onPress={() => { void confirmDelete(tag); }} />
                </View>
              </View>
            );
          })}
          {!loading && !tags.length ? <View style={{ paddingHorizontal: spacing.lg }}><EmptyState title={copy('ยังไม่มีแท็ก', 'No tags yet')} detail={copy('เพิ่มแท็กเพื่อจัดกลุ่มคุณสมบัติโต๊ะ', 'Add tags to group table attributes.')} /></View> : null}
        </Surface>
        {showForm ? <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 0.9 : undefined }}>{form}</View> : null}
      </View>
    </AppScreen>
  );
}
