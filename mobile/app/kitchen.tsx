import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { kitchenQueue, updateOrderItemStatus } from '@/src/api/order';
import { MotionView } from '@/src/components/motion';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { itemStatusLabel, orderStatusLabel } from '@/src/lib/format';
import { colors, layout, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

export default function KitchenScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemCount = useMemo(() => orders.reduce((sum, order) => sum + (order.items || []).length, 0), [orders]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await kitchenQueue();
      setOrders(response.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดคิวครัวไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markReady(orderId: number, itemId: number) {
    setSubmittingId(itemId);
    try {
      await updateOrderItemStatus(orderId, itemId, 'ready');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <MobileScreen
      kicker="KITCHEN"
      title="ครัว"
      subtitle={`${orders.length} บิล · ${itemCount} รายการรอทำ`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <StateMessage title="มีข้อผิดพลาด" detail={error} /> : null}
      {!error && !loading && orders.length === 0 ? (
        <StateMessage title="ยังไม่มีคิวครัว" detail="รายการที่ส่งเข้าครัวจะแสดงที่นี่" />
      ) : null}

      <View style={{ gap: 12 }}>
        {orders.map((order, index) => (
          <MotionView key={order.ID} delay={90 + index * 35} style={layout.panel}>
            <View style={layout.headerRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text selectable style={typeScale.title}>
                  {order.table?.display_label || `โต๊ะ #${order.table_id}`}
                </Text>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  {order.order_number || `Order #${order.ID}`} · {orderStatusLabel(order.status)}
                </Text>
              </View>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: colors.surface,
                }}
              >
                <Text selectable style={[typeScale.caption, { color: colors.accent, fontWeight: '900' }]}>
                  {(order.items || []).length} รายการ
                </Text>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              {(order.items || []).map((item) => {
                const canReady = item.status === 'cooking' || item.status === 'pending';
                return (
                  <View key={item.ID} style={[layout.card, { alignItems: 'stretch' }]}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={layout.headerRow}>
                        <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>
                          {item.quantity}x {item.menu_name}
                        </Text>
                        <Text selectable style={[typeScale.caption, { color: colors.muted, fontWeight: '900' }]}>
                          {itemStatusLabel(item.status)}
                        </Text>
                      </View>
                      {item.note ? (
                        <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                          {item.note}
                        </Text>
                      ) : null}
                      {canReady ? (
                        <Pressable
                          disabled={submittingId === item.ID}
                          onPress={() => markReady(order.ID, item.ID)}
                          style={[layout.primaryButton, { marginTop: 4 }]}
                        >
                          <Text style={layout.primaryButtonText}>{submittingId === item.ID ? 'กำลังบันทึก...' : 'ทำเสร็จ'}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </MotionView>
        ))}
      </View>
    </MobileScreen>
  );
}
