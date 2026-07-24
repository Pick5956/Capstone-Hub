import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, Text, useWindowDimensions, View } from 'react-native';

import { kitchenQueue, updateOrderItemStatus } from '@/src/api/order';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { itemStatusLabel } from '@/src/lib/format';
import { palette, spacing, typeScale } from '@/src/theme';
import type { Order, OrderItem } from '@/src/types/order';

export default function KitchenScreen() {
  const { width } = useWindowDimensions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<'active' | 'ready'>('active');
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); setError(null); try { const response = await kitchenQueue(); setOrders(response.orders || []); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดคิวครัวไม่สำเร็จ'); } finally { if (!quiet) setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); const timer = setInterval(() => load(true), 8000); return () => clearInterval(timer); }, [load]));
  const active = useMemo(() => orders.filter((order) => (order.items || []).some((item) => item.status === 'pending' || item.status === 'cooking')), [orders]);
  const ready = useMemo(() => orders.filter((order) => (order.items || []).some((item) => item.status === 'ready')), [orders]);
  const visibleGroups = width >= 820 ? [{ title: 'กำลังทำ', orders: active, kind: 'active' as const }, { title: 'พร้อมเสิร์ฟ', orders: ready, kind: 'ready' as const }] : [{ title: filter === 'active' ? 'กำลังทำ' : 'พร้อมเสิร์ฟ', orders: filter === 'active' ? active : ready, kind: filter }];

  async function update(orderId: number, item: OrderItem, status: 'cooking' | 'ready') {
    setSubmittingId(item.ID); setError(null);
    try { await updateOrderItemStatus(orderId, item.ID, status); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'อัปเดตสถานะอาหารไม่สำเร็จ'); }
    finally { setSubmittingId(null); }
  }
  async function markAllReady(order: Order) {
    const items = (order.items || []).filter((item) => item.status === 'pending' || item.status === 'cooking');
    setSubmittingId(-order.ID); setError(null);
    try { for (const item of items) await updateOrderItemStatus(order.ID, item.ID, 'ready'); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'อัปเดตทั้งบิลไม่สำเร็จ'); }
    finally { setSubmittingId(null); }
  }
  return (
    <AppScreen title="คิวครัว" subtitle={`${active.length} บิลกำลังทำ · ${ready.length} บิลพร้อมเสิร์ฟ`} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />} action={<StatusBadge label="อัปเดตทุก 8 วินาที" tone="success" />}>
      {error ? <Feedback title="คิวครัวมีปัญหา" detail={error} tone="danger" /> : null}
      {width < 820 ? <ChipGroup value={filter} onChange={setFilter} options={[{ label: `กำลังทำ ${active.length}`, value: 'active' }, { label: `พร้อมเสิร์ฟ ${ready.length}`, value: 'ready' }]} /> : null}
      <View style={{ flexDirection: width >= 820 ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        {visibleGroups.map((group) => (
          <View key={group.kind} style={{ width: width >= 820 ? undefined : '100%', flex: width >= 820 ? 1 : undefined, gap: spacing.md }}>
            <SectionHeader title={group.title} detail={`${group.orders.length} บิล`} />
            {group.orders.map((order) => {
              const items = (order.items || []).filter((item) => group.kind === 'ready' ? item.status === 'ready' : item.status === 'pending' || item.status === 'cooking');
              return (
                <Surface key={order.ID} style={{ borderColor: group.kind === 'ready' ? '#A7F3D0' : '#FDE68A' }}>
                  <SectionHeader title={order.table?.display_label || (order.order_type === 'takeaway' ? 'ซื้อกลับบ้าน' : order.order_number)} detail={`${order.order_number} · ${items.length} รายการ`} action={group.kind === 'ready' ? <Button compact variant="secondary" label="เปิดออเดอร์" onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } })} /> : undefined} />
                  {items.map((item, index) => (
                    <View key={item.ID}>
                      {index ? <Divider /> : null}
                      <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                          <View style={{ flex: 1, gap: 3 }}><Text selectable style={typeScale.cardTitle}>{item.menu_name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>จำนวน {item.quantity}{item.note ? ` · ${item.note}` : ''}</Text>{item.selected_options?.length ? <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.selected_options.map((option) => option.option_name).join(', ')}</Text> : null}</View>
                          <StatusBadge label={itemStatusLabel(item.status)} tone={item.status === 'ready' ? 'success' : 'warning'} />
                        </View>
                        {group.kind === 'active' ? <Button compact label={item.status === 'pending' ? 'เริ่มทำ' : 'ทำเสร็จ'} onPress={() => update(order.ID, item, item.status === 'pending' ? 'cooking' : 'ready')} loading={submittingId === item.ID} /> : null}
                      </View>
                    </View>
                  ))}
                  {group.kind === 'active' && items.length > 1 ? <Button variant="secondary" label="ทำเสร็จทั้งบิล" onPress={() => markAllReady(order)} loading={submittingId === -order.ID} /> : null}
                </Surface>
              );
            })}
            {!loading && !group.orders.length ? <EmptyState title={group.kind === 'active' ? 'ไม่มีอาหารค้างในครัว' : 'ยังไม่มีอาหารพร้อมเสิร์ฟ'} detail={group.kind === 'active' ? 'รายการใหม่จะเข้าคิวอัตโนมัติเมื่อส่งออเดอร์เข้าครัว' : 'อาหารที่ทำเสร็จจะแสดงตรงนี้ให้หน้าร้านเห็น'} /> : null}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}
