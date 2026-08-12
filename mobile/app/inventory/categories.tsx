import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { createIngredientCategory, listIngredientCategories } from '@/src/api/ingredient';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Divider, EdgeRow, EdgeSection, EdgeSectionHeader, EmptyState, Feedback, SectionHeader, StatusBadge, Surface, TextField } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, radius, spacing, typeScale } from '@/src/theme';
import type { IngredientCategory } from '@/src/types/ingredient';

export default function IngredientCategoriesScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_inventory');
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => listIngredientCategories()
    .then((response) => setCategories(response.categories || []))
    .catch((err) => setError(err instanceof Error ? err.message : copy('โหลดหมวดไม่สำเร็จ', 'Could not load ingredient categories')));

  useEffect(() => {
    if (canManage) void load();
  }, [canManage]);

  async function add() {
    if (!canManage || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createIngredientCategory({ name: name.trim(), display_order: categories.length + 1, is_active: true });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('เพิ่มหมวดไม่สำเร็จ', 'Could not add the category'));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <AppScreen title={copy('หมวดวัตถุดิบ', 'Ingredient categories')} topLevel={false}>
        <Feedback
          title={copy('ไม่มีสิทธิ์จัดการคลังวัตถุดิบ', 'Inventory management access unavailable')}
          detail={copy('บัญชีนี้ต้องมีสิทธิ์จัดการคลังวัตถุดิบ', 'This account needs permission to manage inventory.')}
          tone="info"
        />
      </AppScreen>
    );
  }

  const formPanel = (
    <Surface style={{ flex: tabletWorkspace ? 0.8 : undefined }}>
      <SectionHeader title={copy('เพิ่มหมวด', 'Add category')} />
      <TextField icon="folder-outline" label={copy('ชื่อหมวด', 'Category name')} value={name} onChangeText={setName} />
      <Button
        icon="add-outline"
        label={copy('เพิ่มหมวดวัตถุดิบ', 'Add ingredient category')}
        onPress={add}
        loading={saving}
        disabled={!name.trim()}
      />
    </Surface>
  );

  const listHeader = (
    <EdgeSectionHeader
      title={copy('หมวดที่ใช้งาน', 'Ingredient categories')}
      detail={copy(`${categories.length.toLocaleString('th-TH')} หมวด`, `${categories.length.toLocaleString('en-US')} categories`)}
    />
  );

  const listPanel = tabletWorkspace ? (
    <Surface style={{ flex: 1.2 }}>
      <SectionHeader
        title={copy('หมวดที่ใช้งาน', 'Ingredient categories')}
        detail={copy(`${categories.length.toLocaleString('th-TH')} หมวด`, `${categories.length.toLocaleString('en-US')} categories`)}
      />
      {categories.map((item, index) => (
        <View key={item.ID}>
          {index ? <Divider /> : null}
          <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.surfaceStrong }}>
              <AppIcon color={palette.muted} name="file-tray-stacked-outline" size={21} />
            </View>
            <Text selectable numberOfLines={1} style={[typeScale.cardTitle, { minWidth: 0, flex: 1 }]}>{item.name}</Text>
            <StatusBadge label={item.is_active ? copy('ใช้งาน', 'Active') : copy('ปิด', 'Inactive')} tone={item.is_active ? 'success' : 'neutral'} />
          </View>
        </View>
      ))}
      {!categories.length ? (
        <EmptyState title={copy('ยังไม่มีหมวดวัตถุดิบ', 'No ingredient categories yet')} detail={copy('เพิ่มหมวดแรกเพื่อจัดกลุ่มวัตถุดิบ', 'Add the first category to organize inventory.')} />
      ) : null}
    </Surface>
  ) : (
    <View style={{ gap: spacing.sm }}>
      {listHeader}
      <EdgeSection>
        {categories.map((item) => (
          <EdgeRow
            icon="file-tray-stacked-outline"
            iconColor={palette.muted}
            key={item.ID}
            title={item.name}
            trailing={<StatusBadge label={item.is_active ? copy('ใช้งาน', 'Active') : copy('ปิด', 'Inactive')} tone={item.is_active ? 'success' : 'neutral'} />}
          />
        ))}
        {!categories.length ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState title={copy('ยังไม่มีหมวดวัตถุดิบ', 'No ingredient categories yet')} detail={copy('เพิ่มหมวดแรกเพื่อจัดกลุ่มวัตถุดิบ', 'Add the first category to organize inventory.')} />
          </View>
        ) : null}
      </EdgeSection>
    </View>
  );

  return (
    <AppScreen
      title={copy('หมวดวัตถุดิบ', 'Ingredient categories')}
      subtitle={copy('จัดกลุ่มวัตถุดิบสำหรับคลังและรายงาน', 'Group ingredients for inventory and reports.')}
      topLevel={false}
    >
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: tabletWorkspace ? 'flex-start' : 'stretch', gap: spacing.lg }}>
        {tabletWorkspace ? listPanel : formPanel}
        {tabletWorkspace ? formPanel : listPanel}
      </View>
    </AppScreen>
  );
}
