import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { createIngredientCategory, listIngredientCategories } from '@/src/api/ingredient';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { StateMessage } from '@/src/components/mobile-screen';
import { Button, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing, typeScale } from '@/src/theme';
import type { IngredientCategory } from '@/src/types/ingredient';

export default function IngredientCategoriesScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_inventory');
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => listIngredientCategories().then((response) => setCategories(response.categories || [])).catch((err) => setError(err instanceof Error ? err.message : copy('โหลดหมวดไม่สำเร็จ', 'Could not load ingredient categories')));
  useEffect(() => { if (canManage) load(); }, [canManage]);
  async function add() {
    if (!canManage) return;
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try { await createIngredientCategory({ name: name.trim(), display_order: categories.length + 1, is_active: true }); setName(''); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : copy('เพิ่มหมวดไม่สำเร็จ', 'Could not add the category')); }
    finally { setSaving(false); }
  }
  if (!canManage) {
    return <AppScreen title={copy('หมวดวัตถุดิบ', 'Ingredient categories')} topLevel={false}><StateMessage title={copy('ไม่มีสิทธิ์จัดการคลังวัตถุดิบ', 'Inventory management access unavailable')} detail={copy('บัญชีนี้ต้องมีสิทธิ์จัดการคลังวัตถุดิบ', 'This account needs permission to manage inventory.')} /></AppScreen>;
  }
  return (
    <AppScreen title={copy('หมวดวัตถุดิบ', 'Ingredient categories')} subtitle={copy('ใช้จัดกลุ่มวัตถุดิบในคลังและรายงาน', 'Organize ingredients across inventory and reports.')} topLevel={false}>
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      <Surface><SectionHeader title={copy('เพิ่มหมวด', 'Add category')} /><TextField label={copy('ชื่อหมวด', 'Category name')} value={name} onChangeText={setName} /><Button label={copy('เพิ่มหมวดวัตถุดิบ', 'Add ingredient category')} onPress={add} loading={saving} disabled={!name.trim()} /></Surface>
      <Surface><SectionHeader title={copy('หมวดที่ใช้งาน', 'Ingredient categories')} detail={copy(`${categories.length.toLocaleString('th-TH')} หมวด`, `${categories.length.toLocaleString('en-US')} categories`)} />{categories.map((item) => <View key={item.ID} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}><Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{item.name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.is_active ? copy('ใช้งาน', 'Active') : copy('ปิดใช้งาน', 'Inactive')}</Text></View>)}</Surface>
    </AppScreen>
  );
}
