import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { createCategory, deleteCategory, listCategories, updateCategory } from '@/src/api/menu';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, EdgeRow, EdgeSection, EdgeSectionHeader, EmptyState, Feedback, SectionHeader, StatusBadge, Surface, TextField } from '@/src/components/ui';
import { toInt } from '@/src/lib/forms';
import { categoryActiveToggleInput } from '@/src/lib/menu-editor';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Category } from '@/src/types/menu';

export default function MenuCategoriesScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canManage = can(activeMembership, 'manage_menu');
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [order, setOrder] = useState('1');
  const [active, setActive] = useState<'yes' | 'no'>('yes');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updatingCategoryId, setUpdatingCategoryId] = useState<number | null>(null);

  const load = async () => {
    try {
      const response = await listCategories();
      setCategories(response.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('โหลดหมวดเมนูไม่สำเร็จ', 'Could not load menu categories'));
    }
  };

  useEffect(() => {
    if (canManage) void load();
  }, [canManage]);

  function choose(item?: Category) {
    setEditing(item || null);
    setName(item?.name || '');
    setOrder(String(item?.display_order ?? categories.length + 1));
    setActive(item?.is_active === false ? 'no' : 'yes');
    setConfirmDelete(false);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), display_order: toInt(order, 0), is_active: active === 'yes' };
      if (editing) await updateCategory(editing.ID, payload);
      else await createCategory(payload);
      choose();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('บันทึกหมวดไม่สำเร็จ', 'Could not save the category'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteCategory(editing.ID);
      choose();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('ลบหมวดไม่สำเร็จ', 'Could not delete the category'));
    } finally {
      setSaving(false);
    }
  }

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
      <AppScreen title={copy('หมวดเมนู', 'Menu categories')} topLevel={false}>
        <Feedback
          title={copy('ไม่มีสิทธิ์จัดการหมวดเมนู', 'Menu category access unavailable')}
          detail={copy('บัญชีนี้ยังไม่ได้รับสิทธิ์จัดการเมนู', 'This account does not have menu management access.')}
          tone="info"
        />
      </AppScreen>
    );
  }

  const editorPanel = (
    <Surface style={{ flex: tabletWorkspace ? 0.82 : undefined }}>
      <SectionHeader
        title={editing ? copy('แก้ไขหมวด', 'Edit category') : copy('เพิ่มหมวด', 'Add category')}
        action={editing ? (
          <Button compact icon="add-outline" variant="ghost" label={copy('เพิ่มใหม่', 'Add new')} onPress={() => choose()} />
        ) : undefined}
      />
      <TextField icon="folder-outline" label={copy('ชื่อหมวด', 'Category name')} value={name} onChangeText={setName} />
      <TextField icon="reorder-three-outline" label={copy('ลำดับ', 'Display order')} value={order} onChangeText={setOrder} keyboardType="number-pad" />
      <ChipGroup
        label={copy('สถานะ', 'Status')}
        value={active}
        onChange={setActive}
        options={[
          { label: copy('เปิดใช้งาน', 'Active'), value: 'yes' },
          { label: copy('ปิดใช้งาน', 'Inactive'), value: 'no' },
        ]}
      />
      <Button
        icon="checkmark-outline"
        label={editing ? copy('บันทึกหมวด', 'Save category') : copy('เพิ่มหมวด', 'Add category')}
        onPress={save}
        loading={saving}
        disabled={!name.trim()}
      />
      {editing ? (
        <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}>
          {confirmDelete ? (
            <Text selectable style={[typeScale.caption, { color: palette.danger }]}>
              {copy('แตะยืนยันอีกครั้งเพื่อลบหมวดนี้', 'Confirm again to delete this category.')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {confirmDelete ? (
              <Button compact variant="secondary" label={copy('ยกเลิก', 'Cancel')} onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
            ) : null}
            <Button
              compact
              icon="trash-outline"
              variant={confirmDelete ? 'danger' : 'secondary'}
              label={confirmDelete ? copy('ยืนยันลบ', 'Confirm delete') : copy('ลบหมวด', 'Delete category')}
              onPress={remove}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </Surface>
  );

  const listPanel = tabletWorkspace ? (
    <Surface style={{ flex: 1.18 }}>
      <SectionHeader
        title={copy('หมวดทั้งหมด', 'All categories')}
        detail={copy(`${categories.length.toLocaleString('th-TH')} หมวด`, `${categories.length.toLocaleString('en-US')} categories`)}
      />
      {categories.map((item, index) => (
        <View key={item.ID}>
          {index ? <Divider /> : null}
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.surfaceStrong }}>
              <AppIcon color={palette.muted} name="folder-outline" size={21} />
            </View>
            <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
              <Text selectable numberOfLines={1} style={typeScale.cardTitle}>{item.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                  {copy(`ลำดับ ${item.display_order.toLocaleString('th-TH')}`, `Order ${item.display_order.toLocaleString('en-US')}`)}
                </Text>
                <StatusBadge label={item.is_active ? copy('ใช้งาน', 'Active') : copy('ปิด', 'Inactive')} tone={item.is_active ? 'success' : 'neutral'} />
              </View>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Button compact icon="create-outline" variant="secondary" label={copy('แก้ไข', 'Edit')} onPress={() => choose(item)} />
              <Button
                compact
                icon={item.is_active ? 'eye-off-outline' : 'eye-outline'}
                variant="ghost"
                label={item.is_active ? copy('ปิด', 'Hide') : copy('เปิด', 'Show')}
                onPress={() => void toggleActive(item)}
                loading={updatingCategoryId === item.ID}
                disabled={updatingCategoryId !== null && updatingCategoryId !== item.ID}
              />
            </View>
          </View>
        </View>
      ))}
      {!categories.length ? (
        <EmptyState title={copy('ยังไม่มีหมวดเมนู', 'No menu categories yet')} detail={copy('เพิ่มหมวดแรกเพื่อจัดกลุ่มเมนู', 'Add the first category to organize menu items.')} />
      ) : null}
    </Surface>
  ) : (
    <View style={{ gap: spacing.sm }}>
      <EdgeSectionHeader
        title={copy('หมวดทั้งหมด', 'All categories')}
        detail={copy(`${categories.length.toLocaleString('th-TH')} หมวด`, `${categories.length.toLocaleString('en-US')} categories`)}
      />
      <EdgeSection>
        {categories.map((item) => (
          <EdgeRow
            detail={copy(`ลำดับ ${item.display_order.toLocaleString('th-TH')}`, `Order ${item.display_order.toLocaleString('en-US')}`)}
            icon="folder-outline"
            iconColor={palette.muted}
            key={item.ID}
            title={item.name}
            trailing={(
              <View style={{ alignItems: 'flex-end', gap: spacing.sm }}>
                <StatusBadge label={item.is_active ? copy('ใช้งาน', 'Active') : copy('ปิด', 'Inactive')} tone={item.is_active ? 'success' : 'neutral'} />
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <Button compact icon="create-outline" variant="secondary" label={copy('แก้ไข', 'Edit')} onPress={() => choose(item)} />
                  <Button
                    compact
                    icon={item.is_active ? 'eye-off-outline' : 'eye-outline'}
                    variant="ghost"
                    label={item.is_active ? copy('ปิด', 'Hide') : copy('เปิด', 'Show')}
                    onPress={() => void toggleActive(item)}
                    loading={updatingCategoryId === item.ID}
                    disabled={updatingCategoryId !== null && updatingCategoryId !== item.ID}
                  />
                </View>
              </View>
            )}
          />
        ))}
        {!categories.length ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState title={copy('ยังไม่มีหมวดเมนู', 'No menu categories yet')} detail={copy('เพิ่มหมวดแรกเพื่อจัดกลุ่มเมนู', 'Add the first category to organize menu items.')} />
          </View>
        ) : null}
      </EdgeSection>
    </View>
  );

  return (
    <AppScreen
      title={copy('หมวดเมนู', 'Menu categories')}
      subtitle={copy('กำหนดหมวดและลำดับที่ใช้ตอนรับออเดอร์', 'Set the categories and order used while taking orders.')}
      topLevel={false}
    >
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: tabletWorkspace ? 'flex-start' : 'stretch', gap: spacing.lg }}>
        {tabletWorkspace ? listPanel : editorPanel}
        {tabletWorkspace ? editorPanel : listPanel}
      </View>
    </AppScreen>
  );
}
