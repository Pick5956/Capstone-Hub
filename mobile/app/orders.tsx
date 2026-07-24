import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { listOrders } from '@/src/api/order';
import { AppScreen } from '@/src/components/app-shell';
import { ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money, orderStatusLabel } from '@/src/lib/format';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<'active' | 'paid' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const response = await listOrders(); setOrders(response.orders || []); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดออเดอร์ไม่สำเร็จ'); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return orders.filter((order) => {
      const statusMatch = filter === 'all' || (filter === 'paid' ? order.payment_status === 'paid' : order.status !== 'completed' && order.status !== 'cancelled');
      const searchMatch = !keyword || [order.order_number, order.table?.display_label, order.customer_name, order.customer_phone].some((value) => String(value || '').toLowerCase().includes(keyword));
      return statusMatch && searchMatch;
    });
  }, [filter, orders, search]);
  const openCount = orders.filter((order) => order.status !== 'completed' && order.status !== 'cancelled').length;
  const revenue = orders.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + Number(order.grand_total), 0);
  return (
    <AppScreen title="ออเดอร์" subtitle={`${openCount} กำลังเปิด · ยอดรับเงิน ${money(revenue)}`} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {error ? <Feedback title="โหลดออเดอร์ไม่ได้" detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title="ค้นหาออเดอร์" detail="ค้นหาด้วยเลขออเดอร์ โต๊ะ ชื่อลูกค้า หรือเบอร์โทร" />
        <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาออเดอร์" placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        <ChipGroup value={filter} onChange={setFilter} options={[{ label: `กำลังเปิด ${openCount}`, value: 'active' }, { label: 'ชำระแล้ว', value: 'paid' }, { label: 'ทั้งหมด', value: 'all' }]} />
      </Surface>
      <View style={{ gap: spacing.md }}>
        <SectionHeader title="รายการออเดอร์" detail={`${filtered.length} รายการ`} />
        {filtered.map((order) => (
          <Pressable key={order.ID} onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } })} style={({ pressed }) => ({ gap: spacing.md, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: pressed ? 0.76 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}><Text selectable numberOfLines={1} style={typeScale.cardTitle}>{order.table?.display_label || (order.order_type === 'takeaway' ? 'ซื้อกลับบ้าน' : order.order_number)}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{order.order_number} · {order.items?.length || 0} รายการ</Text></View>
              <Text selectable style={[typeScale.number, { fontSize: 19 }]}>{money(order.grand_total)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}><StatusBadge label={orderStatusLabel(order.status)} tone={order.status === 'ready' ? 'success' : order.status === 'cooking' ? 'warning' : order.status === 'cancelled' ? 'danger' : 'neutral'} /><StatusBadge label={order.payment_status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'} tone={order.payment_status === 'paid' ? 'success' : 'warning'} /></View>
          </Pressable>
        ))}
        {!loading && !filtered.length ? <EmptyState title="ไม่พบออเดอร์" detail={orders.length ? 'ลองเปลี่ยนตัวกรองหรือคำค้น' : 'ออเดอร์ใหม่จะปรากฏเมื่อเปิดโต๊ะหรือรับรายการซื้อกลับบ้าน'} /> : null}
      </View>
    </AppScreen>
  );
}
