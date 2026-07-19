import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { listIngredients } from '@/src/api/ingredient';
import { createMenuItem, deleteMenuItem, listCategories, listMenuItems, updateMenuItem } from '@/src/api/menu';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { toFloat, toInt } from '@/src/lib/forms';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Ingredient } from '@/src/types/ingredient';
import type { Category, MenuIngredientInput, MenuOptionGroupInput } from '@/src/types/menu';

const emptyGroup = (index: number): MenuOptionGroupInput => ({ name: '', required: false, min_select: 0, max_select: 1, display_order: index + 1, is_active: true, options: [] });

export default function MenuItemEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const itemId = Number(id || 0); const editing = itemId > 0;
  const [categories, setCategories] = useState<Category[]>([]); const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [name, setName] = useState(''); const [price, setPrice] = useState(''); const [description, setDescription] = useState(''); const [imageUrl, setImageUrl] = useState(''); const [displayOrder, setDisplayOrder] = useState('1');
  const [available, setAvailable] = useState<'yes' | 'no'>('yes'); const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [optionGroups, setOptionGroups] = useState<MenuOptionGroupInput[]>([]); const [ingredients, setIngredients] = useState<MenuIngredientInput[]>([]); const [ingredientCandidate, setIngredientCandidate] = useState('none');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    Promise.all([listCategories(), listMenuItems(), listIngredients()]).then(([categoryResponse, menuResponse, ingredientResponse]) => {
      setCategories(categoryResponse.categories || []); setAllIngredients(ingredientResponse.ingredients || []);
      const item = menuResponse.menu_items.find((current) => current.ID === itemId);
      if (item) {
        setName(item.name); setPrice(String(item.price)); setDescription(item.description || ''); setImageUrl(item.image_url || ''); setDisplayOrder(String(item.display_order)); setAvailable(item.is_available ? 'yes' : 'no');
        const linked = item.categories?.map((link) => link.category_id) || [item.category_id]; setCategoryIds(linked.filter(Boolean));
        setOptionGroups((item.option_groups || []).map((group) => ({ name: group.name, required: group.required, min_select: group.min_select, max_select: group.max_select, display_order: group.display_order, is_active: group.is_active, options: (group.options || []).map((option) => ({ name: option.name, price_delta: option.price_delta, is_default: option.is_default, display_order: option.display_order, is_active: option.is_active })) })));
        setIngredients((item.ingredients || []).map((ingredient) => ({ ingredient_id: ingredient.ingredient_id, quantity: ingredient.quantity, unit: ingredient.unit, note: ingredient.note })));
      } else if (categoryResponse.categories[0]) setCategoryIds([categoryResponse.categories[0].ID]);
    }).catch((err) => setError(err instanceof Error ? err.message : 'โหลดข้อมูลเมนูไม่สำเร็จ'));
  }, [itemId]);

  const ingredientOptions = useMemo(() => [{ label: 'เลือกวัตถุดิบ', value: 'none' }, ...allIngredients.filter((item) => !ingredients.some((row) => row.ingredient_id === item.ID)).map((item) => ({ label: item.name, value: String(item.ID) }))], [allIngredients, ingredients]);
  function toggleCategory(categoryId: number) { setCategoryIds((current) => current.includes(categoryId) ? current.filter((value) => value !== categoryId) : [...current, categoryId]); }
  function updateGroup(index: number, patch: Partial<MenuOptionGroupInput>) { setOptionGroups((current) => current.map((group, currentIndex) => currentIndex === index ? { ...group, ...patch } : group)); }
  function updateOption(groupIndex: number, optionIndex: number, patch: Partial<MenuOptionGroupInput['options'][number]>) { setOptionGroups((current) => current.map((group, currentGroupIndex) => currentGroupIndex === groupIndex ? { ...group, options: group.options.map((option, currentOptionIndex) => currentOptionIndex === optionIndex ? { ...option, ...patch } : option) } : group)); }
  function addOption(groupIndex: number) { setOptionGroups((current) => current.map((group, index) => index === groupIndex ? { ...group, options: [...group.options, { name: '', price_delta: 0, is_default: false, display_order: group.options.length + 1, is_active: true }] } : group)); }
  function addIngredient() { const candidate = Number(ingredientCandidate); if (!candidate) return; const item = allIngredients.find((current) => current.ID === candidate); setIngredients((current) => [...current, { ingredient_id: candidate, quantity: 1, unit: item?.unit || '', note: '' }]); setIngredientCandidate('none'); }

  async function save() {
    if (!name.trim() || !price || !categoryIds.length) { setError('กรอกชื่อ ราคา และเลือกอย่างน้อย 1 หมวด'); return; }
    const invalidGroup = optionGroups.some((group) => !group.name.trim() || group.options.some((option) => !option.name.trim()));
    if (invalidGroup) { setError('กรอกชื่อกลุ่มตัวเลือกและตัวเลือกให้ครบ'); return; }
    setSaving(true); setError(null);
    try {
      const payload = { category_id: categoryIds[0], category_ids: categoryIds, name: name.trim(), price: toFloat(price, 0), image_url: imageUrl.trim(), description: description.trim(), is_available: available === 'yes', display_order: toInt(displayOrder, 0), option_groups: optionGroups, ingredients };
      if (editing) await updateMenuItem(itemId, payload); else await createMenuItem(payload);
      router.back();
    } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกเมนูไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  async function remove() { if (!confirmDelete) { setConfirmDelete(true); return; } setSaving(true); setError(null); try { await deleteMenuItem(itemId); router.back(); } catch (err) { setError(err instanceof Error ? err.message : 'ลบเมนูไม่สำเร็จ'); setSaving(false); } }

  return (
    <AppScreen title={editing ? 'แก้ไขเมนู' : 'เพิ่มเมนู'} subtitle="ข้อมูลเดียวกันนี้ใช้ในหน้ารับออเดอร์ เมนูลูกค้า ต้นทุน และรายงาน" topLevel={false}>
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title="ข้อมูลเมนู" />
        <TextField label="ชื่อเมนู" value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}><View style={{ flex: 1, minWidth: 140 }}><TextField label="ราคา" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></View><View style={{ flex: 1, minWidth: 140 }}><TextField label="ลำดับ" value={displayOrder} onChangeText={setDisplayOrder} keyboardType="number-pad" /></View></View>
        <TextField label="คำอธิบาย" value={description} onChangeText={setDescription} multiline />
        <TextField label="ลิงก์รูปเมนู" value={imageUrl} onChangeText={setImageUrl} placeholder="https://... หรือ /uploads/..." />
        <ChipGroup label="สถานะขาย" value={available} onChange={setAvailable} options={[{ label: 'พร้อมขาย', value: 'yes' }, { label: 'ปิดขาย', value: 'no' }]} />
        <View style={{ gap: spacing.sm }}><Text style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>หมวดเมนู</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{categories.filter((item) => item.is_active).map((item) => { const selected = categoryIds.includes(item.ID); return <Pressable key={item.ID} onPress={() => toggleCategory(item.ID)} style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: selected ? palette.primary : palette.borderStrong, borderRadius: radius.md, backgroundColor: selected ? palette.primary : palette.surface, paddingHorizontal: spacing.md, opacity: pressed ? 0.75 : 1 })}><Text style={{ color: selected ? palette.primaryText : palette.text, fontSize: 13, fontWeight: '700' }}>{item.name}</Text></Pressable>; })}</View></View>
      </Surface>

      <Surface>
        <SectionHeader title="ตัวเลือกเมนู" detail="เช่น ระดับความเผ็ด ขนาด หรือท็อปปิง" action={<Button compact variant="secondary" label="เพิ่มกลุ่ม" onPress={() => setOptionGroups((current) => [...current, emptyGroup(current.length)])} />} />
        {optionGroups.map((group, groupIndex) => (
          <View key={groupIndex} style={{ gap: spacing.md }}>
            {groupIndex ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={[typeScale.cardTitle, { flex: 1 }]}>กลุ่มตัวเลือก {groupIndex + 1}</Text><Button compact variant="ghost" label="ลบกลุ่ม" onPress={() => setOptionGroups((current) => current.filter((_, index) => index !== groupIndex))} /></View>
            <TextField label="ชื่อกลุ่ม" value={group.name} onChangeText={(value) => updateGroup(groupIndex, { name: value })} />
            <ChipGroup label="การเลือก" value={group.required ? 'required' : 'optional'} onChange={(value) => updateGroup(groupIndex, { required: value === 'required', min_select: value === 'required' ? Math.max(1, group.min_select) : 0 })} options={[{ label: 'ไม่บังคับ', value: 'optional' }, { label: 'ต้องเลือก', value: 'required' }]} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}><View style={{ flex: 1 }}><TextField label="เลือกขั้นต่ำ" value={String(group.min_select)} onChangeText={(value) => updateGroup(groupIndex, { min_select: toInt(value, 0) })} keyboardType="number-pad" /></View><View style={{ flex: 1 }}><TextField label="เลือกสูงสุด" value={String(group.max_select)} onChangeText={(value) => updateGroup(groupIndex, { max_select: Math.max(1, toInt(value, 1)) })} keyboardType="number-pad" /></View></View>
            {group.options.map((option, optionIndex) => <View key={optionIndex} style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={[typeScale.caption, { flex: 1, fontWeight: '700' }]}>ตัวเลือก {optionIndex + 1}</Text><Button compact variant="ghost" label="ลบ" onPress={() => updateGroup(groupIndex, { options: group.options.filter((_, index) => index !== optionIndex) })} /></View><TextField label="ชื่อ" value={option.name} onChangeText={(value) => updateOption(groupIndex, optionIndex, { name: value })} /><TextField label="ราคาเพิ่ม" value={String(option.price_delta)} onChangeText={(value) => updateOption(groupIndex, optionIndex, { price_delta: toFloat(value, 0) })} keyboardType="decimal-pad" /><ChipGroup label="ค่าเริ่มต้น" value={option.is_default ? 'yes' : 'no'} onChange={(value) => updateOption(groupIndex, optionIndex, { is_default: value === 'yes' })} options={[{ label: 'ไม่เลือก', value: 'no' }, { label: 'เลือกไว้', value: 'yes' }]} /></View>)}
            <Button variant="secondary" label="เพิ่มตัวเลือก" onPress={() => addOption(groupIndex)} />
          </View>
        ))}
        {!optionGroups.length ? <Text selectable style={[typeScale.body, { color: palette.muted }]}>เมนูนี้ยังไม่มีกลุ่มตัวเลือก</Text> : null}
      </Surface>

      <Surface>
        <SectionHeader title="สูตรวัตถุดิบ" detail="ใช้คำนวณต้นทุนและตัดสต็อกเมื่อเสิร์ฟ" />
        {ingredients.map((row, index) => { const item = allIngredients.find((current) => current.ID === row.ingredient_id); return <View key={`${row.ingredient_id}-${index}`} style={{ gap: spacing.sm }}>{index ? <Divider /> : null}<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={[typeScale.cardTitle, { flex: 1 }]}>{item?.name || `วัตถุดิบ #${row.ingredient_id}`}</Text><Button compact variant="ghost" label="ลบ" onPress={() => setIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index))} /></View><View style={{ flexDirection: 'row', gap: spacing.md }}><View style={{ flex: 1 }}><TextField label="จำนวนต่อจาน" value={String(row.quantity)} onChangeText={(value) => setIngredients((current) => current.map((currentRow, currentIndex) => currentIndex === index ? { ...currentRow, quantity: toFloat(value, 0) } : currentRow))} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><TextField label="หน่วย" value={row.unit || item?.unit || ''} onChangeText={(value) => setIngredients((current) => current.map((currentRow, currentIndex) => currentIndex === index ? { ...currentRow, unit: value } : currentRow))} /></View></View></View>; })}
        {ingredientOptions.length > 1 ? <><ChipGroup label="เพิ่มวัตถุดิบ" value={ingredientCandidate} onChange={setIngredientCandidate} options={ingredientOptions} /><Button variant="secondary" label="เพิ่มในสูตร" onPress={addIngredient} disabled={ingredientCandidate === 'none'} /></> : null}
      </Surface>

      <Surface><Button label={editing ? 'บันทึกเมนู' : 'เพิ่มเมนู'} onPress={save} loading={saving} /></Surface>
      {editing ? <Surface style={{ borderColor: confirmDelete ? palette.danger : palette.border }}><SectionHeader title="ลบเมนู" detail={confirmDelete ? 'แตะยืนยันอีกครั้ง เมนูจะถูกลบออกจากระบบ' : 'ถ้าต้องการหยุดขายชั่วคราว ให้ใช้สถานะปิดขายแทน'} /><View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmDelete ? <Button variant="secondary" label="ยกเลิก" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} /> : null}<Button variant={confirmDelete ? 'danger' : 'secondary'} label={confirmDelete ? 'ยืนยันลบเมนู' : 'ลบเมนู'} onPress={remove} style={{ flex: 1 }} /></View></Surface> : null}
    </AppScreen>
  );
}
