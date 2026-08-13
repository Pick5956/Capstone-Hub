import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, useWindowDimensions, View } from 'react-native';

import { listIngredientCategories, listIngredients } from '@/src/api/ingredient';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EdgeRow, EdgeSection, EdgeSectionHeader, EmptyState, Feedback, SearchField, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Ingredient, IngredientCategory } from '@/src/types/ingredient';

export default function InventoryScreen() {
  const { width } = useWindowDimensions();
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
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;

  if (!canView) {
    return (
      <AppScreen title={copy('คลังวัตถุดิบ', 'Inventory')} topLevel>
        <EmptyState title={copy('ไม่มีสิทธิ์ดูคลังวัตถุดิบ', 'Inventory access unavailable')} detail={copy('บัญชีนี้ต้องมีสิทธิ์ดูหรือจัดการคลังวัตถุดิบ', 'This account needs permission to view or manage inventory.')} />
      </AppScreen>
    );
  }

  const summaryPanel = (
    <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: tabletWorkspace ? 'column' : 'row' }}>
        {[
          { label: copy('มูลค่าคงคลัง', 'Inventory value'), value: money(value, language) },
          { label: copy('ใกล้หมด', 'Low stock'), value: low.toLocaleString(locale) },
          { label: copy('หมด', 'Out of stock'), value: out.toLocaleString(locale) },
        ].map((stat, index) => (
          <View
            key={stat.label}
            style={{
              minWidth: 0,
              flex: 1,
              gap: 3,
              borderLeftWidth: !tabletWorkspace && index ? 1 : 0,
              borderTopWidth: tabletWorkspace && index ? 1 : 0,
              borderColor: palette.border,
              padding: spacing.md,
            }}
          >
            <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} selectable style={typeScale.number}>{stat.value}</Text>
            <Text selectable numberOfLines={2} style={[typeScale.caption, { color: palette.muted }]}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </Surface>
  );

  const filterPanel = (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ minWidth: 0, flex: 1, justifyContent: 'center' }}>
          <SearchField
            accessibilityLabel={copy('ค้นหาชื่อหรือ SKU', 'Search by name or SKU')}
            clearLabel={copy('ล้างคำค้นหา', 'Clear search')}
            value={search}
            onChangeText={setSearch}
            placeholder={copy('ค้นหาวัตถุดิบ', 'Search inventory')}
          />
        </View>
        {canManage ? (
          <Button
            compact
            icon="folder-open-outline"
            variant="secondary"
            label={copy('หมวด', 'Categories')}
            onPress={() => router.push('/inventory/categories' as never)}
          />
        ) : null}
      </View>
      <ChipGroup scrollable value={category} onChange={setCategory} options={[{ label: copy('ทั้งหมด', 'All'), value: 'all' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
    </View>
  );

  const ingredientRows = filtered.map((item) => {
    const tone = Number(item.stock) <= 0 ? 'danger' : Number(item.stock) <= Number(item.min_stock) ? 'warning' : 'success';
    const label = tone === 'danger' ? copy('หมด', 'Out') : tone === 'warning' ? copy('ใกล้หมด', 'Low') : copy('ปกติ', 'In stock');
    const detail = `${item.category?.name || copy('ไม่มีหมวด', 'Uncategorized')}${item.sku ? ` · ${item.sku}` : ''}`;
    const trailing = (
      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
        <Text selectable numberOfLines={1} style={typeScale.number}>{Number(item.stock).toLocaleString(locale)} {item.unit}</Text>
        <StatusBadge label={label} tone={tone} />
      </View>
    );

    if (!tabletWorkspace) {
      return (
        <EdgeRow
          accessibilityLabel={copy(`ดูวัตถุดิบ ${item.name}`, `View ingredient ${item.name}`)}
          detail={detail}
          icon="cube-outline"
          iconColor={palette.muted}
          key={item.ID}
          onPress={() => router.push({ pathname: '/inventory/item' as never, params: { id: String(item.ID) } } as never)}
          title={item.name}
          trailing={trailing}
        />
      );
    }

    return (
      <Pressable
        accessibilityLabel={copy(`ดูวัตถุดิบ ${item.name}`, `View ingredient ${item.name}`)}
        accessibilityRole="button"
        key={item.ID}
        onPress={() => router.push({ pathname: '/inventory/item' as never, params: { id: String(item.ID) } } as never)}
        style={({ pressed }) => ({
          minHeight: 72,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          borderTopWidth: 1,
          borderTopColor: palette.border,
          backgroundColor: pressed ? palette.surfaceSubtle : palette.surface,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.surfaceStrong }}>
          <AppIcon color={palette.muted} name="cube-outline" size={21} />
        </View>
        <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
          <Text selectable numberOfLines={1} style={typeScale.cardTitle}>{item.name}</Text>
          <Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{detail}</Text>
        </View>
        {trailing}
      </Pressable>
    );
  });

  const emptyIngredients = !loading && !filtered.length ? (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
      <EmptyState
        title={copy('ไม่พบวัตถุดิบ', 'No ingredients found')}
        detail={ingredients.length ? copy('ลองเปลี่ยนคำค้นหรือหมวดวัตถุดิบ', 'Try changing the search term or category.') : copy('เพิ่มวัตถุดิบรายการแรกเพื่อเริ่มติดตามสต็อก', 'Add your first ingredient to start tracking stock.')}
      />
    </View>
  ) : null;

  const ingredientList = tabletWorkspace ? (
    <Surface style={{ width: '100%', gap: 0, padding: 0, overflow: 'hidden' }}>
      <View style={{ padding: spacing.lg }}>
        <SectionHeader title={copy('รายการวัตถุดิบ', 'Ingredients')} detail={copy(`${filtered.length.toLocaleString('th-TH')} รายการ`, `${filtered.length.toLocaleString('en-US')} items`)} />
      </View>
      <View>{ingredientRows}</View>
      {emptyIngredients}
    </Surface>
  ) : (
    <View style={{ width: '100%', gap: spacing.sm }}>
      <EdgeSectionHeader title={copy('รายการวัตถุดิบ', 'Ingredients')} detail={copy(`${filtered.length.toLocaleString('th-TH')} รายการ`, `${filtered.length.toLocaleString('en-US')} items`)} />
      <EdgeSection>
        {ingredientRows}
        {emptyIngredients}
      </EdgeSection>
    </View>
  );

  return (
    <AppScreen
      title={copy('คลังวัตถุดิบ', 'Inventory')}
      subtitle={copy(`${ingredients.length.toLocaleString('th-TH')} รายการ · ${(low + out).toLocaleString('th-TH')} รายการต้องตรวจสอบ`, `${ingredients.length.toLocaleString('en-US')} items · ${(low + out).toLocaleString('en-US')} need attention`)}
      topLevel
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      action={canManage ? <Button compact icon="add-outline" label={copy('เพิ่มวัตถุดิบ', 'Add ingredient')} onPress={() => router.push('/inventory/item' as never)} /> : undefined}
    >
      {error ? <Feedback title={copy('โหลดคลังไม่ได้', 'Could not load inventory')} detail={error} tone="danger" /> : null}
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 1.65 : undefined, gap: spacing.lg }}>
          {!tabletWorkspace ? summaryPanel : null}
          {!tabletWorkspace ? filterPanel : null}
          {ingredientList}
        </View>
        {tabletWorkspace ? (
          <View style={{ minWidth: 0, flex: 0.9, gap: spacing.lg }}>
            {summaryPanel}
            {filterPanel}
          </View>
        ) : null}
      </View>
    </AppScreen>
  );
}
