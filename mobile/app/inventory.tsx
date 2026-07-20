import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { listIngredientCategories, listIngredients } from '@/src/api/ingredient';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Ingredient, IngredientCategory } from '@/src/types/ingredient';

export default function InventoryScreen() {
  const { activeMembership } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManage = can(activeMembership, 'manage_inventory');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ingredientResponse, categoryResponse] = await Promise.all([listIngredients(), listIngredientCategories()]);
      setIngredients(ingredientResponse.ingredients || []);
      setCategories(categoryResponse.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดคลังวัตถุดิบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return ingredients.filter((item) => {
      const categoryMatch = category === 'all' || String(item.category_id || 'none') === category;
      const searchMatch = !keyword || [item.name, item.sku, item.category?.name].some((value) => String(value || '').toLowerCase().includes(keyword));
      return categoryMatch && searchMatch;
    });
  }, [category, ingredients, search]);
  const low = ingredients.filter((item) => Number(item.stock) > 0 && Number(item.stock) <= Number(item.min_stock)).length;
  const out = ingredients.filter((item) => Number(item.stock) <= 0).length;
  const value = ingredients.reduce((sum, item) => sum + Number(item.stock) * Number(item.cost_per_unit), 0);

  return (
    <AppScreen
      title="คลังวัตถุดิบ"
      subtitle={`${ingredients.length} รายการ · ${low + out} รายการต้องตรวจสอบ`}
      topLevel
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      action={canManage ? <Button compact label="เพิ่มวัตถุดิบ" onPress={() => router.push('/inventory/item' as never)} /> : undefined}
    >
      {error ? <Feedback title="โหลดคลังไม่ได้" detail={error} tone="danger" /> : null}
      <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[
            { label: 'มูลค่าคงคลัง', value: money(value) },
            { label: 'ใกล้หมด', value: String(low) },
            { label: 'หมด', value: String(out) },
          ].map((stat, index) => (
            <View key={stat.label} style={{ minWidth: 120, flexGrow: 1, gap: 3, borderLeftWidth: index ? 1 : 0, borderColor: palette.border, padding: spacing.lg }}>
              <Text selectable style={typeScale.number}>{stat.value}</Text>
              <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </Surface>

      <Surface>
        <SectionHeader title="ค้นหาและกรอง" action={canManage ? <Button compact variant="secondary" label="หมวดวัตถุดิบ" onPress={() => router.push('/inventory/categories' as never)} /> : undefined} />
        <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาชื่อหรือ SKU" placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        <ChipGroup value={category} onChange={setCategory} options={[{ label: 'ทั้งหมด', value: 'all' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
      </Surface>

      <View style={{ gap: spacing.md }}>
        <SectionHeader title="รายการวัตถุดิบ" detail={`${filtered.length} รายการที่ตรงกับตัวกรอง`} />
        {filtered.map((item) => {
          const tone = Number(item.stock) <= 0 ? 'danger' : Number(item.stock) <= Number(item.min_stock) ? 'warning' : 'success';
          const label = tone === 'danger' ? 'หมด' : tone === 'warning' ? 'ใกล้หมด' : 'ปกติ';
          return (
            <Pressable
              key={item.ID}
              disabled={!canManage}
              onPress={() => router.push({ pathname: '/inventory/item' as never, params: { id: String(item.ID) } } as never)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: pressed ? 0.75 : 1 })}
            >
              <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
                <Text selectable numberOfLines={1} style={typeScale.cardTitle}>{item.name}</Text>
                <Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{item.category?.name || 'ไม่มีหมวด'}{item.sku ? ` · ${item.sku}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                <Text selectable style={typeScale.number}>{Number(item.stock).toLocaleString()} {item.unit}</Text>
                <StatusBadge label={label} tone={tone} />
              </View>
            </Pressable>
          );
        })}
        {!loading && !filtered.length ? <EmptyState title="ไม่พบวัตถุดิบ" detail={ingredients.length ? 'ลองเปลี่ยนคำค้นหรือหมวดวัตถุดิบ' : 'เพิ่มวัตถุดิบรายการแรกเพื่อเริ่มติดตามสต็อก'} /> : null}
      </View>
    </AppScreen>
  );
}
