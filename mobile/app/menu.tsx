import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';

import {
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  listCategories,
  listMenuItems,
  updateCategory,
  updateMenuItem,
} from '@/src/api/menu';
import { ChoiceRow, FormField, InlineActions, ToggleRow } from '@/src/components/form-controls';
import { MotionPressable } from '@/src/components/motion';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { money } from '@/src/lib/format';
import { toFloat, toInt } from '@/src/lib/forms';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';
import type { Category, MenuItem } from '@/src/types/menu';

type MenuEditor = 'item' | 'category' | null;

export default function MenuScreen() {
  const { activeMembership } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | undefined>();
  const [editor, setEditor] = useState<MenuEditor>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryOrder, setCategoryOrder] = useState('0');
  const [categoryActive, setCategoryActive] = useState(true);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState<number>(0);
  const [itemOrder, setItemOrder] = useState('0');
  const [itemAvailable, setItemAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canManage = can(activeMembership, 'manage_menu');
  const activeName = useMemo(() => {
    if (!activeCategoryId) return 'ทั้งหมด';
    return categories.find((category) => category.ID === activeCategoryId)?.name || 'หมวด';
  }, [activeCategoryId, categories]);

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ label: category.name, value: category.ID })),
    [categories],
  );

  const load = useCallback(async (categoryId = activeCategoryId) => {
    setError(null);
    try {
      const [categoryResponse, itemResponse] = await Promise.all([
        listCategories(),
        listMenuItems(categoryId),
      ]);
      setCategories(categoryResponse.categories);
      setItems(itemResponse.menu_items);
      if (!itemCategoryId && categoryResponse.categories[0]) {
        setItemCategoryId(categoryResponse.categories[0].ID);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดเมนูไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [activeCategoryId, itemCategoryId]);

  useEffect(() => {
    load(activeCategoryId);
  }, [activeCategoryId, load]);

  function resetCategoryForm() {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryOrder(String(categories.length + 1));
    setCategoryActive(true);
  }

  function resetItemForm() {
    setEditingItem(null);
    setItemName('');
    setItemPrice('');
    setItemDescription('');
    setItemImageUrl('');
    setItemCategoryId(categories[0]?.ID || 0);
    setItemOrder(String(items.length + 1));
    setItemAvailable(true);
  }

  function openCategoryEditor(category?: Category) {
    setEditor('category');
    setEditingCategory(category || null);
    setCategoryName(category?.name || '');
    setCategoryOrder(String(category?.display_order ?? categories.length + 1));
    setCategoryActive(category?.is_active ?? true);
  }

  function openItemEditor(item?: MenuItem) {
    setEditor('item');
    setEditingItem(item || null);
    setItemName(item?.name || '');
    setItemPrice(String(item?.price ?? ''));
    setItemDescription(item?.description || '');
    setItemImageUrl(item?.image_url || '');
    setItemCategoryId(item?.category_id || categories[0]?.ID || 0);
    setItemOrder(String(item?.display_order ?? items.length + 1));
    setItemAvailable(item?.is_available ?? true);
  }

  function closeEditor() {
    setEditor(null);
    resetCategoryForm();
    resetItemForm();
  }

  async function saveCategory() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        name: categoryName.trim(),
        display_order: toInt(categoryOrder, 0),
        is_active: categoryActive,
      };
      if (editingCategory) {
        await updateCategory(editingCategory.ID, payload);
      } else {
        await createCategory(payload);
      }
      setMessage('บันทึกหมวดเมนูแล้ว');
      closeEditor();
      await load(activeCategoryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกหมวดไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function saveItem() {
    if (!itemCategoryId) {
      setError('ต้องมีหมวดเมนูก่อนสร้างเมนู');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        category_id: itemCategoryId,
        category_ids: [itemCategoryId],
        name: itemName.trim(),
        price: toFloat(itemPrice, 0),
        description: itemDescription.trim(),
        image_url: itemImageUrl.trim(),
        is_available: itemAvailable,
        display_order: toInt(itemOrder, 0),
      };
      if (editingItem) {
        await updateMenuItem(editingItem.ID, payload);
      } else {
        await createMenuItem(payload);
      }
      setMessage('บันทึกเมนูแล้ว');
      closeEditor();
      await load(activeCategoryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกเมนูไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileScreen
      kicker="MENU"
      title="เมนูอาหาร"
      subtitle={`${activeName} · ${items.length} รายการ`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(activeCategoryId)} />}
    >
      <View style={layout.panel}>
        <ChoiceRow
          label="หมวดเมนู"
          value={activeCategoryId || 0}
          options={[{ label: 'ทั้งหมด', value: 0 }, ...categories.map((category) => ({ label: category.name, value: category.ID }))]}
          onChange={(value) => setActiveCategoryId(value || undefined)}
        />
        {canManage ? (
          <View style={layout.headerRow}>
            <Pressable onPress={() => openItemEditor()} style={[layout.primaryButton, { flex: 1 }]}>
              <Text style={layout.primaryButtonText}>+ เพิ่มเมนู</Text>
            </Pressable>
            <Pressable onPress={() => openCategoryEditor()} style={[layout.secondaryButton, { flex: 1 }]}>
              <Text style={layout.secondaryButtonText}>หมวดเมนู</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {editor === 'item' ? (
        <View style={layout.panel}>
          <View style={layout.headerRow}>
            <Text selectable style={[typeScale.title, { flex: 1 }]}>{editingItem ? 'แก้ไขเมนู' : 'เพิ่มเมนู'}</Text>
            <Pressable onPress={closeEditor} style={layout.secondaryButton}>
              <Text style={layout.secondaryButtonText}>ปิด</Text>
            </Pressable>
          </View>
          <FormField label="ชื่อเมนู" value={itemName} onChangeText={setItemName} />
          <FormField label="ราคา" value={itemPrice} onChangeText={setItemPrice} keyboardType="numeric" />
          <ChoiceRow label="หมวด" value={itemCategoryId} options={categoryOptions} onChange={setItemCategoryId} />
          <FormField label="รายละเอียด" value={itemDescription} onChangeText={setItemDescription} multiline />
          <FormField label="URL รูปเมนู" value={itemImageUrl} onChangeText={setItemImageUrl} />
          <ToggleRow label="พร้อมขาย" value={itemAvailable} onValueChange={setItemAvailable} />
          <Pressable disabled={saving} onPress={saveItem} style={[layout.primaryButton, saving && { opacity: 0.65 }]}>
            <Text style={layout.primaryButtonText}>{saving ? 'กำลังบันทึก...' : editingItem ? 'บันทึกเมนู' : '+ เพิ่มเมนู'}</Text>
          </Pressable>
        </View>
      ) : null}

      {editor === 'category' ? (
        <View style={layout.panel}>
          <View style={layout.headerRow}>
            <Text selectable style={[typeScale.title, { flex: 1 }]}>{editingCategory ? 'แก้ไขหมวด' : 'จัดการหมวด'}</Text>
            <Pressable onPress={closeEditor} style={layout.secondaryButton}>
              <Text style={layout.secondaryButtonText}>ปิด</Text>
            </Pressable>
          </View>
          <FormField label="ชื่อหมวด" value={categoryName} onChangeText={setCategoryName} />
          <FormField label="ลำดับ" value={categoryOrder} onChangeText={setCategoryOrder} keyboardType="numeric" />
          <ToggleRow label="เปิดใช้งานหมวด" value={categoryActive} onValueChange={setCategoryActive} />
          <Pressable disabled={saving} onPress={saveCategory} style={[layout.primaryButton, saving && { opacity: 0.65 }]}>
            <Text style={layout.primaryButtonText}>{saving ? 'กำลังบันทึก...' : editingCategory ? 'บันทึกหมวด' : '+ เพิ่มหมวด'}</Text>
          </Pressable>

          {categories.length ? (
            <View style={{ gap: 10 }}>
              <Text selectable style={typeScale.cardTitle}>หมวดทั้งหมด</Text>
              {categories.map((category) => (
                <View key={category.ID} style={layout.card}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text selectable style={typeScale.cardTitle}>{category.name}</Text>
                    <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                      ลำดับ {category.display_order} · {category.is_active ? 'เปิด' : 'ปิด'}
                    </Text>
                  </View>
                  <Pressable onPress={() => openCategoryEditor(category)} style={layout.secondaryButton}>
                    <Text style={layout.secondaryButtonText}>แก้</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => Alert.alert('ลบหมวด?', category.name, [
                      { text: 'ไม่' },
                      { text: 'ลบ', style: 'destructive', onPress: async () => { await deleteCategory(category.ID); await load(activeCategoryId); } },
                    ])}
                    style={layout.secondaryButton}
                  >
                    <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>ลบ</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {message ? <Text selectable style={[typeScale.caption, { color: colors.accent }]}>{message}</Text> : null}
      {error ? <StateMessage title="ทำรายการไม่สำเร็จ" detail={error} /> : null}
      {!error && !loading && items.length === 0 ? <StateMessage title="ยังไม่มีเมนูในหมวดนี้" /> : null}

      <View style={{ gap: 10 }}>
        <Text selectable style={typeScale.title}>รายการเมนู</Text>
        {items.map((item, index) => (
          <MotionPressable
            key={item.ID}
            delay={90 + index * 25}
            disabled={!canManage}
            onPress={() => openItemEditor(item)}
            style={({ pressed }) => [layout.panel, pressed && { borderColor: colors.primary }]}
          >
            <View style={layout.headerRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text selectable style={typeScale.cardTitle}>{item.name}</Text>
                {item.description ? (
                  <Text selectable numberOfLines={2} style={[typeScale.caption, { color: colors.muted }]}>
                    {item.description}
                  </Text>
                ) : null}
                <Text selectable style={[typeScale.caption, { color: item.is_available ? colors.muted : colors.danger }]}>
                  {item.is_available ? 'พร้อมขาย' : 'ปิดขาย'} · {item.category?.name || categories.find((category) => category.ID === item.category_id)?.name || 'ไม่มีหมวด'}
                </Text>
              </View>
              <Text selectable style={[typeScale.cardTitle, { fontVariant: ['tabular-nums'] }]}>{money(item.price)}</Text>
            </View>
            {canManage ? (
              <InlineActions>
                <Pressable onPress={() => openItemEditor(item)} style={layout.secondaryButton}>
                  <Text style={layout.secondaryButtonText}>แก้ไข</Text>
                </Pressable>
                <Pressable
                  onPress={() => Alert.alert('ลบเมนู?', item.name, [
                    { text: 'ไม่' },
                    { text: 'ลบ', style: 'destructive', onPress: async () => { await deleteMenuItem(item.ID); await load(activeCategoryId); } },
                  ])}
                  style={layout.secondaryButton}
                >
                  <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>ลบ</Text>
                </Pressable>
              </InlineActions>
            ) : null}
          </MotionPressable>
        ))}
      </View>
    </MobileScreen>
  );
}
