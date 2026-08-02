import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { listCategories, listMenuItems } from '@/src/api/menu';
import { cancelOrder, closeEmptyTable, deleteOrderItem, getOrder, sendOrderToKitchen, updateOrderItem } from '@/src/api/order';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, EmptyState, Feedback, SectionHeader, StatusBadge, Surface, TextField } from '@/src/components/ui';
import { itemStatusLabel, money, orderStatusLabel } from '@/src/lib/format';
import { createOrderDetailRequestGuard } from '@/src/lib/order-detail-runtime';
import {
  activeOrderItems,
  canCancelOrderForRole,
  canCloseEmptyOrder,
  canOpenOrderBill,
  validateKitchenCancelReason,
} from '@/src/lib/order-workflow';
import { orderDetailLoadResources } from '@/src/lib/permission-parity';
import { createRequestGeneration } from '@/src/lib/request-generation';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Category, MenuItem } from '@/src/types/menu';
import type { Order, OrderItem } from '@/src/types/order';

function itemTone(status: OrderItem['status']) {
  if (status === 'ready' || status === 'served') return 'success' as const;
  if (status === 'cooking' || status === 'pending') return 'warning' as const;
  if (status === 'cancelled') return 'danger' as const;
  return 'neutral' as const;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const validOrderId = Number.isInteger(orderId) && orderId > 0;
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
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
  const requestGuardRef = useRef(createOrderDetailRequestGuard(createRequestGeneration()));
  const foregroundLoadRef = useRef<number | null>(null);
  const canTakeOrder = can(activeMembership, 'take_order');
  const canPay = can(activeMembership, 'take_payment');
  const canViewOrders = can(activeMembership, 'view_orders');
  const canAccessOrder = canViewOrders || canTakeOrder || canPay;

  const load = useCallback(async (quiet = false) => {
    if (!canAccessOrder || !validOrderId) {
      requestGuardRef.current.invalidateLoads();
      foregroundLoadRef.current = null;
      setLoading(false);
      return;
    }
    if (quiet && foregroundLoadRef.current !== null) return;

    const request = requestGuardRef.current.beginLoad();
    if (request === null) return;

    if (!quiet) {
      foregroundLoadRef.current = request;
      setLoading(true);
    }
    setError(null);
    try {
      const resources = orderDetailLoadResources(canTakeOrder);
      if (resources.includes('menu')) {
        const [orderResponse, menuResponse, categoryResponse] = await Promise.all([
          getOrder(orderId),
          listMenuItems(),
          listCategories(),
        ]);
        if (!requestGuardRef.current.canApplyLoad(request)) return;
        setOrder(orderResponse);
        setMenuItems(menuResponse.menu_items || []);
        setCategories(categoryResponse.categories || []);
      } else {
        const orderResponse = await getOrder(orderId);
        if (!requestGuardRef.current.canApplyLoad(request)) return;
        setOrder(orderResponse);
        setMenuItems([]);
        setCategories([]);
      }
    } catch (err) {
      if (requestGuardRef.current.canApplyLoad(request)) {
        setError(err instanceof Error ? err.message : copy('โหลดออเดอร์ไม่สำเร็จ', 'Could not load the order'));
      }
    } finally {
      if (!quiet && foregroundLoadRef.current === request) {
        foregroundLoadRef.current = null;
        setLoading(false);
      }
    }
  }, [canAccessOrder, canTakeOrder, copy, orderId, validOrderId]);
  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(() => load(true), 10000);
    return () => {
      clearInterval(timer);
      requestGuardRef.current.invalidateLoads();
      foregroundLoadRef.current = null;
    };
  }, [load]));

  const activeItems = useMemo(() => activeOrderItems(order?.items), [order?.items]);
  const pending = useMemo(() => activeItems.filter((item) => item.status === 'pending'), [activeItems]);
  const activeQuantity = useMemo(() => activeItems.reduce((sum, item) => sum + item.quantity, 0), [activeItems]);
  const filteredMenu = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const categoryMatch = categoryId === 'all' || item.category_id === Number(categoryId) || item.categories?.some((link) => link.category_id === Number(categoryId));
      return categoryMatch && (!keyword || [item.name, item.description].some((value) => String(value || '').toLowerCase().includes(keyword)));
    });
  }, [categoryId, menuItems, search]);
  const locked = order?.status === 'completed' || order?.status === 'cancelled';
  const canCloseEmpty = canTakeOrder && canCloseEmptyOrder(order);
  const canCancelCurrent = Boolean(
    canTakeOrder
    && order
    && order.payment_status !== 'paid'
    && activeItems.length
    && canCancelOrderForRole(activeMembership?.role?.name, order.status),
  );

  async function mutate(action: () => Promise<Order>, success?: string): Promise<boolean> {
    if (!requestGuardRef.current.beginMutation()) return false;

    if (foregroundLoadRef.current !== null) {
      foregroundLoadRef.current = null;
      setLoading(false);
    }
    setSubmitting(true); setError(null); setMessage(null);
    try {
      setOrder(await action());
      if (success) setMessage(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('ทำรายการไม่สำเร็จ', 'Could not complete this action'));
      return false;
    }
    finally {
      requestGuardRef.current.finishMutation();
      setSubmitting(false);
    }
  }

  async function changeQuantity(item: OrderItem, delta: number) {
    const quantity = item.quantity + delta;
    if (quantity <= 0) { await mutate(() => deleteOrderItem(orderId, item.ID), copy('ลบรายการแล้ว', 'Item removed')); return; }
    await mutate(() => updateOrderItem(orderId, item.ID, { quantity, note: item.note }));
  }

  async function closeEmpty() {
    if (!canCloseEmpty) return;
    if (!confirmEmptyClose) { setConfirmEmptyClose(true); return; }
    const closed = await mutate(() => closeEmptyTable(orderId));
    if (closed) router.replace('/tables');
  }

  async function cancelCurrentOrder() {
    if (!canCancelCurrent) return;
    const validation = validateKitchenCancelReason(cancelReason);
    if (validation.error === 'required') { setError(copy('กรอกเหตุผลที่ยกเลิกออเดอร์', 'Enter a reason for cancelling the order.')); return; }
    if (validation.error === 'too_long') { setError(copy('เหตุผลต้องไม่เกิน 500 ตัวอักษร', 'The reason must be 500 characters or fewer.')); return; }
    if (!confirmCancel) { setConfirmCancel(true); return; }
    const cancelled = await mutate(() => cancelOrder(orderId, validation.reason), copy('ยกเลิกออเดอร์แล้ว', 'Order cancelled'));
    if (cancelled) setConfirmCancel(false);
  }

  const canOpenBill = Boolean(
    order
    && canAccessOrder
    && (order.payment_status === 'paid' || canOpenOrderBill(order.items)),
  );
  const primaryAction = pending.length && canTakeOrder
    ? <Button label={copy(`ส่งเข้าครัว ${pending.length.toLocaleString('th-TH')} รายการ`, `Send ${pending.length.toLocaleString('en-US')} items to kitchen`)} onPress={() => mutate(() => sendOrderToKitchen(orderId), copy('ส่งรายการเข้าครัวแล้ว', 'Items sent to kitchen'))} loading={submitting} />
    : canOpenBill
      ? <Button label={order?.payment_status === 'paid' ? copy('ดูใบเสร็จ', 'View receipt') : canPay ? copy('ออกบิล / รับเงิน', 'Bill / Pay') : copy('ดูบิล', 'View bill')} onPress={() => router.push({ pathname: '/order/bill' as never, params: { id: String(orderId) } } as never)} />
      : null;

  if (!canAccessOrder) {
    return <AppScreen title={copy('รายละเอียดออเดอร์', 'Order details')} topLevel={false}><EmptyState title={copy('ไม่มีสิทธิ์ดูออเดอร์', 'No permission to view orders')} detail={copy('ต้องมีสิทธิ์รับออเดอร์ ดูออเดอร์ หรือรับชำระเงิน', 'The take_order, view_orders, or take_payment permission is required.')} /></AppScreen>;
  }

  if (!validOrderId) {
    return <AppScreen title={copy('รายละเอียดออเดอร์', 'Order details')} topLevel={false}><EmptyState title={copy('ไม่พบออเดอร์นี้', 'Order not found')} detail={copy('รหัสออเดอร์ไม่ถูกต้อง กรุณากลับไปเลือกรายการใหม่', 'The order ID is invalid. Go back and choose an order again.')} /></AppScreen>;
  }

  return (
    <AppScreen
      title={order?.table?.display_label || (order?.order_type === 'takeaway' ? copy('ซื้อกลับบ้าน', 'Takeaway') : copy(`ออเดอร์ #${orderId}`, `Order #${orderId}`))}
      subtitle={order ? `${order.order_number} · ${orderStatusLabel(order.status, language)} · ${money(order.grand_total, language)}` : copy('กำลังโหลดออเดอร์', 'Loading order')}
      topLevel={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      action={order ? <StatusBadge label={order.payment_status === 'paid' ? copy('ชำระแล้ว', 'Paid') : orderStatusLabel(order.status, language)} tone={order.payment_status === 'paid' ? 'success' : order.status === 'ready' ? 'success' : order.status === 'cooking' ? 'warning' : 'neutral'} /> : undefined}
    >
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Could not complete this action')} detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}

      {order ? (
        <>
          <Surface>
            <SectionHeader title={copy('รายการในออเดอร์', 'Order items')} detail={copy(`${activeQuantity.toLocaleString('th-TH')} รายการ · ยอดรวม ${money(order.grand_total, 'th')}`, `${activeQuantity.toLocaleString('en-US')} items · Total ${money(order.grand_total, 'en')}`)} />
            {activeItems.map((item, index) => (
              <View key={item.ID}>
                {index ? <Divider /> : null}
                <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                    <View style={{ minWidth: 0, flex: 1, gap: 3 }}>
                      <Text selectable style={typeScale.cardTitle}>{item.menu_name}</Text>
                      {item.selected_options?.length ? <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.selected_options.map((option) => `${option.group_name}: ${option.option_name}`).join(' · ')}</Text> : null}
                      {item.note ? <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy('หมายเหตุ', 'Note')}: {item.note}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: spacing.xs }}><Text selectable style={typeScale.number}>{money(item.subtotal, language)}</Text><StatusBadge label={itemStatusLabel(item.status, language)} tone={itemTone(item.status)} /></View>
                  </View>
                  {item.status === 'pending' && canTakeOrder ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Button compact variant="secondary" label="−" onPress={() => changeQuantity(item, -1)} disabled={submitting} style={{ width: 44 }} />
                      <Text selectable style={[typeScale.number, { minWidth: 34, textAlign: 'center' }]}>{item.quantity.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</Text>
                      <Button compact variant="secondary" label="+" onPress={() => changeQuantity(item, 1)} disabled={submitting} style={{ width: 44 }} />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
            {!activeItems.length ? <EmptyState title={copy('ยังไม่มีรายการอาหาร', 'No items yet')} detail={copy('เลือกเมนูด้านล่างเพื่อเริ่มออเดอร์', 'Choose a menu item below to start the order.')} /> : null}
          </Surface>

          {!locked && canTakeOrder ? (
            <View style={{ gap: spacing.md }}>
              <SectionHeader title={copy('เพิ่มเมนู', 'Add menu items')} detail={copy('แตะเมนูเพื่อเลือกตัวเลือก จำนวน และหมายเหตุในหน้าเต็ม', 'Tap a menu item to choose options, quantity, and notes.')} />
              <TextInput value={search} onChangeText={setSearch} placeholder={copy('ค้นหาเมนู', 'Search menu')} placeholderTextColor={palette.placeholder} style={inputStyles.input} />
              <ChipGroup value={categoryId} onChange={setCategoryId} options={[{ label: copy('ทั้งหมด', 'All'), value: 'all' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {filteredMenu.map((item) => (
                  <Pressable key={item.ID} disabled={!item.is_available} onPress={() => router.push({ pathname: '/order/item' as never, params: { id: String(orderId), menuId: String(item.ID) } } as never)} style={({ pressed }) => ({ minWidth: 148, minHeight: 112, flexGrow: 1, flexBasis: 160, gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: !item.is_available ? 0.48 : pressed ? 0.74 : 1 })}>
                    <Text selectable numberOfLines={2} style={typeScale.cardTitle}>{item.name}</Text>
                    <View style={{ flex: 1 }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text selectable style={[typeScale.number, { flex: 1 }]}>{money(item.price, language)}</Text>
                      {!item.is_available ? <StatusBadge label={copy('หมด', 'Sold out')} tone="danger" /> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
              {!filteredMenu.length ? <EmptyState title={copy('ไม่พบเมนู', 'No menu items found')} detail={copy('ลองเปลี่ยนหมวดหรือคำค้น', 'Try another category or search.')} /> : null}
            </View>
          ) : null}

          {primaryAction ? <Surface><SectionHeader title={copy('ขั้นตอนถัดไป', 'Next step')} detail={copy('ระบบแสดงเพียงงานหลักที่ควรทำกับออเดอร์นี้', 'Only the main next action for this order is shown.')} />{primaryAction}</Surface> : null}

          {canCloseEmpty ? (
            <Surface style={{ borderColor: confirmEmptyClose ? palette.danger : palette.border }}>
              <SectionHeader title={copy('ปิดโต๊ะที่เปิดผิด', 'Close mistakenly opened table')} detail={confirmEmptyClose ? copy('แตะยืนยันอีกครั้งเพื่อคืนโต๊ะเป็นว่าง', 'Confirm once more to return the table to available.') : copy('ใช้ได้เมื่อออเดอร์ยังไม่มีรายการอาหาร', 'Available only while this order has no items.')} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmEmptyClose ? <Button variant="secondary" label={copy('ยกเลิก', 'Cancel')} onPress={() => setConfirmEmptyClose(false)} style={{ flex: 1 }} /> : null}<Button variant={confirmEmptyClose ? 'danger' : 'secondary'} label={confirmEmptyClose ? copy('ยืนยันปิดโต๊ะ', 'Confirm table close') : copy('ปิดโต๊ะว่าง', 'Close empty table')} onPress={closeEmpty} loading={submitting} style={{ flex: 1 }} /></View>
            </Surface>
          ) : null}

          {canCancelCurrent ? (
            <Surface style={{ borderColor: confirmCancel ? palette.danger : palette.border }}>
              <SectionHeader title={copy('ยกเลิกออเดอร์', 'Cancel order')} detail={confirmCancel ? copy('ตรวจเหตุผล แล้วแตะยืนยันอีกครั้ง', 'Check the reason, then confirm once more.') : copy('ใช้เมื่อไม่สามารถทำหรือส่งมอบออเดอร์นี้ได้', 'Use this when the order cannot be prepared or fulfilled.')} />
              <TextField label={copy('เหตุผลที่ยกเลิก', 'Cancellation reason')} value={cancelReason} onChangeText={(value) => { setCancelReason(value); setConfirmCancel(false); }} multiline />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmCancel ? <Button variant="secondary" label={copy('กลับไปทำออเดอร์ต่อ', 'Continue order')} onPress={() => setConfirmCancel(false)} style={{ flex: 1 }} /> : null}<Button variant={confirmCancel ? 'danger' : 'secondary'} label={confirmCancel ? copy('ยืนยันยกเลิกออเดอร์', 'Confirm order cancellation') : copy('ยกเลิกออเดอร์', 'Cancel order')} onPress={cancelCurrentOrder} loading={submitting} style={{ flex: 1 }} /></View>
            </Surface>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}
