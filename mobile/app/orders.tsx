import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { listOrders } from '@/src/api/order';
import { MotionPressable } from '@/src/components/motion';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { money, orderStatusLabel } from '@/src/lib/format';
import { colors, layout, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

function StatusPill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'paid' | 'danger' }) {
  const color = tone === 'paid' ? colors.accent : tone === 'danger' ? colors.danger : colors.muted;
  return (
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
      <Text selectable style={[typeScale.caption, { color, fontWeight: '900' }]}>{label}</Text>
    </View>
  );
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => orders.reduce((sum, order) => sum + Number(order.grand_total || 0), 0), [orders]);
  const openCount = useMemo(
    () => orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled').length,
    [orders],
  );

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
      subtitle={`${openCount} กำลังเปิด · ${orders.length} ทั้งหมด`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={layout.panel}>
        <Text selectable style={typeScale.title}>ภาพรวมออเดอร์</Text>
        <View style={layout.grid}>
          <View style={[layout.tile, { minHeight: 86 }]}>
            <Text selectable style={typeScale.cardTitle}>{openCount}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>ยังไม่ปิด</Text>
          </View>
          <View style={[layout.tile, { minHeight: 86 }]}>
            <Text selectable style={typeScale.cardTitle}>{money(total)}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>ยอดรวมรายการ</Text>
          </View>
        </View>
      </View>

      {error ? <StateMessage title="โหลดออเดอร์ไม่ได้" detail={error} /> : null}
      {!error && !loading && orders.length === 0 ? (
        <StateMessage title="ยังไม่มีออเดอร์" detail="เมื่อเปิดโต๊ะหรือรับออเดอร์ รายการจะแสดงที่นี่" />
      ) : null}

      <View style={{ gap: 10 }}>
        {orders.map((order, index) => (
          <MotionPressable
            key={order.ID}
            delay={90 + index * 35}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } } as never)}
            style={({ pressed }) => [layout.panel, pressed && { borderColor: colors.primary }]}
          >
            <View style={layout.headerRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text selectable style={typeScale.cardTitle}>
                  {order.order_number || `Order #${order.ID}`}
                </Text>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  {order.table?.display_label || `โต๊ะ #${order.table_id}`} · {order.items?.length || 0} รายการ
                </Text>
              </View>
              <Text selectable style={[typeScale.cardTitle, { fontVariant: ['tabular-nums'] }]}>{money(order.grand_total)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <StatusPill label={orderStatusLabel(order.status)} />
              <StatusPill
                label={order.payment_status === 'paid' ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
                tone={order.payment_status === 'paid' ? 'paid' : 'danger'}
              />
            </View>
          </MotionPressable>
        ))}
      </View>
    </MobileScreen>
  );
}
