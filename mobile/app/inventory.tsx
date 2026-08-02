import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { listIngredientCategories, listIngredients } from '@/src/api/ingredient';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Ingredient, IngredientCategory } from '@/src/types/ingredient';

export default function InventoryScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManage = can(activeMembership, 'manage_inventory');
  const canView = can(activeMembership, 'view_inventory') || canManage;

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ingredientResponse, categoryResponse] = await Promise.all([listIngredients(), listIngredientCategories()]);
      setIngredients(ingredientResponse.ingredients || []);
      setCategories(categoryResponse.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('โหลดคลังวัตถุดิบไม่สำเร็จ', 'Could not load inventory.'));
    } finally {
      setLoading(false);
    }
  }, [canView, copy]);

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

  if (!canView) {
    return (
      <AppScreen title={copy('คลังวัตถุดิบ', 'Inventory')} topLevel>
        <EmptyState title={copy('ไม่มีสิทธิ์ดูคลังวัตถุดิบ', 'Inventory access unavailable')} detail={copy('บัญชีนี้ต้องมีสิทธิ์ดูหรือจัดการคลังวัตถุดิบ', 'This account needs permission to view or manage inventory.')} />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('คลังวัตถุดิบ', 'Inventory')}
      subtitle={copy(`${ingredients.length.toLocaleString('th-TH')} รายการ · ${(low + out).toLocaleString('th-TH')} รายการต้องตรวจสอบ`, `${ingredients.length.toLocaleString('en-US')} items · ${(low + out).toLocaleString('en-US')} need attention`)}
      topLevel
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      action={canManage ? <Button compact label={copy('เพิ่มวัตถุดิบ', 'Add ingredient')} onPress={() => router.push('/inventory/item' as never)} /> : undefined}
    >
      {error ? <Feedback title={copy('โหลดคลังไม่ได้', 'Could not load inventory')} detail={error} tone="danger" /> : null}
      <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[
            { label: copy('มูลค่าคงคลัง', 'Inventory value'), value: money(value, language) },
            { label: copy('ใกล้หมด', 'Low stock'), value: low.toLocaleString(locale) },
            { label: copy('หมด', 'Out of stock'), value: out.toLocaleString(locale) },
          ].map((stat, index) => (
            <View key={stat.label} style={{ minWidth: 120, flexGrow: 1, gap: 3, borderLeftWidth: index ? 1 : 0, borderColor: palette.border, padding: spacing.lg }}>
              <Text selectable style={typeScale.number}>{stat.value}</Text>
              <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </Surface>

      <Surface>
        <SectionHeader title={copy('ค้นหาและกรอง', 'Search and filters')} action={canManage ? <Button compact variant="secondary" label={copy('หมวดวัตถุดิบ', 'Ingredient categories')} onPress={() => router.push('/inventory/categories' as never)} /> : undefined} />
        <TextInput accessibilityLabel={copy('ค้นหาชื่อหรือ SKU', 'Search by name or SKU')} value={search} onChangeText={setSearch} placeholder={copy('ค้นหาชื่อหรือ SKU', 'Search by name or SKU')} placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        <ChipGroup value={category} onChange={setCategory} options={[{ label: copy('ทั้งหมด', 'All'), value: 'all' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
      </Surface>

      <View style={{ gap: spacing.md }}>
        <SectionHeader title={copy('รายการวัตถุดิบ', 'Ingredients')} detail={copy(`${filtered.length.toLocaleString('th-TH')} รายการที่ตรงกับตัวกรอง`, `${filtered.length.toLocaleString('en-US')} matching items`)} />
        {filtered.map((item) => {
          const tone = Number(item.stock) <= 0 ? 'danger' : Number(item.stock) <= Number(item.min_stock) ? 'warning' : 'success';
          const label = tone === 'danger' ? copy('หมด', 'Out') : tone === 'warning' ? copy('ใกล้หมด', 'Low') : copy('ปกติ', 'In stock');
          return (
            <Pressable
              accessibilityLabel={copy(`ดูวัตถุดิบ ${item.name}`, `View ingredient ${item.name}`)}
              key={item.ID}
              onPress={() => router.push({ pathname: '/inventory/item' as never, params: { id: String(item.ID) } } as never)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: pressed ? 0.75 : 1 })}
            >
              <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
                <Text selectable numberOfLines={1} style={typeScale.cardTitle}>{item.name}</Text>
                <Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{item.category?.name || copy('ไม่มีหมวด', 'Uncategorized')}{item.sku ? ` · ${item.sku}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                <Text selectable style={typeScale.number}>{Number(item.stock).toLocaleString(locale)} {item.unit}</Text>
                <StatusBadge label={label} tone={tone} />
              </View>
            </Pressable>
          );
        })}
        {!loading && !filtered.length ? <EmptyState title={copy('ไม่พบวัตถุดิบ', 'No ingredients found')} detail={ingredients.length ? copy('ลองเปลี่ยนคำค้นหรือหมวดวัตถุดิบ', 'Try changing the search term or category.') : copy('เพิ่มวัตถุดิบรายการแรกเพื่อเริ่มติดตามสต็อก', 'Add your first ingredient to start tracking stock.')} /> : null}
      </View>
    </AppScreen>
  );
}
