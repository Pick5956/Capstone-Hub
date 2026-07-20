import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createTableTag, deleteTableTag, listTableTags, updateTableTag } from '@/src/api/table';
import { FormField } from '@/src/components/form-controls';
import { StateMessage } from '@/src/components/mobile-screen';
import { toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';
import type { TableTag } from '@/src/types/table';

export default function TagManagerScreen() {
  const { activeMembership } = useAuth();
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
    setError(null);
    try {
      const response = await listTableTags();
      setTags(response.tags ?? []);
      setTagOrder((current) => (editingTag ? current : String((response.tags ?? []).length + 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลด tags ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [editingTag]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeMembership) return <Redirect href="/restaurants" />;

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
    if (!tagName.trim()) {
      setFormError('กรอกชื่อ tag ก่อนบันทึก');
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
      setFormError(err instanceof Error ? err.message : 'บันทึก tag ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(tag: TableTag) {
    if (confirmDeleteId !== tag.ID) { setConfirmDeleteId(tag.ID); setFormError(`กดยืนยันอีกครั้งเพื่อลบ tag ${tag.name}`); return; }
    setSubmitting(true); setFormError(null);
    try { await deleteTableTag(tag.ID); if (editingTag?.ID === tag.ID) resetForm(); setConfirmDeleteId(null); await load(); }
    catch (err) { setFormError(err instanceof Error ? err.message : 'ลบ tag ไม่สำเร็จ'); }
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
            <Text selectable style={typeScale.hero}>จัดการ tags</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>กดรายการเพื่อแก้ไข กดซ้ำเพื่อยกเลิก</Text>
          </View>
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>กลับ</Text>
          </Pressable>
        </View>

        {!canManage ? <StateMessage title="ไม่มีสิทธิ์จัดการโต๊ะ" detail="หน้านี้สำหรับสิทธิ์ manage_table" /> : null}
        {error ? <StateMessage title="ทำรายการไม่สำเร็จ" detail={error} /> : null}

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
                    ลำดับ {tag.display_order}{tag.is_active ? '' : ' · ปิดใช้งาน'}
                  </Text>
                </View>
                <Pressable onPress={() => confirmDelete(tag)} style={layout.secondaryButton}>
                  <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>{confirmDeleteId === tag.ID ? 'ยืนยันลบ' : 'ลบ'}</Text>
                </Pressable>
              </Pressable>
            );
          })}
          {!loading && tags.length === 0 ? <StateMessage title="ยังไม่มี tag" detail="เพิ่ม tag เพื่อจัดกลุ่มคุณสมบัติโต๊ะ" /> : null}
        </View>

        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>{editingTag ? 'แก้ไข tag' : 'เพิ่ม tag'}</Text>
          <FormField label="ชื่อ tag" value={tagName} onChangeText={setTagName} />
          <FormField keyboardType="numeric" label="ลำดับ" value={tagOrder} onChangeText={setTagOrder} />
          <View style={layout.headerRow}>
            <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>เปิดใช้งาน</Text>
            <Switch value={tagActive} onValueChange={setTagActive} />
          </View>
          {editingTag ? (
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
        <Pressable disabled={!canManage || submitting} onPress={saveTag} style={[layout.primaryButton, (!canManage || submitting) && { opacity: 0.65 }]}>
          <Text style={layout.primaryButtonText}>{submitting ? 'กำลังบันทึก...' : editingTag ? 'บันทึก tag' : 'เพิ่ม tag'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
