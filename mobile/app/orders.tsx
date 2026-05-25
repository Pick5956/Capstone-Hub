import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';

import { listOrders } from '@/src/api/order';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { money, orderStatusLabel } from '@/src/lib/format';
import { colors, layout, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await listOrders();
      setOrders(response.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดออเดอร์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <MobileScreen
      kicker="ORDERS"
      title="ออเดอร์"
      subtitle={`${orders.length} ออเดอร์`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <StateMessage title="โหลดออเดอร์ไม่ได้" detail={error} /> : null}
      {!error && !loading && orders.length === 0 ? <StateMessage title="ยังไม่มีออเดอร์" /> : null}
      <View style={{ gap: 10 }}>
        {orders.map((order) => (
          <View key={order.ID} style={layout.card}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text selectable style={typeScale.cardTitle}>
                {order.order_number || `Order #${order.ID}`}
              </Text>
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                {order.table?.display_label || `โต๊ะ #${order.table_id}`} · {orderStatusLabel(order.status)}
              </Text>
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                {order.items?.length || 0} รายการ · {order.payment_status === 'paid' ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
              </Text>
            </View>
            <Text selectable style={typeScale.cardTitle}>{money(order.grand_total)}</Text>
          </View>
        ))}
      </View>
    </MobileScreen>
  );
}
