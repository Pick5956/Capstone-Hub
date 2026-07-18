import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { createIngredientCategory, listIngredientCategories } from '@/src/api/ingredient';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { palette, spacing, typeScale } from '@/src/theme';
import type { IngredientCategory } from '@/src/types/ingredient';

export default function IngredientCategoriesScreen() {
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => listIngredientCategories().then((response) => setCategories(response.categories || [])).catch((err) => setError(err instanceof Error ? err.message : 'โหลดหมวดไม่สำเร็จ'));
  useEffect(() => { load(); }, []);
  async function add() {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try { await createIngredientCategory({ name: name.trim(), display_order: categories.length + 1, is_active: true }); setName(''); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'เพิ่มหมวดไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  return (
    <AppScreen title="หมวดวัตถุดิบ" subtitle="ใช้จัดกลุ่มวัตถุดิบในคลังและรายงาน" topLevel={false}>
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}
      <Surface><SectionHeader title="เพิ่มหมวด" /><TextField label="ชื่อหมวด" value={name} onChangeText={setName} /><Button label="เพิ่มหมวดวัตถุดิบ" onPress={add} loading={saving} /></Surface>
      <Surface><SectionHeader title="หมวดที่ใช้งาน" detail={`${categories.length} หมวด`} />{categories.map((item) => <View key={item.ID} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}><Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{item.name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}</Text></View>)}</Surface>
    </AppScreen>
  );
}
