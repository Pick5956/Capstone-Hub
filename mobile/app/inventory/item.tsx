import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { adjustStock, createIngredient, deleteIngredient, listIngredientCategories, listIngredients, listTransactions, updateIngredient } from '@/src/api/ingredient';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { StateMessage } from '@/src/components/mobile-screen';
import { Button, ChipGroup, Divider, EmptyState, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import {
  buildIngredientCreateInput,
  buildIngredientMetadataInput,
  ingredientUnitOptions,
  ingredientToFormValues,
  validateStockAdjustmentQuantity,
} from '@/src/lib/inventory-form';
import { inventoryItemAccess } from '@/src/lib/permission-parity';
import { can } from '@/src/lib/rbac';
import { parsePositiveRouteId } from '@/src/lib/route-id';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';
import type { Ingredient, IngredientCategory, IngredientTransaction } from '@/src/types/ingredient';

export default function InventoryItemScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routeId = parsePositiveRouteId(id);
  const itemId = routeId.kind === 'valid' ? routeId.id : null;
  const editing = routeId.kind === 'valid';
  const invalidRoute = routeId.kind === 'invalid';
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [transactions, setTransactions] = useState<IngredientTransaction[]>([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('none');
  const [imageUrl, setImageUrl] = useState('');
  const [unit, setUnit] = useState('กก.');
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [cost, setCost] = useState('0');
  const [yieldPercent, setYieldPercent] = useState('100');
  const [storageType, setStorageType] = useState('room_temp');
  const [adjustType, setAdjustType] = useState<'in' | 'out' | 'adjust'>('in');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(editing);
  const [itemExists, setItemExists] = useState<boolean | null>(editing ? null : true);
  const canViewInventory = can(activeMembership, 'view_inventory');
  const canManage = can(activeMembership, 'manage_inventory');
  const access = inventoryItemAccess(editing, canViewInventory, canManage);
  const readOnly = access === 'read';
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const screenTitle = editing
    ? canManage ? copy('แก้ไขวัตถุดิบ', 'Edit ingredient') : copy('รายละเอียดวัตถุดิบ', 'Ingredient details')
    : copy('เพิ่มวัตถุดิบ', 'Add ingredient');

  useEffect(() => {
    if (invalidRoute || access === 'denied') {
      setLoading(false);
      setItemExists(null);
      return;
    }
    setLoading(true);
    setError(null);
    setItemExists(editing ? null : true);
    Promise.all([listIngredientCategories(), listIngredients()])
      .then(async ([categoryResponse, ingredientResponse]) => {
        setCategories(categoryResponse.categories || []);
        const item = ingredientResponse.ingredients.find((current) => current.ID === itemId);
        if (editing && !item) {
          setTransactions([]);
          setItemExists(false);
          return;
        }
        if (item) fill(item);
        setItemExists(true);
        if (editing && itemId !== null) {
          const transactionResponse = await listTransactions(itemId);
          setTransactions(transactionResponse.transactions || []);
        } else {
          setTransactions([]);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : copy('โหลดข้อมูลวัตถุดิบไม่สำเร็จ', 'Could not load ingredient data.')))
      .finally(() => setLoading(false));
  }, [access, copy, editing, invalidRoute, itemId]);

  function fill(item: Ingredient) {
    const values = ingredientToFormValues(item);
    setName(values.name); setSku(values.sku); setCategoryId(values.categoryId); setImageUrl(values.imageUrl);
    setUnit(values.unit); setStock(values.stock); setMinStock(values.minStock);
    setCost(values.cost); setYieldPercent(values.yieldPercent); setStorageType(values.storageType);
  }

  const categoryOptions = useMemo(() => [{ label: copy('ไม่มีหมวด', 'Uncategorized'), value: 'none' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))], [categories, copy]);
  const unitOptions = useMemo(() => ingredientUnitOptions(unit).map((option) => ({ label: option, value: option })), [unit]);
  const categoryName = categories.find((item) => String(item.ID) === categoryId)?.name || copy('ไม่มีหมวด', 'Uncategorized');
  const storageLabel = storageType === 'dry'
    ? copy('แห้ง', 'Dry')
    : storageType === 'chilled'
      ? copy('แช่เย็น', 'Chilled')
      : storageType === 'frozen'
        ? copy('แช่แข็ง', 'Frozen')
        : copy('อุณหภูมิห้อง', 'Room temperature');
  const readOnlyRows = [
    [copy('ชื่อวัตถุดิบ', 'Ingredient name'), name || '—'],
    ['SKU', sku || '—'],
    [copy('หมวด', 'Category'), categoryName],
    [copy('สต็อกคงเหลือ', 'Stock on hand'), `${Number(stock).toLocaleString(locale)} ${unit}`],
    [copy('จุดเตือนขั้นต่ำ', 'Low-stock threshold'), `${Number(minStock).toLocaleString(locale)} ${unit}`],
    [copy('ต้นทุนต่อหน่วย', 'Cost per unit'), Number(cost).toLocaleString(locale)],
    ['Yield', `${yieldPercent}%`],
    [copy('การจัดเก็บ', 'Storage'), storageLabel],
  ];

  async function save() {
    if (!canManage || invalidRoute) return;
    if (editing && (itemId === null || itemExists !== true)) return;
    if (!name.trim() || !unit.trim()) { setError(copy('กรอกชื่อและหน่วยให้ครบ', 'Enter both an ingredient name and unit.')); return; }
    setSaving(true); setError(null); setMessage(null);
    try {
      const values = {
        name,
        sku,
        categoryId,
        imageUrl,
        unit,
        stock,
        minStock,
        cost,
        yieldPercent,
        storageType,
      };
      if (editing) {
        if (itemId === null) return;
        await updateIngredient(itemId, buildIngredientMetadataInput(values));
      } else {
        await createIngredient(buildIngredientCreateInput(values));
      }
      router.back();
    } catch (err) { setError(err instanceof Error ? err.message : copy('บันทึกวัตถุดิบไม่สำเร็จ', 'Could not save the ingredient.')); }
    finally { setSaving(false); }
  }

  async function submitAdjustment() {
    if (!canManage || itemId === null || itemExists !== true) return;
    const result = validateStockAdjustmentQuantity(adjustQuantity, adjustType);
    if (!result.ok) {
      const detail = result.reason === 'required'
        ? copy('กรอกจำนวนที่ต้องการปรับ', 'Enter the quantity to adjust.')
        : result.reason === 'positive'
          ? copy('จำนวนที่ปรับต้องมากกว่า 0', 'The adjustment quantity must be greater than zero.')
          : result.reason === 'non_negative'
            ? copy('ยอดคงเหลือใหม่ต้องไม่น้อยกว่า 0', 'The new stock balance cannot be below zero.')
            : copy('กรอกจำนวนเป็นตัวเลขที่ถูกต้อง', 'Enter a valid numeric quantity.');
      setAdjustError(detail);
      return;
    }
    const quantity = result.quantity;
    if (adjustType === 'out' && quantity > Number(stock)) {
      setAdjustError(copy(`สต็อกคงเหลือมีเพียง ${Number(stock).toLocaleString('th-TH')} ${unit}`, `Only ${Number(stock).toLocaleString('en-US')} ${unit} remains in stock.`));
      return;
    }
    setSaving(true); setError(null); setAdjustError(null); setMessage(null);
    try {
      const next = await adjustStock(itemId, { type: adjustType, quantity, note: adjustNote.trim() });
      setStock(String(next.stock)); setAdjustQuantity(''); setAdjustNote(''); setMessage(copy('ปรับสต็อกแล้ว', 'Stock updated.'));
      try {
        const response = await listTransactions(itemId);
        setTransactions(response.transactions || []);
      } catch (refreshError) {
        setError(refreshError instanceof Error
          ? copy(`ปรับสต๊อกแล้ว แต่โหลดประวัติล่าสุดไม่สำเร็จ: ${refreshError.message}`, `Stock was updated, but the latest history could not be loaded: ${refreshError.message}`)
          : copy('ปรับสต๊อกแล้ว แต่โหลดประวัติล่าสุดไม่สำเร็จ', 'Stock was updated, but the latest history could not be loaded.'));
      }
    } catch (err) { setAdjustError(err instanceof Error ? err.message : copy('ปรับสต็อกไม่สำเร็จ', 'Could not update stock.')); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!canManage || itemId === null || itemExists !== true) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true); setError(null);
    try { await deleteIngredient(itemId); router.back(); }
    catch (err) { setError(err instanceof Error ? err.message : copy('ลบวัตถุดิบไม่สำเร็จ', 'Could not delete the ingredient.')); setSaving(false); }
  }

  if (invalidRoute) {
    return (
      <AppScreen title={copy('รายละเอียดวัตถุดิบ', 'Ingredient details')} topLevel={false}>
        <EmptyState
          title={copy('ไม่พบวัตถุดิบ', 'Ingredient not found')}
          detail={copy(
            'ลิงก์วัตถุดิบนี้ไม่ถูกต้อง กรุณากลับไปเลือกรายการจากหน้าคลัง',
            'This ingredient link is invalid. Go back and choose an item from inventory.',
          )}
          action={<Button variant="secondary" label={copy('ย้อนกลับ', 'Go back')} onPress={() => router.back()} />}
        />
      </AppScreen>
    );
  }

  if (access === 'denied') {
    return <AppScreen title={screenTitle} topLevel={false}><StateMessage title={editing ? copy('ไม่มีสิทธิ์ดูวัตถุดิบ', 'Ingredient access unavailable') : copy('ไม่มีสิทธิ์เพิ่มวัตถุดิบ', 'Ingredient creation unavailable')} detail={editing ? copy('บัญชีนี้ต้องมีสิทธิ์ดูหรือจัดการคลังวัตถุดิบ', 'This account needs permission to view or manage inventory.') : copy('บัญชีนี้ต้องมีสิทธิ์จัดการคลังวัตถุดิบ', 'This account needs permission to manage inventory.')} /></AppScreen>;
  }

  if (editing && itemExists !== true) {
    const title = loading
      ? copy('กำลังโหลดวัตถุดิบ', 'Loading ingredient')
      : error
        ? copy('โหลดวัตถุดิบไม่สำเร็จ', 'Unable to load ingredient')
        : copy('ไม่พบวัตถุดิบ', 'Ingredient not found');
    const detail = loading
      ? copy('กำลังตรวจสอบข้อมูลรายการนี้', 'Checking this item now.')
      : error || copy(
        'วัตถุดิบนี้อาจถูกลบไปแล้ว กรุณากลับไปเลือกรายการจากหน้าคลัง',
        'This ingredient may have been deleted. Go back and choose an item from inventory.',
      );
    return (
      <AppScreen title={copy('รายละเอียดวัตถุดิบ', 'Ingredient details')} topLevel={false}>
        <EmptyState
          title={title}
          detail={detail}
          action={loading ? undefined : (
            <Button variant="secondary" label={copy('ย้อนกลับ', 'Go back')} onPress={() => router.back()} />
          )}
        />
      </AppScreen>
    );
  }

  const detailsPanel = readOnly ? (
    <Surface>
      <SectionHeader title={copy('ข้อมูลวัตถุดิบ', 'Ingredient details')} detail={copy('ดูอย่างเดียว', 'Read only')} />
      {readOnlyRows.map(([label, value], index) => (
        <View key={label}>
          {index ? <Divider /> : null}
          <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text selectable style={[typeScale.body, { flex: 1, color: palette.muted }]}>{label}</Text>
            <Text selectable style={[typeScale.cardTitle, { flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
          </View>
        </View>
      ))}
      {imageUrl ? (
        <>
          <Divider />
          <View style={{ gap: spacing.xs }}>
            <Text selectable style={[typeScale.body, { color: palette.muted }]}>{copy('URL รูปภาพ', 'Image URL')}</Text>
            <Text selectable style={typeScale.caption}>{imageUrl}</Text>
          </View>
        </>
      ) : null}
    </Surface>
  ) : (
    <Surface>
      <SectionHeader title={copy('ข้อมูลวัตถุดิบ', 'Ingredient details')} />
      <TextField icon="cube-outline" label={copy('ชื่อวัตถุดิบ', 'Ingredient name')} value={name} onChangeText={setName} />
      <TextField icon="barcode-outline" label={copy('SKU (ไม่บังคับ)', 'SKU (optional)')} value={sku} onChangeText={setSku} />
      <ChipGroup label={copy('หมวด', 'Category')} value={categoryId} options={categoryOptions} onChange={setCategoryId} />
      <TextField icon="image-outline" label={copy('URL รูปภาพ (ไม่บังคับ)', 'Image URL (optional)')} value={imageUrl} onChangeText={setImageUrl} />
      <ChipGroup label={copy('หน่วยสต็อก', 'Stock unit')} value={unit} options={unitOptions} onChange={setUnit} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <TextField icon="cash-outline" label={copy('ต้นทุนต่อหน่วย', 'Cost per unit')} value={cost} keyboardType="decimal-pad" onChangeText={setCost} />
        </View>
        {!editing ? (
          <View style={{ flex: 1, minWidth: 140 }}>
            <TextField icon="layers-outline" label={copy('สต็อกเริ่มต้น', 'Opening stock')} value={stock} keyboardType="decimal-pad" onChangeText={setStock} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 140 }}>
          <TextField icon="alert-circle-outline" label={copy('จุดเตือนขั้นต่ำ', 'Low-stock threshold')} value={minStock} keyboardType="decimal-pad" onChangeText={setMinStock} />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <TextField icon="analytics-outline" label="Yield %" value={yieldPercent} keyboardType="decimal-pad" onChangeText={setYieldPercent} />
        </View>
      </View>
      <ChipGroup
        label={copy('การจัดเก็บ', 'Storage')}
        value={storageType}
        onChange={setStorageType}
        options={[
          { label: copy('อุณหภูมิห้อง', 'Room temperature'), value: 'room_temp' },
          { label: copy('แห้ง', 'Dry'), value: 'dry' },
          { label: copy('แช่เย็น', 'Chilled'), value: 'chilled' },
          { label: copy('แช่แข็ง', 'Frozen'), value: 'frozen' },
        ]}
      />
      <Button icon="save-outline" label={editing ? copy('บันทึกข้อมูล', 'Save details') : copy('เพิ่มวัตถุดิบ', 'Add ingredient')} onPress={save} loading={saving} />
    </Surface>
  );

  const adjustmentPanel = editing && canManage ? (
    <Surface>
      <SectionHeader
        title={copy('ปรับสต็อก', 'Adjust stock')}
        detail={copy(`คงเหลือ ${Number(stock).toLocaleString('th-TH')} ${unit}`, `${Number(stock).toLocaleString('en-US')} ${unit} on hand`)}
      />
      <ChipGroup
        value={adjustType}
        onChange={(value) => { setAdjustType(value); setAdjustError(null); }}
        options={[
          { label: copy('รับเข้า', 'Stock in'), value: 'in' },
          { label: copy('เบิกออก', 'Stock out'), value: 'out' },
          { label: copy('ตั้งยอด', 'Set balance'), value: 'adjust' },
        ]}
      />
      <TextField
        icon={adjustType === 'in' ? 'add-circle-outline' : adjustType === 'out' ? 'remove-circle-outline' : 'sync-outline'}
        label={adjustType === 'adjust' ? copy('ยอดคงเหลือใหม่', 'New stock balance') : copy('จำนวน', 'Quantity')}
        value={adjustQuantity}
        keyboardType="decimal-pad"
        onChangeText={(value) => { setAdjustQuantity(value); setAdjustError(null); }}
        error={adjustError}
      />
      <TextField icon="document-text-outline" label={copy('หมายเหตุ', 'Note')} value={adjustNote} onChangeText={setAdjustNote} multiline />
      <Button icon="checkmark-outline" label={copy('ยืนยันปรับสต็อก', 'Confirm adjustment')} onPress={submitAdjustment} loading={saving} />
    </Surface>
  ) : null;

  const historyPanel = editing ? (
    <Surface>
      <SectionHeader
        title={copy('ประวัติสต็อก', 'Stock history')}
        detail={copy(`${transactions.length.toLocaleString('th-TH')} รายการล่าสุด`, `${transactions.length.toLocaleString('en-US')} recent entries`)}
      />
      {transactions.length ? transactions.slice(0, 20).map((item, index) => (
        <View key={item.ID}>
          {index ? <Divider /> : null}
          <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
              <Text selectable style={typeScale.cardTitle}>
                {item.type === 'in' ? copy('รับเข้า', 'Stock in') : item.type === 'out' ? copy('เบิกออก', 'Stock out') : copy('ตั้งยอด', 'Set balance')}
              </Text>
              <Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{item.note || copy('ไม่มีหมายเหตุ', 'No note')}</Text>
            </View>
            <Text selectable style={typeScale.number}>{item.quantity.toLocaleString(locale)} {unit}</Text>
          </View>
        </View>
      )) : (
        <StateMessage title={copy('ยังไม่มีประวัติสต็อก', 'No stock history yet')} detail={copy('รายการปรับสต็อกจะแสดงที่นี่', 'Stock adjustments will appear here.')} />
      )}
    </Surface>
  ) : null;

  const deletePanel = editing && canManage ? (
    <Surface style={{ borderColor: confirmDelete ? palette.danger : palette.border }}>
      <SectionHeader
        title={copy('ลบวัตถุดิบ', 'Delete ingredient')}
        detail={confirmDelete
          ? copy('แตะยืนยันอีกครั้งเพื่อลบวัตถุดิบและข้อมูลสต็อก', 'Confirm again to delete this ingredient and its stock data.')
          : copy('ใช้เมื่อรายการนี้ไม่ควรอยู่ในคลังอีกต่อไป', 'Use this only when the item should no longer exist in inventory.')}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {confirmDelete ? <Button variant="secondary" label={copy('ยกเลิก', 'Cancel')} onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} /> : null}
        <Button icon="trash-outline" variant="danger" label={confirmDelete ? copy('ยืนยันลบ', 'Confirm delete') : copy('ลบวัตถุดิบ', 'Delete ingredient')} onPress={remove} loading={saving} style={{ flex: 1 }} />
      </View>
    </Surface>
  ) : null;

  return (
    <AppScreen
      title={screenTitle}
      subtitle={readOnly ? copy('ข้อมูลและประวัติสต็อก', 'Ingredient data and stock history') : copy('ข้อมูลต้นทุน สต็อก และการจัดเก็บ', 'Cost, stock, and storage details')}
      topLevel={false}
    >
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}
      {tabletWorkspace && editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg }}>
          <View style={{ minWidth: 0, flex: 1, gap: spacing.lg }}>
            {detailsPanel}
            {deletePanel}
          </View>
          <View style={{ minWidth: 0, flex: 1, gap: spacing.lg }}>
            {adjustmentPanel}
            {historyPanel}
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          {detailsPanel}
          {adjustmentPanel}
          {historyPanel}
          {deletePanel}
        </View>
      )}
    </AppScreen>
  );
}
