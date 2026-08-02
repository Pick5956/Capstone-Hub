import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { createCategory, deleteCategory, listCategories, updateCategory } from '@/src/api/menu';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { toInt } from '@/src/lib/forms';
import { categoryActiveToggleInput } from '@/src/lib/menu-editor';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing, typeScale } from '@/src/theme';
import type { Category } from '@/src/types/menu';

export default function MenuCategoriesScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_menu');
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState(''); const [order, setOrder] = useState('1'); const [active, setActive] = useState<'yes' | 'no'>('yes');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [confirmDelete, setConfirmDelete] = useState(false);
  const [updatingCategoryId, setUpdatingCategoryId] = useState<number | null>(null);
  const load = async () => { try { const response = await listCategories(); setCategories(response.categories || []); } catch (err) { setError(err instanceof Error ? err.message : copy('โหลดหมวดเมนูไม่สำเร็จ', 'Could not load menu categories')); } };
  useEffect(() => { if (canManage) load(); }, [canManage]);
  function choose(item?: Category) { setEditing(item || null); setName(item?.name || ''); setOrder(String(item?.display_order ?? categories.length + 1)); setActive(item?.is_active === false ? 'no' : 'yes'); setConfirmDelete(false); }
  async function save() { if (!name.trim()) return; setSaving(true); setError(null); try { const payload = { name: name.trim(), display_order: toInt(order, 0), is_active: active === 'yes' }; if (editing) await updateCategory(editing.ID, payload); else await createCategory(payload); choose(); await load(); } catch (err) { setError(err instanceof Error ? err.message : copy('บันทึกหมวดไม่สำเร็จ', 'Could not save the category')); } finally { setSaving(false); } }
  async function remove() { if (!editing) return; if (!confirmDelete) { setConfirmDelete(true); return; } setSaving(true); setError(null); try { await deleteCategory(editing.ID); choose(); await load(); } catch (err) { setError(err instanceof Error ? err.message : copy('ลบหมวดไม่สำเร็จ', 'Could not delete the category')); } finally { setSaving(false); } }
  async function toggleActive(item: Category) {
    setUpdatingCategoryId(item.ID);
    setError(null);
    try {
      const updated = await updateCategory(item.ID, categoryActiveToggleInput(item));
      setCategories((current) => current.map((category) => category.ID === updated.ID ? updated : category));
      if (editing?.ID === updated.ID) {
        setEditing(updated);
        setActive(updated.is_active ? 'yes' : 'no');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('เปลี่ยนสถานะหมวดไม่สำเร็จ', 'Could not update the category status'));
    } finally {
      setUpdatingCategoryId(null);
    }
  }

  if (!canManage) {
    return (
      <AppScreen title={copy('หมวดเมนู', 'Menu categories')} subtitle={copy('เฉพาะผู้ที่ได้รับสิทธิ์จัดการเมนู', 'Available to team members with menu management access')} topLevel={false}>
        <Feedback title={copy('ไม่มีสิทธิ์จัดการหมวดเมนู', 'Menu category access unavailable')} detail={copy('กลับไปเลือกโหมดงานที่บัญชีนี้ได้รับอนุญาต', 'Return and choose a workspace your account is allowed to use.')} tone="info" />
      </AppScreen>
    );
  }

  return (
    <AppScreen title={copy('หมวดเมนู', 'Menu categories')} subtitle={copy('จัดลำดับหมวดที่ใช้ในหน้ารับออเดอร์และเมนูลูกค้า', 'Organize categories used for order taking and the customer menu.')} topLevel={false}>
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title={editing ? copy('แก้ไขหมวด', 'Edit category') : copy('เพิ่มหมวด', 'Add category')} action={editing ? <Button compact variant="ghost" label={copy('เพิ่มใหม่', 'Add new')} onPress={() => choose()} /> : undefined} />
        <TextField label={copy('ชื่อหมวด', 'Category name')} value={name} onChangeText={setName} />
        <TextField label={copy('ลำดับ', 'Display order')} value={order} onChangeText={setOrder} keyboardType="number-pad" />
        <ChipGroup label={copy('สถานะ', 'Status')} value={active} onChange={setActive} options={[{ label: copy('เปิดใช้งาน', 'Active'), value: 'yes' }, { label: copy('ปิดใช้งาน', 'Inactive'), value: 'no' }]} />
        <Button label={editing ? copy('บันทึกหมวด', 'Save category') : copy('เพิ่มหมวด', 'Add category')} onPress={save} loading={saving} disabled={!name.trim()} />
        {editing ? <View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmDelete ? <Button variant="secondary" label={copy('ยกเลิก', 'Cancel')} onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} /> : null}<Button variant={confirmDelete ? 'danger' : 'secondary'} label={confirmDelete ? copy('ยืนยันลบหมวด', 'Confirm delete') : copy('ลบหมวด', 'Delete category')} onPress={remove} style={{ flex: 1 }} /></View> : null}
      </Surface>
      <Surface>
        <SectionHeader title={copy('หมวดทั้งหมด', 'All categories')} detail={copy(`${categories.length.toLocaleString('th-TH')} หมวด`, `${categories.length.toLocaleString('en-US')} categories`)} />
        {categories.map((item, index) => (
          <View key={item.ID}>
            {index ? <Divider /> : null}
            <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text selectable style={typeScale.cardTitle}>{item.name}</Text>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                  {copy(`ลำดับ ${item.display_order.toLocaleString('th-TH')} · ${item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}`, `Order ${item.display_order.toLocaleString('en-US')} · ${item.is_active ? 'Active' : 'Inactive'}`)}
                </Text>
              </View>
              <View style={{ gap: spacing.sm }}>
                <Button compact variant="secondary" label={copy('แก้ไข', 'Edit')} onPress={() => choose(item)} />
                <Button
                  compact
                  variant="ghost"
                  label={item.is_active ? copy('ปิดใช้งาน', 'Deactivate') : copy('เปิดใช้งาน', 'Activate')}
                  onPress={() => void toggleActive(item)}
                  loading={updatingCategoryId === item.ID}
                  disabled={updatingCategoryId !== null && updatingCategoryId !== item.ID}
                />
              </View>
            </View>
          </View>
        ))}
      </Surface>
    </AppScreen>
  );
}
