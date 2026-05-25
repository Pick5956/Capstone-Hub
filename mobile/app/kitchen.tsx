import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { kitchenQueue, updateOrderItemStatus } from '@/src/api/order';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { itemStatusLabel, orderStatusLabel } from '@/src/lib/format';
import { colors, layout, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

export default function KitchenScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      title="คิวครัว"
      subtitle={`${orders.length} บิลในครัว`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <StateMessage title="มีข้อผิดพลาด" detail={error} /> : null}
      {!error && !loading && orders.length === 0 ? <StateMessage title="ยังไม่มีคิวครัว" /> : null}
      <View style={{ gap: 12 }}>
        {orders.map((order) => (
          <View key={order.ID} style={layout.panel}>
            <View style={layout.headerRow}>
              <View style={{ flex: 1 }}>
                <Text selectable style={typeScale.cardTitle}>
                  {order.order_number || `Order #${order.ID}`}
                </Text>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  {order.table?.display_label || `โต๊ะ #${order.table_id}`} · {orderStatusLabel(order.status)}
                </Text>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              {(order.items || []).map((item) => (
                <View key={item.ID} style={layout.card}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text selectable style={typeScale.cardTitle}>
                      {item.quantity}x {item.menu_name}
                    </Text>
                    <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                      {itemStatusLabel(item.status)}{item.note ? ` · ${item.note}` : ''}
                    </Text>
                  </View>
                  {item.status === 'cooking' || item.status === 'pending' ? (
                    <Pressable
                      disabled={submittingId === item.ID}
                      onPress={() => markReady(order.ID, item.ID)}
                      style={layout.primaryButton}
                    >
                      <Text style={layout.primaryButtonText}>{submittingId === item.ID ? '...' : 'พร้อม'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </MobileScreen>
  );
}
