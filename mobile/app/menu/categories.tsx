import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { createCategory, deleteCategory, listCategories, updateCategory } from '@/src/api/menu';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { toInt } from '@/src/lib/forms';
import { palette, spacing, typeScale } from '@/src/theme';
import type { Category } from '@/src/types/menu';

export default function MenuCategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState(''); const [order, setOrder] = useState('1'); const [active, setActive] = useState<'yes' | 'no'>('yes');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [confirmDelete, setConfirmDelete] = useState(false);
  const load = async () => { try { const response = await listCategories(); setCategories(response.categories || []); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดหมวดเมนูไม่สำเร็จ'); } };
  useEffect(() => { load(); }, []);
  function choose(item?: Category) { setEditing(item || null); setName(item?.name || ''); setOrder(String(item?.display_order ?? categories.length + 1)); setActive(item?.is_active === false ? 'no' : 'yes'); setConfirmDelete(false); }
  async function save() { if (!name.trim()) return; setSaving(true); setError(null); try { const payload = { name: name.trim(), display_order: toInt(order, 0), is_active: active === 'yes' }; if (editing) await updateCategory(editing.ID, payload); else await createCategory(payload); choose(); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกหมวดไม่สำเร็จ'); } finally { setSaving(false); } }
  async function remove() { if (!editing) return; if (!confirmDelete) { setConfirmDelete(true); return; } setSaving(true); setError(null); try { await deleteCategory(editing.ID); choose(); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'ลบหมวดไม่สำเร็จ'); } finally { setSaving(false); } }
  return (
    <AppScreen title="หมวดเมนู" subtitle="จัดลำดับหมวดที่ใช้ใน POS และเมนูลูกค้า" topLevel={false}>
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title={editing ? 'แก้ไขหมวด' : 'เพิ่มหมวด'} action={editing ? <Button compact variant="ghost" label="เพิ่มใหม่" onPress={() => choose()} /> : undefined} />
        <TextField label="ชื่อหมวด" value={name} onChangeText={setName} />
        <TextField label="ลำดับ" value={order} onChangeText={setOrder} keyboardType="number-pad" />
        <ChipGroup label="สถานะ" value={active} onChange={setActive} options={[{ label: 'เปิดใช้งาน', value: 'yes' }, { label: 'ปิดใช้งาน', value: 'no' }]} />
        <Button label={editing ? 'บันทึกหมวด' : 'เพิ่มหมวด'} onPress={save} loading={saving} />
        {editing ? <View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmDelete ? <Button variant="secondary" label="ยกเลิก" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} /> : null}<Button variant={confirmDelete ? 'danger' : 'secondary'} label={confirmDelete ? 'ยืนยันลบหมวด' : 'ลบหมวด'} onPress={remove} style={{ flex: 1 }} /></View> : null}
      </Surface>
      <Surface><SectionHeader title="หมวดทั้งหมด" detail={`${categories.length} หมวด`} />{categories.map((item, index) => <View key={item.ID}>{index ? <Divider /> : null}<View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><View style={{ flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{item.name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>ลำดับ {item.display_order} · {item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</Text></View><Button compact variant="secondary" label="แก้ไข" onPress={() => choose(item)} /></View></View>)}</Surface>
    </AppScreen>
  );
}
