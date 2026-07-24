import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { listMenuItems } from '@/src/api/menu';
import { addOrderItem, getOrder } from '@/src/api/order';
import { apiUrl } from '@/src/api/client';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { MenuItem } from '@/src/types/menu';
import type { Order } from '@/src/types/order';

function imageUrl(value: string) { if (!value) return ''; if (value.startsWith('http')) return value; return `${apiUrl}${value.startsWith('/') ? '' : '/'}${value}`; }

export default function AddOrderItemScreen() {
  const params = useLocalSearchParams<{ id: string; menuId: string }>();
  const orderId = Number(params.id); const menuId = Number(params.menuId);
  const [order, setOrder] = useState<Order | null>(null);
  const [menu, setMenu] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [fulfillment, setFulfillment] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([getOrder(orderId), listMenuItems()]).then(([nextOrder, response]) => { const nextMenu = response.menu_items.find((item) => item.ID === menuId) || null; setOrder(nextOrder); setMenu(nextMenu); setFulfillment(nextOrder.order_type || 'dine_in'); setSelectedOptionIds((nextMenu?.option_groups || []).flatMap((group) => (group.options || []).filter((option) => option.is_active && option.is_default).map((option) => option.ID))); }).catch((err) => setError(err instanceof Error ? err.message : 'โหลดเมนูไม่สำเร็จ')); }, [menuId, orderId]);
  const optionTotal = useMemo(() => (menu?.option_groups || []).flatMap((group) => group.options || []).filter((option) => selectedOptionIds.includes(option.ID)).reduce((sum, option) => sum + Number(option.price_delta), 0), [menu, selectedOptionIds]);
  const total = (Number(menu?.price || 0) + optionTotal) * quantity;
  const missingRequired = Boolean(menu?.option_groups?.some((group) => group.is_active && group.required && (group.options || []).filter((option) => option.is_active && selectedOptionIds.includes(option.ID)).length < Math.max(1, group.min_select)));

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
    if (!menu || missingRequired) return;
    setSaving(true); setError(null);
    try { await addOrderItem(orderId, { menu_id: menu.ID, quantity, note: note.trim(), selected_option_ids: selectedOptionIds, fulfillment_type: fulfillment } as never); router.back(); }
    catch (err) { setError(err instanceof Error ? err.message : 'เพิ่มเมนูไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  return (
    <AppScreen title={menu?.name || 'เลือกเมนู'} subtitle={menu ? `${money(menu.price)} · ${order?.table?.display_label || order?.order_number || ''}` : 'กำลังโหลด'} topLevel={false}>
      {error ? <Feedback title="เพิ่มเมนูไม่ได้" detail={error} tone="danger" /> : null}
      {menu ? (
        <>
          {menu.image_url ? <Image source={{ uri: imageUrl(menu.image_url) }} resizeMode="cover" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: palette.surfaceStrong }} /> : null}
          <Surface>
            <SectionHeader title="รายละเอียดรายการ" detail={menu.description || 'เลือกจำนวนและรูปแบบการเสิร์ฟ'} />
            {order?.order_type !== 'takeaway' ? <ChipGroup label="รูปแบบ" value={fulfillment} onChange={setFulfillment} options={[{ label: 'ทานที่ร้าน', value: 'dine_in' }, { label: 'ซื้อกลับบ้าน', value: 'takeaway' }]} /> : null}
            {(menu.option_groups || []).filter((group) => group.is_active).map((group) => {
              const options = (group.options || []).filter((option) => option.is_active); const ids = options.map((option) => option.ID); const selected = options.filter((option) => selectedOptionIds.includes(option.ID)).length;
              return <View key={group.ID} style={{ gap: spacing.sm }}><SectionHeader title={group.name} detail={`${group.required ? 'ต้องเลือก' : 'เลือกได้'} ${group.min_select}-${group.max_select} · เลือกแล้ว ${selected}`} />{options.map((option) => { const active = selectedOptionIds.includes(option.ID); return <Pressable key={option.ID} onPress={() => toggle(ids, option.ID, group.max_select)} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: active ? palette.primary : palette.borderStrong, borderRadius: radius.md, backgroundColor: active ? palette.primary : palette.surface, paddingHorizontal: spacing.md, opacity: pressed ? 0.76 : 1 })}><Text style={{ flex: 1, color: active ? palette.primaryText : palette.text, fontSize: 14, fontWeight: '600' }}>{option.name}</Text><Text style={{ color: active ? palette.primaryText : palette.muted, fontSize: 13, fontWeight: '700' }}>{option.price_delta ? `+${money(option.price_delta)}` : ''}</Text></Pressable>; })}</View>;
            })}
            {missingRequired ? <Feedback title="เลือกตัวเลือกที่จำเป็นให้ครบ" tone="warning" /> : null}
            <TextField label="หมายเหตุถึงครัว" value={note} onChangeText={setNote} multiline />
          </Surface>
          <Surface>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Button compact variant="secondary" label="−" onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={{ width: 48 }} /><Text selectable style={[typeScale.number, { minWidth: 42, textAlign: 'center' }]}>{quantity}</Text><Button compact variant="secondary" label="+" onPress={() => setQuantity((value) => value + 1)} style={{ width: 48 }} /><View style={{ flex: 1 }} /><Text selectable style={[typeScale.number, { fontSize: 21 }]}>{money(total)}</Text></View>
            <Button label="เพิ่มเข้าออเดอร์" onPress={add} loading={saving} disabled={missingRequired} />
          </Surface>
        </>
      ) : null}
    </AppScreen>
  );
}
