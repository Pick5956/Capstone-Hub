import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { listCategories, listMenuItems } from '@/src/api/menu';
import { cancelOrder, closeEmptyTable, deleteOrderItem, getOrder, sendOrderToKitchen, updateOrderItem, updateOrderItemStatus } from '@/src/api/order';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, EmptyState, Feedback, SectionHeader, StatusBadge, Surface, TextField } from '@/src/components/ui';
import { itemStatusLabel, money, orderStatusLabel } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Category, MenuItem } from '@/src/types/menu';
import type { Order, OrderItem } from '@/src/types/order';

function itemTone(status: OrderItem['status']) {
  if (status === 'ready') return 'success' as const;
  if (status === 'cooking' || status === 'pending') return 'warning' as const;
  if (status === 'cancelled') return 'danger' as const;
  return 'neutral' as const;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const { activeMembership } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmEmptyClose, setConfirmEmptyClose] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const canTakeOrder = can(activeMembership, 'take_order');
  const canPay = can(activeMembership, 'take_payment');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [orderResponse, menuResponse, categoryResponse] = await Promise.all([getOrder(orderId), listMenuItems(), listCategories()]);
      setOrder(orderResponse); setMenuItems((menuResponse.menu_items || []).filter((item) => item.is_available)); setCategories(categoryResponse.categories || []);
    } catch (err) { setError(err instanceof Error ? err.message : 'โหลดออเดอร์ไม่สำเร็จ'); }
    finally { if (!quiet) setLoading(false); }
  }, [orderId]);
  useFocusEffect(useCallback(() => { load(); const timer = setInterval(() => load(true), 10000); return () => clearInterval(timer); }, [load]));

  const pending = useMemo(() => (order?.items || []).filter((item) => item.status === 'pending'), [order]);
  const ready = useMemo(() => (order?.items || []).filter((item) => item.status === 'ready'), [order]);
  const filteredMenu = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const categoryMatch = categoryId === 'all' || item.category_id === Number(categoryId) || item.categories?.some((link) => link.category_id === Number(categoryId));
      return categoryMatch && (!keyword || [item.name, item.description].some((value) => String(value || '').toLowerCase().includes(keyword)));
    });
  }, [categoryId, menuItems, search]);
  const locked = order?.status === 'completed' || order?.status === 'cancelled';

  async function mutate(action: () => Promise<Order>, success?: string) {
    setSubmitting(true); setError(null); setMessage(null);
    try { setOrder(await action()); if (success) setMessage(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ'); }
    finally { setSubmitting(false); }
  }

  async function changeQuantity(item: OrderItem, delta: number) {
    const quantity = item.quantity + delta;
    if (quantity <= 0) { await mutate(() => deleteOrderItem(orderId, item.ID), 'ลบรายการแล้ว'); return; }
    await mutate(() => updateOrderItem(orderId, item.ID, { quantity, note: item.note }));
  }

  async function serveAll() {
    setSubmitting(true); setError(null);
    try {
      let next: Order | null = null;
      for (const item of ready) next = await updateOrderItemStatus(orderId, item.ID, 'served');
      if (next) setOrder(next); setMessage('บันทึกว่าเสิร์ฟครบแล้ว');
    } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกการเสิร์ฟไม่สำเร็จ'); }
    finally { setSubmitting(false); }
  }

  async function closeEmpty() {
    if (!confirmEmptyClose) { setConfirmEmptyClose(true); return; }
    await mutate(() => closeEmptyTable(orderId));
    router.replace('/tables');
  }

  async function cancelCurrentOrder() {
    if (!cancelReason.trim()) { setError('กรอกเหตุผลที่ยกเลิกออเดอร์'); return; }
    if (!confirmCancel) { setConfirmCancel(true); return; }
    await mutate(() => cancelOrder(orderId, cancelReason.trim()), 'ยกเลิกออเดอร์แล้ว');
    setConfirmCancel(false);
  }

  const primaryAction = pending.length && canTakeOrder
    ? <Button label={`ส่งเข้าครัว ${pending.length} รายการ`} onPress={() => mutate(() => sendOrderToKitchen(orderId), 'ส่งรายการเข้าครัวแล้ว')} loading={submitting} />
    : ready.length
      ? <Button label="บันทึกว่าเสิร์ฟครบแล้ว" onPress={serveAll} loading={submitting} />
      : order?.status === 'served' || order?.payment_status === 'paid'
        ? <Button label={order.payment_status === 'paid' ? 'ดูใบเสร็จ' : 'ออกบิล / รับเงิน'} onPress={() => router.push({ pathname: '/order/bill' as never, params: { id: String(orderId) } } as never)} />
        : null;

  return (
    <AppScreen
      title={order?.table?.display_label || (order?.order_type === 'takeaway' ? 'ซื้อกลับบ้าน' : `ออเดอร์ #${orderId}`)}
      subtitle={order ? `${order.order_number} · ${orderStatusLabel(order.status)} · ${money(order.grand_total)}` : 'กำลังโหลดออเดอร์'}
      topLevel={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      action={order ? <StatusBadge label={order.payment_status === 'paid' ? 'ชำระแล้ว' : orderStatusLabel(order.status)} tone={order.payment_status === 'paid' ? 'success' : order.status === 'ready' ? 'success' : order.status === 'cooking' ? 'warning' : 'neutral'} /> : undefined}
    >
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}

      {order ? (
        <>
          <Surface>
            <SectionHeader title="รายการในออเดอร์" detail={`${order.items?.length || 0} รายการ · ยอดรวม ${money(order.grand_total)}`} action={canPay && (order.status === 'served' || order.payment_status === 'paid') ? <Button compact variant="secondary" label="บิล / รับเงิน" onPress={() => router.push({ pathname: '/order/bill' as never, params: { id: String(orderId) } } as never)} /> : undefined} />
            {(order.items || []).map((item, index) => (
              <View key={item.ID}>
                {index ? <Divider /> : null}
                <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                    <View style={{ minWidth: 0, flex: 1, gap: 3 }}>
                      <Text selectable style={typeScale.cardTitle}>{item.menu_name}</Text>
                      {item.selected_options?.length ? <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.selected_options.map((option) => `${option.group_name}: ${option.option_name}`).join(' · ')}</Text> : null}
                      {item.note ? <Text selectable style={[typeScale.caption, { color: palette.muted }]}>หมายเหตุ: {item.note}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: spacing.xs }}><Text selectable style={typeScale.number}>{money(item.subtotal)}</Text><StatusBadge label={itemStatusLabel(item.status)} tone={itemTone(item.status)} /></View>
                  </View>
                  {item.status === 'pending' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Button compact variant="secondary" label="−" onPress={() => changeQuantity(item, -1)} disabled={submitting} style={{ width: 44 }} />
                      <Text selectable style={[typeScale.number, { minWidth: 34, textAlign: 'center' }]}>{item.quantity}</Text>
                      <Button compact variant="secondary" label="+" onPress={() => changeQuantity(item, 1)} disabled={submitting} style={{ width: 44 }} />
                    </View>
                  ) : null}
                  {item.status === 'ready' ? <Button compact variant="secondary" label="เสิร์ฟรายการนี้" onPress={() => mutate(() => updateOrderItemStatus(orderId, item.ID, 'served'), 'บันทึกว่าเสิร์ฟแล้ว')} disabled={submitting} /> : null}
                </View>
              </View>
            ))}
            {!order.items?.length ? <EmptyState title="ยังไม่มีรายการอาหาร" detail="เลือกเมนูด้านล่างเพื่อเริ่มออเดอร์" /> : null}
          </Surface>

          {!locked && canTakeOrder ? (
            <View style={{ gap: spacing.md }}>
              <SectionHeader title="เพิ่มเมนู" detail="แตะเมนูเพื่อเลือกตัวเลือก จำนวน และหมายเหตุในหน้าเต็ม" />
              <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาเมนู" placeholderTextColor={palette.placeholder} style={inputStyles.input} />
              <ChipGroup value={categoryId} onChange={setCategoryId} options={[{ label: 'ทั้งหมด', value: 'all' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {filteredMenu.map((item) => (
                  <Pressable key={item.ID} onPress={() => router.push({ pathname: '/order/item' as never, params: { id: String(orderId), menuId: String(item.ID) } } as never)} style={({ pressed }) => ({ minWidth: 148, minHeight: 112, flexGrow: 1, flexBasis: 160, gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: pressed ? 0.74 : 1 })}>
                    <Text selectable numberOfLines={2} style={typeScale.cardTitle}>{item.name}</Text>
                    <View style={{ flex: 1 }} />
                    <Text selectable style={typeScale.number}>{money(item.price)}</Text>
                  </Pressable>
                ))}
              </View>
              {!filteredMenu.length ? <EmptyState title="ไม่พบเมนู" detail="ลองเปลี่ยนหมวดหรือคำค้น" /> : null}
            </View>
          ) : null}

          {primaryAction ? <Surface><SectionHeader title="ขั้นตอนถัดไป" detail="ระบบแสดงเพียงงานหลักที่ควรทำกับออเดอร์นี้" />{primaryAction}</Surface> : null}

          {!order.items?.length && !locked ? (
            <Surface style={{ borderColor: confirmEmptyClose ? palette.danger : palette.border }}>
              <SectionHeader title="ปิดโต๊ะที่เปิดผิด" detail={confirmEmptyClose ? 'แตะยืนยันอีกครั้งเพื่อคืนโต๊ะเป็นว่าง' : 'ใช้ได้เมื่อออเดอร์ยังไม่มีรายการอาหาร'} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmEmptyClose ? <Button variant="secondary" label="ยกเลิก" onPress={() => setConfirmEmptyClose(false)} style={{ flex: 1 }} /> : null}<Button variant={confirmEmptyClose ? 'danger' : 'secondary'} label={confirmEmptyClose ? 'ยืนยันปิดโต๊ะ' : 'ปิดโต๊ะว่าง'} onPress={closeEmpty} loading={submitting} style={{ flex: 1 }} /></View>
            </Surface>
          ) : null}

          {!locked && order.payment_status !== 'paid' && order.items?.length ? (
            <Surface style={{ borderColor: confirmCancel ? palette.danger : palette.border }}>
              <SectionHeader title="ยกเลิกออเดอร์" detail={confirmCancel ? 'ตรวจเหตุผล แล้วแตะยืนยันอีกครั้ง' : 'ใช้เมื่อไม่สามารถทำหรือส่งมอบออเดอร์นี้ได้'} />
              <TextField label="เหตุผลที่ยกเลิก" value={cancelReason} onChangeText={(value) => { setCancelReason(value); setConfirmCancel(false); }} multiline />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmCancel ? <Button variant="secondary" label="กลับไปทำออเดอร์ต่อ" onPress={() => setConfirmCancel(false)} style={{ flex: 1 }} /> : null}<Button variant={confirmCancel ? 'danger' : 'secondary'} label={confirmCancel ? 'ยืนยันยกเลิกออเดอร์' : 'ยกเลิกออเดอร์'} onPress={cancelCurrentOrder} loading={submitting} style={{ flex: 1 }} /></View>
            </Surface>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}
