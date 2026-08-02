import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { listMenuItems } from '@/src/api/menu';
import { addOrderItem, getOrder } from '@/src/api/order';
import { apiUrl } from '@/src/api/client';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { isOptionSelectionBelowMinimum } from '@/src/lib/order-workflow';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { MenuItem } from '@/src/types/menu';
import type { Order } from '@/src/types/order';

function imageUrl(value: string) { if (!value) return ''; if (value.startsWith('http')) return value; return `${apiUrl}${value.startsWith('/') ? '' : '/'}${value}`; }

export default function AddOrderItemScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
  const params = useLocalSearchParams<{ id: string; menuId: string }>();
  const orderId = Number(params.id); const menuId = Number(params.menuId);
  const validParams = Number.isInteger(orderId) && orderId > 0 && Number.isInteger(menuId) && menuId > 0;
  const [order, setOrder] = useState<Order | null>(null);
  const [menu, setMenu] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [fulfillment, setFulfillment] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!canTakeOrder || !validParams) return; Promise.all([getOrder(orderId), listMenuItems()]).then(([nextOrder, response]) => { const nextMenu = response.menu_items.find((item) => item.ID === menuId) || null; setOrder(nextOrder); setMenu(nextMenu); setFulfillment(nextOrder.order_type || 'dine_in'); setSelectedOptionIds((nextMenu?.option_groups || []).flatMap((group) => (group.options || []).filter((option) => option.is_active && option.is_default).map((option) => option.ID))); if (!nextMenu) setError(copy('ไม่พบเมนูนี้', 'Menu item not found')); }).catch((err) => setError(err instanceof Error ? err.message : copy('โหลดเมนูไม่สำเร็จ', 'Could not load this menu item'))); }, [canTakeOrder, copy, menuId, orderId, validParams]);
  const optionTotal = useMemo(() => (menu?.option_groups || []).flatMap((group) => group.options || []).filter((option) => selectedOptionIds.includes(option.ID)).reduce((sum, option) => sum + Number(option.price_delta), 0), [menu, selectedOptionIds]);
  const total = (Number(menu?.price || 0) + optionTotal) * quantity;
  const missingRequired = Boolean(menu?.option_groups?.some((group) => (
    group.is_active
    && isOptionSelectionBelowMinimum(
      group.min_select,
      (group.options || []).filter(
        (option) => option.is_active && selectedOptionIds.includes(option.ID),
      ).length,
    )
  )));

  function toggle(groupIds: number[], optionId: number, max: number) {
    setSelectedOptionIds((current) => {
      const outside = current.filter((id) => !groupIds.includes(id)); const inside = current.filter((id) => groupIds.includes(id));
      if (inside.includes(optionId)) return [...outside, ...inside.filter((id) => id !== optionId)];
      if (max <= 1) return [...outside, optionId];
      if (inside.length >= max) return current;
      return [...outside, ...inside, optionId];
    });
  }
  async function add() {
    if (!canTakeOrder || !menu?.is_available || missingRequired) return;
    setSaving(true); setError(null);
    try { await addOrderItem(orderId, { menu_id: menu.ID, quantity, note: note.trim(), selected_option_ids: selectedOptionIds, fulfillment_type: fulfillment }); router.back(); }
    catch (err) { setError(err instanceof Error ? err.message : copy('เพิ่มเมนูไม่สำเร็จ', 'Could not add this item')); }
    finally { setSaving(false); }
  }
  if (!canTakeOrder) return <AppScreen title={copy('เลือกเมนู', 'Choose menu item')} topLevel={false}><EmptyState title={copy('ไม่มีสิทธิ์รับออเดอร์', 'No order-taking permission')} detail={copy('ต้องมีสิทธิ์ take_order', 'The take_order permission is required.')} /></AppScreen>;
  if (!validParams) return <AppScreen title={copy('เลือกเมนู', 'Choose menu item')} topLevel={false}><EmptyState title={copy('ไม่พบรายการนี้', 'Item not found')} detail={copy('รหัสออเดอร์หรือเมนูไม่ถูกต้อง กรุณากลับไปเลือกใหม่', 'The order or menu ID is invalid. Go back and choose again.')} /></AppScreen>;
  return (
    <AppScreen title={menu?.name || copy('เลือกเมนู', 'Choose menu item')} subtitle={menu ? `${money(menu.price, language)} · ${order?.table?.display_label || order?.order_number || ''}` : copy('กำลังโหลด', 'Loading')} topLevel={false}>
      {error ? <Feedback title={copy('เพิ่มเมนูไม่ได้', 'Could not add this item')} detail={error} tone="danger" /> : null}
      {menu ? (
        <>
          {menu.image_url ? <Image source={{ uri: imageUrl(menu.image_url) }} resizeMode="cover" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: palette.surfaceStrong }} /> : null}
          {!menu.is_available ? <Feedback title={copy('เมนูนี้หมดชั่วคราว', 'This menu item is sold out')} detail={copy('กลับไปเลือกเมนูอื่นสำหรับออเดอร์นี้', 'Go back and choose another menu item for this order.')} tone="warning" /> : null}
          <Surface>
            <SectionHeader title={copy('รายละเอียดรายการ', 'Item details')} detail={menu.description || copy('เลือกจำนวนและรูปแบบการเสิร์ฟ', 'Choose the quantity and fulfillment type.')} />
            {order?.order_type !== 'takeaway' ? <ChipGroup label={copy('รูปแบบ', 'Fulfillment')} value={fulfillment} onChange={setFulfillment} options={[{ label: copy('ทานที่ร้าน', 'Dine-in'), value: 'dine_in' }, { label: copy('ซื้อกลับบ้าน', 'Takeaway'), value: 'takeaway' }]} /> : null}
            {(menu.option_groups || []).filter((group) => group.is_active).map((group) => {
              const options = (group.options || []).filter((option) => option.is_active); const ids = options.map((option) => option.ID); const selected = options.filter((option) => selectedOptionIds.includes(option.ID)).length; const minSelect = Math.max(0, Number(group.min_select) || 0);
              return <View key={group.ID} style={{ gap: spacing.sm }}><SectionHeader title={group.name} detail={copy(`${minSelect > 0 ? 'ต้องเลือก' : 'เลือกได้'} ${minSelect.toLocaleString('th-TH')}-${group.max_select.toLocaleString('th-TH')} · เลือกแล้ว ${selected.toLocaleString('th-TH')}`, `${minSelect > 0 ? 'Required' : 'Optional'} ${minSelect.toLocaleString('en-US')}-${group.max_select.toLocaleString('en-US')} · ${selected.toLocaleString('en-US')} selected`)} />{options.map((option) => { const active = selectedOptionIds.includes(option.ID); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: active }} key={option.ID} onPress={() => toggle(ids, option.ID, group.max_select)} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: active ? palette.primary : palette.borderStrong, borderRadius: radius.md, backgroundColor: active ? palette.primary : palette.surface, paddingHorizontal: spacing.md, opacity: pressed ? 0.76 : 1 })}><Text style={{ flex: 1, color: active ? palette.primaryText : palette.text, fontSize: 14, fontWeight: '600' }}>{option.name}</Text><Text style={{ color: active ? palette.primaryText : palette.muted, fontSize: 13, fontWeight: '700' }}>{option.price_delta ? `+${money(option.price_delta, language)}` : ''}</Text></Pressable>; })}</View>;
            })}
            {missingRequired ? <Feedback title={copy('เลือกตัวเลือกที่จำเป็นให้ครบ', 'Complete the required selections')} tone="warning" /> : null}
            <TextField label={copy('หมายเหตุถึงครัว', 'Kitchen note')} value={note} onChangeText={setNote} multiline />
          </Surface>
          <Surface>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Button compact variant="secondary" label="−" onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={{ width: 48 }} /><Text selectable style={[typeScale.number, { minWidth: 42, textAlign: 'center' }]}>{quantity.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</Text><Button compact variant="secondary" label="+" onPress={() => setQuantity((value) => Math.min(100, value + 1))} disabled={quantity >= 100} style={{ width: 48 }} /><View style={{ flex: 1 }} /><Text selectable style={[typeScale.number, { fontSize: 21 }]}>{money(total, language)}</Text></View>
            <Button label={copy('เพิ่มเข้าออเดอร์', 'Add to order')} onPress={add} loading={saving} disabled={missingRequired || !menu.is_available} />
          </Surface>
        </>
      ) : null}
    </AppScreen>
  );
}
