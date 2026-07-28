import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createTableTag, deleteTableTag, listTableTags, updateTableTag } from '@/src/api/table';
import { AppText as Text } from '@/src/components/app-text';
import { FormField } from '@/src/components/form-controls';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { colors, layout, typeScale } from '@/src/theme';
import type { TableTag } from '@/src/types/table';

export default function TagManagerScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_table');
  const insets = useSafeAreaInsets();

  const [tags, setTags] = useState<TableTag[]>([]);
  const [editingTag, setEditingTag] = useState<TableTag | null>(null);
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
      setError(err instanceof Error
        ? err.message
        : copy('โหลดแท็กไม่สำเร็จ', 'Unable to load tags'));
    } finally {
      setLoading(false);
    }
  }, [canManage, copy, editingTag]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeMembership) return <Redirect href="/restaurants" />;
  if (!canManage) {
    return <MobileScreen kicker={copy('โต๊ะ', 'TABLES')} title={copy('จัดการแท็ก', 'Manage tags')}><StateMessage title={copy('ไม่มีสิทธิ์จัดการโต๊ะ', 'No table management access')} detail={copy('ต้องมีสิทธิ์ manage_table', 'You need the manage_table permission.')} /></MobileScreen>;
  }

  function resetForm() {
    setEditingTag(null);
    setTagName('');
    setTagOrder(String(tags.length + 1));
    setTagActive(true);
    setFormError(null);
  }

  function toggleEdit(tag: TableTag) {
    if (editingTag?.ID === tag.ID) {
      resetForm();
      return;
    }
    setEditingTag(tag);
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
      const payload = {
        name: tagName.trim(),
        color: 'gray',
        display_order: toInt(tagOrder, 0),
        is_active: tagActive,
      };
      if (editingTag) await updateTableTag(editingTag.ID, payload);
      else await createTableTag(payload);
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error
        ? err.message
        : copy('บันทึกแท็กไม่สำเร็จ', 'Unable to save tag'));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(tag: TableTag) {
    if (!canManage) return;
    if (confirmDeleteId !== tag.ID) { setConfirmDeleteId(tag.ID); setFormError(copy(`กดยืนยันอีกครั้งเพื่อลบแท็ก ${tag.name}`, `Press confirm again to delete the ${tag.name} tag.`)); return; }
    setSubmitting(true); setFormError(null);
    try { await deleteTableTag(tag.ID); if (editingTag?.ID === tag.ID) resetForm(); setConfirmDeleteId(null); await load(); }
    catch (err) { setFormError(err instanceof Error ? err.message : copy('ลบแท็กไม่สำเร็จ', 'Unable to delete tag')); }
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
            <Text selectable style={typeScale.hero}>{copy('จัดการแท็ก', 'Manage tags')}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>{copy('กดรายการเพื่อแก้ไข กดซ้ำเพื่อยกเลิก', 'Tap a tag to edit it. Tap it again to cancel.')}</Text>
          </View>
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>{copy('กลับ', 'Back')}</Text>
          </Pressable>
        </View>

        {!canManage ? <StateMessage title={copy('ไม่มีสิทธิ์จัดการโต๊ะ', 'No table management access')} detail={copy('หน้านี้สำหรับสิทธิ์ manage_table', 'This page requires the manage_table permission.')} /> : null}
        {error ? <StateMessage title={copy('ทำรายการไม่สำเร็จ', 'Unable to complete action')} detail={error} /> : null}

        <View style={{ gap: 10 }}>
          {tags.map((tag) => {
            const selected = editingTag?.ID === tag.ID;
            return (
              <Pressable
                key={tag.ID}
                onPress={() => toggleEdit(tag)}
                style={[layout.card, selected && { borderColor: colors.primary, backgroundColor: '#FFF7ED' }]}
              >
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.text, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text selectable style={[typeScale.caption, { color: colors.text, fontWeight: '900' }]}>{tag.name}</Text>
                  </View>
                  <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                    {copy(`ลำดับ ${tag.display_order.toLocaleString('th-TH')}`, `Order ${tag.display_order.toLocaleString('en-US')}`)}{tag.is_active ? '' : copy(' · ปิดใช้งาน', ' · Inactive')}
                  </Text>
                </View>
                <Pressable onPress={() => confirmDelete(tag)} style={layout.secondaryButton}>
                  <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>{confirmDeleteId === tag.ID ? copy('ยืนยันลบ', 'Confirm delete') : copy('ลบ', 'Delete')}</Text>
                </Pressable>
              </Pressable>
            );
          })}
          {!loading && tags.length === 0 ? <StateMessage title={copy('ยังไม่มีแท็ก', 'No tags yet')} detail={copy('เพิ่มแท็กเพื่อจัดกลุ่มคุณสมบัติโต๊ะ', 'Add tags to group table attributes.')} /> : null}
        </View>

        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>{editingTag ? copy('แก้ไขแท็ก', 'Edit tag') : copy('เพิ่มแท็ก', 'Add tag')}</Text>
          <FormField label={copy('ชื่อแท็ก', 'Tag name')} value={tagName} onChangeText={setTagName} />
          <FormField keyboardType="numeric" label={copy('ลำดับ', 'Display order')} value={tagOrder} onChangeText={setTagOrder} />
          <View style={layout.headerRow}>
            <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{copy('เปิดใช้งาน', 'Active')}</Text>
            <Switch value={tagActive} onValueChange={setTagActive} />
          </View>
          {editingTag ? (
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
        <Pressable disabled={!canManage || submitting} onPress={saveTag} style={[layout.primaryButton, (!canManage || submitting) && { opacity: 0.65 }]}>
          <Text style={layout.primaryButtonText}>{submitting ? copy('กำลังบันทึก...', 'Saving...') : editingTag ? copy('บันทึกแท็ก', 'Save tag') : copy('เพิ่มแท็ก', 'Add tag')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
