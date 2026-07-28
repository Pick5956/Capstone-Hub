import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { listIngredients } from '@/src/api/ingredient';
import { createMenuItem, deleteMenuItem, listCategories, listMenuItems, updateMenuItem } from '@/src/api/menu';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { toFloat, toInt } from '@/src/lib/forms';
import { initialMenuCategoryIds, selectableMenuCategories } from '@/src/lib/menu-editor';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Ingredient } from '@/src/types/ingredient';
import type { Category, MenuIngredientInput, MenuOptionGroupInput } from '@/src/types/menu';

const emptyGroup = (index: number): MenuOptionGroupInput => ({ name: '', required: false, min_select: 0, max_select: 1, display_order: index + 1, is_active: true, options: [] });

export default function MenuItemEditorScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const itemId = Number(id || 0); const editing = itemId > 0;
  const canManage = can(activeMembership, 'manage_menu');
  const canViewInventory = can(activeMembership, 'view_inventory') || can(activeMembership, 'manage_inventory');
  const [categories, setCategories] = useState<Category[]>([]); const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [name, setName] = useState(''); const [price, setPrice] = useState(''); const [description, setDescription] = useState(''); const [imageUrl, setImageUrl] = useState(''); const [displayOrder, setDisplayOrder] = useState('1');
  const [available, setAvailable] = useState<'yes' | 'no'>('yes'); const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [optionGroups, setOptionGroups] = useState<MenuOptionGroupInput[]>([]); const [ingredients, setIngredients] = useState<MenuIngredientInput[]>([]); const [ingredientCandidate, setIngredientCandidate] = useState('none');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    const ingredientRequest = canViewInventory
      ? listIngredients().catch(() => ({ ingredients: [] }))
      : Promise.resolve({ ingredients: [] as Ingredient[] });
    Promise.all([listCategories(), listMenuItems(), ingredientRequest]).then(([categoryResponse, menuResponse, ingredientResponse]) => {
      setCategories(categoryResponse.categories || []); setAllIngredients(ingredientResponse.ingredients || []);
      const item = menuResponse.menu_items.find((current) => current.ID === itemId);
      if (item) {
        setName(item.name); setPrice(String(item.price)); setDescription(item.description || ''); setImageUrl(item.image_url || ''); setDisplayOrder(String(item.display_order)); setAvailable(item.is_available ? 'yes' : 'no');
        setCategoryIds(initialMenuCategoryIds(item, categoryResponse.categories || []));
        setOptionGroups((item.option_groups || []).map((group) => ({ name: group.name, required: group.required, min_select: group.min_select, max_select: group.max_select, display_order: group.display_order, is_active: group.is_active, options: (group.options || []).map((option) => ({ name: option.name, price_delta: option.price_delta, is_default: option.is_default, display_order: option.display_order, is_active: option.is_active })) })));
        setIngredients((item.ingredients || []).map((ingredient) => ({ ingredient_id: ingredient.ingredient_id, quantity: ingredient.quantity, unit: ingredient.unit, note: ingredient.note })));
      } else if (!editing) {
        setCategoryIds(initialMenuCategoryIds(undefined, categoryResponse.categories || []));
      } else {
        setError(copy('ไม่พบเมนูที่ต้องการแก้ไข', 'The menu item you want to edit was not found.'));
      }
    }).catch((err) => setError(err instanceof Error ? err.message : copy('โหลดข้อมูลเมนูไม่สำเร็จ', 'Could not load menu item data.')));
  }, [canManage, canViewInventory, copy, editing, itemId]);

  const ingredientOptions = useMemo(() => [{ label: copy('เลือกวัตถุดิบ', 'Choose an ingredient'), value: 'none' }, ...allIngredients.filter((item) => !ingredients.some((row) => row.ingredient_id === item.ID)).map((item) => ({ label: item.name, value: String(item.ID) }))], [allIngredients, copy, ingredients]);
  function toggleCategory(categoryId: number) { setCategoryIds((current) => current.includes(categoryId) ? current.filter((value) => value !== categoryId) : [...current, categoryId]); }
  function updateGroup(index: number, patch: Partial<MenuOptionGroupInput>) { setOptionGroups((current) => current.map((group, currentIndex) => currentIndex === index ? { ...group, ...patch } : group)); }
  function updateOption(groupIndex: number, optionIndex: number, patch: Partial<MenuOptionGroupInput['options'][number]>) { setOptionGroups((current) => current.map((group, currentGroupIndex) => currentGroupIndex === groupIndex ? { ...group, options: group.options.map((option, currentOptionIndex) => currentOptionIndex === optionIndex ? { ...option, ...patch } : option) } : group)); }
  function addOption(groupIndex: number) { setOptionGroups((current) => current.map((group, index) => index === groupIndex ? { ...group, options: [...group.options, { name: '', price_delta: 0, is_default: false, display_order: group.options.length + 1, is_active: true }] } : group)); }
  function addIngredient() { const candidate = Number(ingredientCandidate); if (!candidate) return; const item = allIngredients.find((current) => current.ID === candidate); setIngredients((current) => [...current, { ingredient_id: candidate, quantity: 1, unit: item?.unit || '', note: '' }]); setIngredientCandidate('none'); }

  async function save() {
    if (!name.trim() || !price || !categoryIds.length) { setError(copy('กรอกชื่อ ราคา และเลือกอย่างน้อย 1 หมวด', 'Enter a name and price, then choose at least one category.')); return; }
    const invalidGroup = optionGroups.some((group) => !group.name.trim() || group.options.some((option) => !option.name.trim()));
    if (invalidGroup) { setError(copy('กรอกชื่อกลุ่มตัวเลือกและตัวเลือกให้ครบ', 'Complete every option group and option name.')); return; }
    setSaving(true); setError(null);
    try {
      const payload = { category_id: categoryIds[0], category_ids: categoryIds, name: name.trim(), price: toFloat(price, 0), image_url: imageUrl.trim(), description: description.trim(), is_available: available === 'yes', display_order: toInt(displayOrder, 0), option_groups: optionGroups, ingredients };
      if (editing) await updateMenuItem(itemId, payload); else await createMenuItem(payload);
      router.back();
    } catch (err) { setError(err instanceof Error ? err.message : copy('บันทึกเมนูไม่สำเร็จ', 'Could not save the menu item.')); }
    finally { setSaving(false); }
  }
  async function remove() { if (!confirmDelete) { setConfirmDelete(true); return; } setSaving(true); setError(null); try { await deleteMenuItem(itemId); router.back(); } catch (err) { setError(err instanceof Error ? err.message : copy('ลบเมนูไม่สำเร็จ', 'Could not delete the menu item.')); setSaving(false); } }

  if (!canManage) {
    return (
      <AppScreen title={copy('จัดการเมนู', 'Manage menu')} subtitle={copy('เฉพาะผู้ที่ได้รับสิทธิ์จัดการเมนู', 'Available to team members with menu management access')} topLevel={false}>
        <Feedback title={copy('ไม่มีสิทธิ์จัดการเมนู', 'Menu management access unavailable')} detail={copy('กลับไปเลือกโหมดงานที่บัญชีนี้ได้รับอนุญาต', 'Return and choose a workspace your account is allowed to use.')} tone="info" />
      </AppScreen>
    );
  }

  return (
    <AppScreen title={editing ? copy('แก้ไขเมนู', 'Edit menu item') : copy('เพิ่มเมนู', 'Add menu item')} subtitle={copy('ข้อมูลเดียวกันนี้ใช้ในหน้ารับออเดอร์ เมนูลูกค้า ต้นทุน และรายงาน', 'This information is shared across order taking, the customer menu, costing, and reports.')} topLevel={false}>
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title={copy('ข้อมูลเมนู', 'Menu item details')} />
        <TextField label={copy('ชื่อเมนู', 'Item name')} value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}><View style={{ flex: 1, minWidth: 140 }}><TextField label={copy('ราคา', 'Price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></View><View style={{ flex: 1, minWidth: 140 }}><TextField label={copy('ลำดับ', 'Display order')} value={displayOrder} onChangeText={setDisplayOrder} keyboardType="number-pad" /></View></View>
        <TextField label={copy('คำอธิบาย', 'Description')} value={description} onChangeText={setDescription} multiline />
        <TextField label={copy('ลิงก์รูปเมนู', 'Menu photo URL')} value={imageUrl} onChangeText={setImageUrl} placeholder={copy('https://... หรือ /uploads/...', 'https://... or /uploads/...')} />
        <ChipGroup label={copy('สถานะขาย', 'Availability')} value={available} onChange={setAvailable} options={[{ label: copy('พร้อมขาย', 'Available'), value: 'yes' }, { label: copy('ปิดขาย', 'Unavailable'), value: 'no' }]} />
        <View style={{ gap: spacing.sm }}><Text style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{copy('หมวดเมนู', 'Menu categories')}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{selectableMenuCategories(categories, categoryIds).map((item) => { const selected = categoryIds.includes(item.ID); return <Pressable accessibilityLabel={copy(`เลือกหมวด ${item.name}`, `Select category ${item.name}`)} accessibilityState={{ selected }} key={item.ID} onPress={() => toggleCategory(item.ID)} style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: selected ? palette.primary : palette.borderStrong, borderRadius: radius.md, backgroundColor: selected ? palette.primary : palette.surface, paddingHorizontal: spacing.md, opacity: pressed ? 0.75 : 1 })}><Text style={{ color: selected ? palette.primaryText : palette.text, fontSize: 13, fontWeight: '700' }}>{item.name}{item.is_active ? '' : copy(' (ปิดใช้งาน)', ' (inactive)')}</Text></Pressable>; })}</View></View>
      </Surface>

      <Surface>
        <SectionHeader title={copy('ตัวเลือกเมนู', 'Item options')} detail={copy('เช่น ระดับความเผ็ด ขนาด หรือท็อปปิง', 'For example, spice level, size, or toppings.')} action={<Button compact variant="secondary" label={copy('เพิ่มกลุ่ม', 'Add group')} onPress={() => setOptionGroups((current) => [...current, emptyGroup(current.length)])} />} />
        {optionGroups.map((group, groupIndex) => (
          <View key={groupIndex} style={{ gap: spacing.md }}>
            {groupIndex ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={[typeScale.cardTitle, { flex: 1 }]}>{copy(`กลุ่มตัวเลือก ${(groupIndex + 1).toLocaleString('th-TH')}`, `Option group ${(groupIndex + 1).toLocaleString('en-US')}`)}</Text><Button compact variant="ghost" label={copy('ลบกลุ่ม', 'Remove group')} onPress={() => setOptionGroups((current) => current.filter((_, index) => index !== groupIndex))} /></View>
            <TextField label={copy('ชื่อกลุ่ม', 'Group name')} value={group.name} onChangeText={(value) => updateGroup(groupIndex, { name: value })} />
            <ChipGroup label={copy('การเลือก', 'Selection rule')} value={group.required ? 'required' : 'optional'} onChange={(value) => updateGroup(groupIndex, { required: value === 'required', min_select: value === 'required' ? Math.max(1, group.min_select) : 0 })} options={[{ label: copy('ไม่บังคับ', 'Optional'), value: 'optional' }, { label: copy('ต้องเลือก', 'Required'), value: 'required' }]} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}><View style={{ flex: 1 }}><TextField label={copy('เลือกขั้นต่ำ', 'Minimum selections')} value={String(group.min_select)} onChangeText={(value) => updateGroup(groupIndex, { min_select: toInt(value, 0) })} keyboardType="number-pad" /></View><View style={{ flex: 1 }}><TextField label={copy('เลือกสูงสุด', 'Maximum selections')} value={String(group.max_select)} onChangeText={(value) => updateGroup(groupIndex, { max_select: Math.max(1, toInt(value, 1)) })} keyboardType="number-pad" /></View></View>
            {group.options.map((option, optionIndex) => <View key={optionIndex} style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={[typeScale.caption, { flex: 1, fontWeight: '700' }]}>{copy(`ตัวเลือก ${(optionIndex + 1).toLocaleString('th-TH')}`, `Option ${(optionIndex + 1).toLocaleString('en-US')}`)}</Text><Button compact variant="ghost" label={copy('ลบ', 'Remove')} onPress={() => updateGroup(groupIndex, { options: group.options.filter((_, index) => index !== optionIndex) })} /></View><TextField label={copy('ชื่อ', 'Name')} value={option.name} onChangeText={(value) => updateOption(groupIndex, optionIndex, { name: value })} /><TextField label={copy('ราคาเพิ่ม', 'Additional price')} value={String(option.price_delta)} onChangeText={(value) => updateOption(groupIndex, optionIndex, { price_delta: toFloat(value, 0) })} keyboardType="decimal-pad" /><ChipGroup label={copy('ค่าเริ่มต้น', 'Default selection')} value={option.is_default ? 'yes' : 'no'} onChange={(value) => updateOption(groupIndex, optionIndex, { is_default: value === 'yes' })} options={[{ label: copy('ไม่เลือก', 'Not selected'), value: 'no' }, { label: copy('เลือกไว้', 'Selected'), value: 'yes' }]} /></View>)}
            <Button variant="secondary" label={copy('เพิ่มตัวเลือก', 'Add option')} onPress={() => addOption(groupIndex)} />
          </View>
        ))}
        {!optionGroups.length ? <Text selectable style={[typeScale.body, { color: palette.muted }]}>{copy('เมนูนี้ยังไม่มีกลุ่มตัวเลือก', 'This item does not have any option groups yet.')}</Text> : null}
      </Surface>

      <Surface>
        <SectionHeader title={copy('สูตรวัตถุดิบ', 'Ingredient recipe')} detail={copy('ใช้คำนวณต้นทุนและตัดสต็อกเมื่อครัวทำเสร็จ', 'Used to calculate cost and deduct stock when the kitchen finishes an item.')} />
        {ingredients.map((row, index) => { const item = allIngredients.find((current) => current.ID === row.ingredient_id); return <View key={`${row.ingredient_id}-${index}`} style={{ gap: spacing.sm }}>{index ? <Divider /> : null}<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={[typeScale.cardTitle, { flex: 1 }]}>{item?.name || copy(`วัตถุดิบ #${row.ingredient_id}`, `Ingredient #${row.ingredient_id}`)}</Text><Button compact variant="ghost" label={copy('ลบ', 'Remove')} onPress={() => setIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index))} /></View><View style={{ flexDirection: 'row', gap: spacing.md }}><View style={{ flex: 1 }}><TextField label={copy('จำนวนต่อจาน', 'Quantity per serving')} value={String(row.quantity)} onChangeText={(value) => setIngredients((current) => current.map((currentRow, currentIndex) => currentIndex === index ? { ...currentRow, quantity: toFloat(value, 0) } : currentRow))} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><TextField label={copy('หน่วย', 'Unit')} value={row.unit || item?.unit || ''} onChangeText={(value) => setIngredients((current) => current.map((currentRow, currentIndex) => currentIndex === index ? { ...currentRow, unit: value } : currentRow))} /></View></View></View>; })}
        {ingredientOptions.length > 1 ? <><ChipGroup label={copy('เพิ่มวัตถุดิบ', 'Add ingredient')} value={ingredientCandidate} onChange={setIngredientCandidate} options={ingredientOptions} /><Button variant="secondary" label={copy('เพิ่มในสูตร', 'Add to recipe')} onPress={addIngredient} disabled={ingredientCandidate === 'none'} /></> : null}
      </Surface>

      <Surface><Button label={editing ? copy('บันทึกเมนู', 'Save menu item') : copy('เพิ่มเมนู', 'Add menu item')} onPress={save} loading={saving} /></Surface>
      {editing ? <Surface style={{ borderColor: confirmDelete ? palette.danger : palette.border }}><SectionHeader title={copy('ลบเมนู', 'Delete menu item')} detail={confirmDelete ? copy('แตะยืนยันอีกครั้ง เมนูจะถูกลบออกจากระบบ', 'Confirm again to permanently delete this menu item.') : copy('ถ้าต้องการหยุดขายชั่วคราว ให้ใช้สถานะปิดขายแทน', 'If this is temporary, mark the item unavailable instead.')} /><View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmDelete ? <Button variant="secondary" label={copy('ยกเลิก', 'Cancel')} onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} /> : null}<Button variant={confirmDelete ? 'danger' : 'secondary'} label={confirmDelete ? copy('ยืนยันลบเมนู', 'Confirm delete') : copy('ลบเมนู', 'Delete menu item')} onPress={remove} style={{ flex: 1 }} /></View></Surface> : null}
    </AppScreen>
  );
}
