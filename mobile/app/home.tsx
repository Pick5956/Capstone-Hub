import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';

import { listOrders } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { AppScreen } from '@/src/components/app-shell';
import { Button, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money, orderStatusLabel } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { getWorkModeCopy } from '@/src/lib/work-mode';
import { useAuth } from '@/src/providers/auth-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';
import type { RestaurantTable } from '@/src/types/table';

const activeStatuses = new Set(['open', 'sent_to_kitchen', 'cooking', 'ready', 'served']);

export default function HomeScreen() {
  const { activeMembership } = useAuth();
  const { width } = useWindowDimensions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workMode = getWorkModeCopy(activeMembership);
  const restaurant = activeMembership?.restaurant;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [orderResponse, tableResponse] = await Promise.all([listOrders(), listTables()]);
      setOrders(orderResponse.orders || []);
      setTables(tableResponse.tables || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดภาพรวมร้านไม่สำเร็จ');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [load]));

  const activeOrders = useMemo(() => orders.filter((order) => activeStatuses.has(order.status)), [orders]);
  const readyCount = useMemo(() => activeOrders.reduce((sum, order) => sum + (order.items || []).filter((item) => item.status === 'ready').reduce((itemSum, item) => itemSum + item.quantity, 0), 0), [activeOrders]);
  const kitchenCount = useMemo(() => activeOrders.reduce((sum, order) => sum + (order.items || []).filter((item) => item.status === 'pending' || item.status === 'cooking').length, 0), [activeOrders]);
  const paidRevenue = useMemo(() => orders.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + Number(order.grand_total || 0), 0), [orders]);
  const compactStats = width < 390;

  const priority = readyCount > 0
    ? { title: `มีอาหารพร้อมเสิร์ฟ ${readyCount} รายการ`, detail: 'เปิดออเดอร์เพื่อส่งอาหารถึงโต๊ะ', label: 'ดูออเดอร์', href: '/orders' as const, tone: 'success' as const }
    : kitchenCount > 0
      ? { title: `ครัวกำลังทำ ${kitchenCount} รายการ`, detail: 'ติดตามคิวและอัปเดตอาหารที่ทำเสร็จ', label: 'เปิดคิวครัว', href: '/kitchen' as const, tone: 'warning' as const }
      : { title: 'ร้านพร้อมรับออเดอร์', detail: 'เริ่มจากเลือกโต๊ะว่างหรือเปิดออเดอร์เดิม', label: 'เลือกโต๊ะ', href: '/tables' as const, tone: 'info' as const };

  return (
    <AppScreen
      title={restaurant?.name || 'ภาพรวมร้าน'}
      subtitle={`${restaurant?.branch_name || 'สาขาหลัก'} · ${workMode.title}`}
      topLevel
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      action={<StatusBadge label={error ? 'ต้องตรวจสอบ' : 'อัปเดตอัตโนมัติ'} tone={error ? 'danger' : 'success'} />}
    >
      {error ? <Feedback title="อัปเดตข้อมูลไม่ได้" detail={error} tone="danger" /> : null}

      <Surface style={{ backgroundColor: priority.tone === 'success' ? palette.successSoft : priority.tone === 'warning' ? palette.warningSoft : palette.infoSoft }}>
        <SectionHeader title={priority.title} detail={priority.detail} action={<Button compact label={priority.label} onPress={() => router.push(priority.href)} />} />
      </Surface>

      <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
        <View style={{ flexDirection: compactStats ? 'column' : 'row' }}>
          {[
            { value: String(activeOrders.length), label: 'ออเดอร์ที่เปิด' },
            { value: `${activeOrders.length}/${tables.length}`, label: 'โต๊ะใช้งาน' },
            { value: String(readyCount), label: 'พร้อมเสิร์ฟ' },
            { value: money(paidRevenue), label: 'ยอดรับเงิน' },
          ].map((item, index) => (
            <View key={item.label} style={{ minHeight: 82, flex: 1, justifyContent: 'center', gap: spacing.xs, borderLeftWidth: !compactStats && index ? 1 : 0, borderTopWidth: compactStats && index ? 1 : 0, borderColor: palette.border, paddingHorizontal: spacing.lg }}>
              <Text selectable numberOfLines={1} adjustsFontSizeToFit style={[typeScale.number, { fontSize: 19 }]}>{item.value}</Text>
              <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      </Surface>

      <Surface>
        <SectionHeader title="งานระหว่างกะ" detail={workMode.hint} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {(can(activeMembership, 'take_order') || can(activeMembership, 'view_tables')) ? <Button label="รับออเดอร์" onPress={() => router.push('/tables')} style={{ flexGrow: 1 }} /> : null}
          {can(activeMembership, 'view_orders') ? <Button variant="secondary" label="ดูออเดอร์" onPress={() => router.push('/orders')} style={{ flexGrow: 1 }} /> : null}
          {(can(activeMembership, 'view_kitchen') || can(activeMembership, 'update_order_status')) ? <Button variant="secondary" label="เปิดคิวครัว" onPress={() => router.push('/kitchen')} style={{ flexGrow: 1 }} /> : null}
        </View>
      </Surface>

      <View style={{ gap: spacing.md }}>
        <SectionHeader title="ออเดอร์ล่าสุด" detail="รายการที่ต้องติดตามต่อในกะนี้" />
        {activeOrders.length ? activeOrders.slice(0, 6).map((order) => (
          <Pressable
            key={order.ID}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: pressed ? 0.78 : 1 })}
          >
            <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
              <Text selectable numberOfLines={1} style={typeScale.cardTitle}>{order.table?.display_label || order.order_number}</Text>
              <Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{order.order_number} · {orderStatusLabel(order.status)}</Text>
            </View>
            <Text selectable style={typeScale.number}>{money(order.grand_total)}</Text>
          </Pressable>
        )) : !loading ? <EmptyState title="ยังไม่มีออเดอร์ระหว่างกะ" detail="เมื่อเปิดโต๊ะ รายการที่ต้องติดตามจะอยู่ตรงนี้" /> : null}
      </View>
    </AppScreen>
  );
}
