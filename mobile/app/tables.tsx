import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { listOrders } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { AppScreen } from '@/src/components/app-shell';
import { Button, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money, tableStatusLabel } from '@/src/lib/format';
import { inputStyles, palette, radius, spacing, statusTone, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';
import type { RestaurantTable } from '@/src/types/table';

const activeOrderStatuses = ['open', 'sent_to_kitchen', 'cooking', 'ready', 'served'];

export default function TablesScreen() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tableResponse, orderResponse] = await Promise.all([listTables(), listOrders()]);
      setTables(tableResponse.tables || []); setOrders(orderResponse.orders || []);
    } catch (err) { setError(err instanceof Error ? err.message : 'โหลดผังโต๊ะไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeOrderByTable = useMemo(() => {
    const map = new Map<number, Order>();
    orders.filter((order) => activeOrderStatuses.includes(order.status) && order.table_id).forEach((order) => map.set(Number(order.table_id), order));
    return map;
  }, [orders]);
  const groups = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const map = new Map<string, { label: string; tables: RestaurantTable[] }>();
    tables.filter((table) => !keyword || [table.table_number, table.display_label, table.table_zone?.name, ...(table.tags || []).map((tag) => tag.name)].some((value) => String(value || '').toLowerCase().includes(keyword))).forEach((table) => {
      const key = String(table.zone_id || 'none');
      if (!map.has(key)) map.set(key, { label: table.table_zone?.name || table.zone || 'ไม่มีโซน', tables: [] });
      map.get(key)?.tables.push(table);
    });
    return Array.from(map.values());
  }, [search, tables]);

  function open(table: RestaurantTable) {
    setNotice(null);
    const order = activeOrderByTable.get(table.ID);
    if (order) { router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } }); return; }
    if (table.status === 'reserved') { router.push({ pathname: '/table-reservation' as never, params: { tableId: String(table.ID) } } as never); return; }
    router.push({ pathname: '/order/new' as never, params: { tableId: String(table.ID) } } as never);
  }

  return (
    <AppScreen title="รับออเดอร์" subtitle={`${tables.length} โต๊ะ · ${activeOrderByTable.size} โต๊ะกำลังใช้งาน`} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} action={<Button compact variant="secondary" label="ซื้อกลับบ้าน" onPress={() => router.push({ pathname: '/order/new' as never, params: { type: 'takeaway' } } as never)} />}>
      {error ? <Feedback title="โหลดผังโต๊ะไม่ได้" detail={error} tone="danger" /> : null}
      {notice ? <Feedback title="ยังเปิดโต๊ะนี้ไม่ได้" detail={notice} tone="warning" /> : null}
      <Surface>
        <SectionHeader title="เลือกโต๊ะ" detail="แตะโต๊ะว่างเพื่อเปิดออเดอร์ หรือแตะโต๊ะที่ใช้งานเพื่อทำรายการต่อ" />
        <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาโต๊ะ โซน หรือ tag" placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        <Button variant="secondary" label="จองโต๊ะล่วงหน้า" onPress={() => router.push('/table-reservation' as never)} />
      </Surface>
      {groups.map((group) => (
        <View key={group.label} style={{ gap: spacing.md }}>
          <SectionHeader title={group.label} detail={`${group.tables.length} โต๊ะ`} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {group.tables.map((table) => {
              const order = activeOrderByTable.get(table.ID);
              const ready = (order?.items || []).filter((item) => item.status === 'ready').reduce((sum, item) => sum + item.quantity, 0);
              const tone = ready ? 'success' : order ? 'warning' : table.status === 'reserved' ? 'info' : 'success';
              const tint = statusTone(tone);
              return (
                <Pressable key={table.ID} onPress={() => open(table)} style={({ pressed }) => ({ minWidth: 154, minHeight: 136, flexGrow: 1, flexBasis: 170, gap: spacing.sm, borderWidth: 1, borderColor: tint.borderColor, borderRadius: radius.md, backgroundColor: tint.backgroundColor, padding: spacing.lg, opacity: pressed ? 0.74 : 1 })}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                    <Text selectable numberOfLines={1} style={[typeScale.title, { flex: 1 }]}>{table.display_label || table.table_number}</Text>
                    <StatusBadge label={ready ? `พร้อม ${ready}` : order ? 'มีออเดอร์' : tableStatusLabel(table.status)} tone={tone} />
                  </View>
                  <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{table.capacity} ที่นั่ง{table.tags?.length ? ` · ${table.tags.map((tag) => tag.name).join(', ')}` : ''}</Text>
                  <View style={{ flex: 1 }} />
                  {order ? <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}><Text selectable style={[typeScale.caption, { flex: 1, color: palette.muted }]}>{order.order_number}</Text><Text selectable style={typeScale.number}>{money(order.grand_total)}</Text></View> : <Text selectable style={[typeScale.caption, { color: palette.muted }]}>แตะเพื่อเปิดออเดอร์</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {!loading && !groups.length ? <EmptyState title="ไม่พบโต๊ะ" detail={tables.length ? 'ลองเปลี่ยนคำค้น' : 'สร้างโต๊ะในหน้าจัดการโต๊ะก่อนรับออเดอร์'} action={<Button label="ไปหน้าจัดการโต๊ะ" onPress={() => router.push('/table-management')} />} /> : null}
    </AppScreen>
  );
}
