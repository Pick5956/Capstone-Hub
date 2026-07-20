import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { adjustStock, createIngredient, deleteIngredient, listIngredientCategories, listIngredients, listTransactions, updateIngredient } from '@/src/api/ingredient';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { toFloat } from '@/src/lib/forms';
import { palette, spacing, typeScale } from '@/src/theme';
import type { Ingredient, IngredientCategory, IngredientTransaction } from '@/src/types/ingredient';

export default function InventoryItemScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const itemId = Number(id || 0);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [transactions, setTransactions] = useState<IngredientTransaction[]>([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('none');
  const [unit, setUnit] = useState('กก.');
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [cost, setCost] = useState('0');
  const [yieldPercent, setYieldPercent] = useState('100');
  const [storageType, setStorageType] = useState('dry');
  const [adjustType, setAdjustType] = useState<'in' | 'out' | 'adjust'>('in');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editing = itemId > 0;

  useEffect(() => {
    Promise.all([listIngredientCategories(), listIngredients(), editing ? listTransactions(itemId) : Promise.resolve({ transactions: [] })])
      .then(([categoryResponse, ingredientResponse, transactionResponse]) => {
        setCategories(categoryResponse.categories || []);
        setTransactions(transactionResponse.transactions || []);
        const item = ingredientResponse.ingredients.find((current) => current.ID === itemId);
        if (item) fill(item);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'โหลดข้อมูลวัตถุดิบไม่สำเร็จ'));
  }, [editing, itemId]);

  function fill(item: Ingredient) {
    setName(item.name || ''); setSku(item.sku || ''); setCategoryId(item.category_id ? String(item.category_id) : 'none');
    setUnit(item.unit || 'กก.'); setStock(String(item.stock || 0)); setMinStock(String(item.min_stock || 0));
    setCost(String(item.cost_per_unit || 0)); setYieldPercent(String(item.yield_percent || 100)); setStorageType(item.storage_type || 'dry');
  }

  const categoryOptions = useMemo(() => [{ label: 'ไม่มีหมวด', value: 'none' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))], [categories]);

  async function save() {
    if (!name.trim() || !unit.trim()) { setError('กรอกชื่อและหน่วยให้ครบ'); return; }
    setSaving(true); setError(null); setMessage(null);
    try {
      const payload = {
        name: name.trim(), sku: sku.trim(), category_id: categoryId === 'none' ? undefined : Number(categoryId), unit: unit.trim(),
        base_unit: unit.trim(), purchase_unit_default: unit.trim(), conversion_factor_default: 1,
        stock: toFloat(stock, 0), min_stock: toFloat(minStock, 0), cost_per_unit: toFloat(cost, 0),
        yield_percent: toFloat(yieldPercent, 100), storage_type: storageType,
      };
      if (editing) await updateIngredient(itemId, payload); else await createIngredient(payload);
      router.back();
    } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกวัตถุดิบไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  async function submitAdjustment() {
    const quantity = toFloat(adjustQuantity, 0);
    if (!quantity && adjustType !== 'adjust') { setError('กรอกจำนวนที่ต้องการปรับ'); return; }
    setSaving(true); setError(null); setMessage(null);
    try {
      const next = await adjustStock(itemId, { type: adjustType, quantity, note: adjustNote.trim() });
      setStock(String(next.stock)); setAdjustQuantity(''); setAdjustNote(''); setMessage('ปรับสต็อกแล้ว');
      const response = await listTransactions(itemId); setTransactions(response.transactions || []);
    } catch (err) { setError(err instanceof Error ? err.message : 'ปรับสต็อกไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true); setError(null);
    try { await deleteIngredient(itemId); router.back(); }
    catch (err) { setError(err instanceof Error ? err.message : 'ลบวัตถุดิบไม่สำเร็จ'); setSaving(false); }
  }

  return (
    <AppScreen title={editing ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบ'} subtitle="ข้อมูลต้นทุนและระดับสต็อกจะใช้ในรายงานร้าน" topLevel={false}>
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}
      <Surface>
        <SectionHeader title="ข้อมูลวัตถุดิบ" />
        <TextField label="ชื่อวัตถุดิบ" value={name} onChangeText={setName} />
        <TextField label="SKU (ไม่บังคับ)" value={sku} onChangeText={setSku} />
        <ChipGroup label="หมวด" value={categoryId} options={categoryOptions} onChange={setCategoryId} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 140 }}><TextField label="หน่วย" value={unit} onChangeText={setUnit} /></View>
          <View style={{ flex: 1, minWidth: 140 }}><TextField label="ต้นทุนต่อหน่วย" value={cost} keyboardType="decimal-pad" onChangeText={setCost} /></View>
          <View style={{ flex: 1, minWidth: 140 }}><TextField label="สต็อกเริ่มต้น" value={stock} keyboardType="decimal-pad" onChangeText={setStock} /></View>
          <View style={{ flex: 1, minWidth: 140 }}><TextField label="จุดเตือนขั้นต่ำ" value={minStock} keyboardType="decimal-pad" onChangeText={setMinStock} /></View>
          <View style={{ flex: 1, minWidth: 140 }}><TextField label="Yield %" value={yieldPercent} keyboardType="decimal-pad" onChangeText={setYieldPercent} /></View>
        </View>
        <ChipGroup label="การจัดเก็บ" value={storageType} onChange={setStorageType} options={[{ label: 'แห้ง', value: 'dry' }, { label: 'แช่เย็น', value: 'chilled' }, { label: 'แช่แข็ง', value: 'frozen' }]} />
        <Button label={editing ? 'บันทึกการเปลี่ยนแปลง' : 'เพิ่มวัตถุดิบ'} onPress={save} loading={saving} />
      </Surface>

      {editing ? (
        <Surface>
          <SectionHeader title="ปรับสต็อก" detail={`คงเหลือปัจจุบัน ${stock} ${unit}`} />
          <ChipGroup value={adjustType} onChange={setAdjustType} options={[{ label: 'รับเข้า', value: 'in' }, { label: 'เบิกออก', value: 'out' }, { label: 'ตั้งยอด', value: 'adjust' }]} />
          <TextField label={adjustType === 'adjust' ? 'ยอดคงเหลือใหม่' : 'จำนวน'} value={adjustQuantity} keyboardType="decimal-pad" onChangeText={setAdjustQuantity} />
          <TextField label="หมายเหตุ" value={adjustNote} onChangeText={setAdjustNote} multiline />
          <Button label="ยืนยันการปรับสต็อก" onPress={submitAdjustment} loading={saving} />
        </Surface>
      ) : null}

      {editing && transactions.length ? (
        <Surface>
          <SectionHeader title="ประวัติสต็อก" detail={`${transactions.length} รายการล่าสุด`} />
          {transactions.slice(0, 20).map((item, index) => (
            <View key={item.ID}>
              {index ? <Divider /> : null}
              <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{item.type === 'in' ? 'รับเข้า' : item.type === 'out' ? 'เบิกออก' : 'ตั้งยอด'}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.note || 'ไม่มีหมายเหตุ'}</Text></View>
                <Text selectable style={typeScale.number}>{item.quantity.toLocaleString()} {unit}</Text>
              </View>
            </View>
          ))}
        </Surface>
      ) : null}

      {editing ? (
        <Surface style={{ borderColor: confirmDelete ? palette.danger : palette.border }}>
          <SectionHeader title="ลบวัตถุดิบ" detail={confirmDelete ? 'แตะยืนยันอีกครั้ง ข้อมูลสต็อกของรายการนี้จะถูกลบ' : 'ใช้เมื่อรายการนี้ไม่ควรอยู่ในคลังอีกต่อไป'} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {confirmDelete ? <Button variant="secondary" label="ยกเลิก" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} /> : null}
            <Button variant="danger" label={confirmDelete ? 'ยืนยันลบวัตถุดิบ' : 'ลบวัตถุดิบ'} onPress={remove} loading={saving} style={{ flex: 1 }} />
          </View>
        </Surface>
      ) : null}
    </AppScreen>
  );
}
