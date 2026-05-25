import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import {
  addOrderItem,
  closeOrder,
  deleteOrderItem,
  getOrder,
  payOrder,
  sendOrderToKitchen,
  updateOrderItem,
  updateOrderItemStatus,
} from '@/src/api/order';
import { listMenuItems } from '@/src/api/menu';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { itemStatusLabel, money, orderStatusLabel } from '@/src/lib/format';
import { colors, inputStyles, layout, typeScale } from '@/src/theme';
import type { MenuItem } from '@/src/types/menu';
import type { Order, OrderItem } from '@/src/types/order';

export default function OrderDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = Number(params.id);
  const [order, setOrder] = useState<Order | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingItems = useMemo(() => (order?.items || []).filter((item) => item.status === 'pending'), [order]);
  const readyItems = useMemo(() => (order?.items || []).filter((item) => item.status === 'ready'), [order]);
  const canPay = order?.status === 'served' && order.payment_status !== 'paid';
  const canClose = order?.status === 'served' && order.payment_status === 'paid';

  const load = useCallback(async () => {
    setError(null);
    try {
      const [orderResponse, menuResponse] = await Promise.all([
        getOrder(orderId),
        listMenuItems(),
      ]);
      setOrder(orderResponse);
      setMenuItems(menuResponse.menu_items.filter((item) => item.is_available));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดออเดอร์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action: () => Promise<Order>, success?: (next: Order) => void) {
    setSubmitting(true);
    setError(null);
    try {
      const next = await action();
      setOrder(next);
      success?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  function addSelectedMenu() {
    if (!selectedMenu) return;
    const qty = Number.parseInt(quantity, 10);
    runAction(
      () => addOrderItem(orderId, { menu_id: selectedMenu.ID, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1, note }),
      () => {
        setSelectedMenu(null);
        setQuantity('1');
        setNote('');
      },
    );
  }

  function editPendingItem(item: OrderItem, delta: number) {
    const nextQty = item.quantity + delta;
    if (nextQty <= 0) {
      runAction(() => deleteOrderItem(orderId, item.ID));
      return;
    }
    runAction(() => updateOrderItem(orderId, item.ID, { quantity: nextQty, note: item.note }));
  }

  return (
    <MobileScreen
      kicker="POS"
      title={order?.table?.display_label || `Order #${orderId}`}
      subtitle={order ? `${order.order_number || `#${order.ID}`} · ${orderStatusLabel(order.status)} · ${money(order.grand_total)}` : undefined}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <StateMessage title="มีข้อผิดพลาด" detail={error} /> : null}

      {order ? (
        <>
          <View style={layout.panel}>
            <Text selectable style={typeScale.title}>รายการในออเดอร์</Text>
            {(order.items || []).length === 0 ? (
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>ยังไม่มีรายการอาหาร</Text>
            ) : null}
            {(order.items || []).map((item) => (
              <View key={item.ID} style={layout.card}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text selectable style={typeScale.cardTitle}>
                    {item.quantity}x {item.menu_name}
                  </Text>
                  <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                    {itemStatusLabel(item.status)} · {money(item.subtotal)}{item.note ? ` · ${item.note}` : ''}
                  </Text>
                </View>
                {item.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable disabled={submitting} onPress={() => editPendingItem(item, -1)} style={layout.secondaryButton}>
                      <Text style={layout.secondaryButtonText}>-</Text>
                    </Pressable>
                    <Pressable disabled={submitting} onPress={() => editPendingItem(item, 1)} style={layout.secondaryButton}>
                      <Text style={layout.secondaryButtonText}>+</Text>
                    </Pressable>
                  </View>
                ) : null}
                {item.status === 'ready' ? (
                  <Pressable disabled={submitting} onPress={() => runAction(() => updateOrderItemStatus(orderId, item.ID, 'served'))} style={layout.primaryButton}>
                    <Text style={layout.primaryButtonText}>เสิร์ฟ</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>

          <View style={layout.panel}>
            <Text selectable style={typeScale.title}>เพิ่มเมนู</Text>
            {selectedMenu ? (
              <View style={{ gap: 12 }}>
                <Text selectable style={typeScale.cardTitle}>
                  {selectedMenu.name} · {money(selectedMenu.price)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setQuantity(String(Math.max(1, Number.parseInt(quantity || '1', 10) - 1)))} style={layout.secondaryButton}>
                    <Text style={layout.secondaryButtonText}>-</Text>
                  </Pressable>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={setQuantity}
                    style={[inputStyles.input, { flex: 1, textAlign: 'center' }]}
                    value={quantity}
                  />
                  <Pressable onPress={() => setQuantity(String((Number.parseInt(quantity || '1', 10) || 1) + 1))} style={layout.secondaryButton}>
                    <Text style={layout.secondaryButtonText}>+</Text>
                  </Pressable>
                </View>
                <TextInput
                  multiline
                  onChangeText={setNote}
                  placeholder="หมายเหตุอาหาร"
                  placeholderTextColor={colors.placeholder}
                  style={[inputStyles.input, { minHeight: 76, textAlignVertical: 'top' }]}
                  value={note}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setSelectedMenu(null)} style={[layout.secondaryButton, { flex: 1 }]}>
                    <Text style={layout.secondaryButtonText}>ยกเลิก</Text>
                  </Pressable>
                  <Pressable disabled={submitting} onPress={addSelectedMenu} style={[layout.primaryButton, { flex: 2 }]}>
                    <Text style={layout.primaryButtonText}>เพิ่มเข้าออเดอร์</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {menuItems.slice(0, 40).map((item) => (
                  <Pressable key={item.ID} onPress={() => setSelectedMenu(item)} style={layout.card}>
                    <View style={{ flex: 1 }}>
                      <Text selectable style={typeScale.cardTitle}>{item.name}</Text>
                      {item.description ? (
                        <Text selectable numberOfLines={1} style={[typeScale.caption, { color: colors.muted }]}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    <Text selectable style={typeScale.cardTitle}>{money(item.price)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={layout.panel}>
            <Text selectable style={typeScale.title}>ควบคุมออเดอร์</Text>
            <Pressable
              disabled={submitting || pendingItems.length === 0}
              onPress={() => runAction(() => sendOrderToKitchen(orderId))}
              style={[layout.primaryButton, pendingItems.length === 0 && { opacity: 0.45 }]}
            >
              <Text style={layout.primaryButtonText}>ส่งเข้าครัว ({pendingItems.length})</Text>
            </Pressable>
            <Pressable
              disabled={submitting || readyItems.length === 0}
              onPress={() => {
                const ready = readyItems[0];
                if (ready) runAction(() => updateOrderItemStatus(orderId, ready.ID, 'served'));
              }}
              style={[layout.secondaryButton, readyItems.length === 0 && { opacity: 0.45 }]}
            >
              <Text style={layout.secondaryButtonText}>เสิร์ฟรายการพร้อม ({readyItems.length})</Text>
            </Pressable>
            {canPay ? (
              <>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={setReceivedAmount}
                  placeholder={`รับเงินสด ${money(order.grand_total)}`}
                  placeholderTextColor={colors.placeholder}
                  style={inputStyles.input}
                  value={receivedAmount}
                />
                <Pressable
                  disabled={submitting}
                  onPress={() => runAction(() => payOrder(orderId, { method: 'cash', received_amount: Number.parseFloat(receivedAmount) || order.grand_total }))}
                  style={layout.primaryButton}
                >
                  <Text style={layout.primaryButtonText}>รับเงินสดและปิดออเดอร์</Text>
                </Pressable>
              </>
            ) : null}
            {canClose ? (
              <Pressable disabled={submitting} onPress={() => runAction(() => closeOrder(orderId))} style={layout.primaryButton}>
                <Text style={layout.primaryButtonText}>ปิดออเดอร์</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : loading ? (
        <StateMessage title="กำลังโหลดออเดอร์" />
      ) : null}
    </MobileScreen>
  );
}
