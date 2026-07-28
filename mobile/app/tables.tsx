import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { listOrders } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import { Button, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money, tableStatusLabel } from '@/src/lib/format';
import { tableEntryAction } from '@/src/lib/table-workflow';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { inputStyles, palette, radius, spacing, statusTone, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';
import type { RestaurantTable } from '@/src/types/table';

const activeOrderStatuses = ['open', 'sent_to_kitchen', 'cooking', 'ready', 'served'];

export default function TablesScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
  const canManageTables = can(activeMembership, 'manage_table');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tableResponse, orderResponse] = await Promise.all([
        listTables(),
        listOrders({ status: 'active', limit: 200 }),
      ]);
      setTables(tableResponse.tables || []); setOrders(orderResponse.orders || []);
    } catch (err) { setError(err instanceof Error ? err.message : copy('โหลดผังโต๊ะไม่สำเร็จ', 'Could not load the table map')); }
    finally { setLoading(false); }
  }, [copy]);
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
      if (!map.has(key)) map.set(key, { label: table.table_zone?.name || table.zone || copy('ไม่มีโซน', 'No zone'), tables: [] });
      map.get(key)?.tables.push(table);
    });
    return Array.from(map.values());
  }, [copy, search, tables]);

  function open(table: RestaurantTable) {
    setNotice(null);
    const order = activeOrderByTable.get(table.ID);
    if (!canTakeOrder) {
      setNotice(copy('บัญชีนี้ไม่มีสิทธิ์รับออเดอร์', 'This account cannot take orders'));
      return;
    }
    const action = tableEntryAction(table.status, Boolean(order));
    if (action === 'resume' && order) { router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } }); return; }
    if (action === 'blocked') { setNotice(copy('โต๊ะนี้ปิดใช้งานอยู่ เปิดออเดอร์ไม่ได้', 'This table is inactive and cannot accept an order')); return; }
    if (action === 'reservation') { router.push({ pathname: '/table-reservation' as never, params: { tableId: String(table.ID) } } as never); return; }
    router.push({ pathname: '/order/new' as never, params: { tableId: String(table.ID) } } as never);
  }

  return (
    <AppScreen title={copy('รับออเดอร์', 'Order taking')} subtitle={copy(`${tables.length.toLocaleString('th-TH')} โต๊ะ · ${activeOrderByTable.size.toLocaleString('th-TH')} โต๊ะกำลังใช้งาน`, `${tables.length.toLocaleString('en-US')} tables · ${activeOrderByTable.size.toLocaleString('en-US')} in use`)} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} action={canTakeOrder ? <Button compact variant="secondary" label={copy('ซื้อกลับบ้าน', 'Takeaway')} onPress={() => router.push({ pathname: '/order/new' as never, params: { type: 'takeaway' } } as never)} /> : undefined}>
      {error ? <Feedback title={copy('โหลดผังโต๊ะไม่ได้', 'Could not load the table map')} detail={error} tone="danger" /> : null}
      {notice ? <Feedback title={copy('ยังเปิดโต๊ะนี้ไม่ได้', 'This table cannot be opened yet')} detail={notice} tone="warning" /> : null}
      {!canTakeOrder ? <Feedback title={copy('ไม่มีสิทธิ์รับออเดอร์', 'No order-taking permission')} detail={copy('เลือกโหมดงานอื่นที่บัญชีนี้ได้รับอนุญาตจากเมนูด้านล่าง', 'Choose another work mode allowed for this account from the menu below.')} tone="info" /> : null}
      <Surface>
        <SectionHeader title={copy('เลือกโต๊ะ', 'Choose a table')} detail={copy('แตะโต๊ะว่างเพื่อเปิดออเดอร์ หรือแตะโต๊ะที่ใช้งานเพื่อทำรายการต่อ', 'Tap an available table to open an order, or an occupied table to continue.')} />
        <TextInput value={search} onChangeText={setSearch} placeholder={copy('ค้นหาโต๊ะ โซน หรือแท็ก', 'Search tables, zones, or tags')} placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        {canTakeOrder ? <Button variant="secondary" label={copy('จองโต๊ะล่วงหน้า', 'Reserve a table')} onPress={() => router.push('/table-reservation' as never)} /> : null}
      </Surface>
      {groups.map((group) => (
        <View key={group.label} style={{ gap: spacing.md }}>
          <SectionHeader title={group.label} detail={copy(`${group.tables.length.toLocaleString('th-TH')} โต๊ะ`, `${group.tables.length.toLocaleString('en-US')} tables`)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {group.tables.map((table) => {
              const order = activeOrderByTable.get(table.ID);
              const ready = (order?.items || []).filter((item) => item.status === 'ready').reduce((sum, item) => sum + item.quantity, 0);
              const tone = ready ? 'success' : order ? 'warning' : table.status === 'reserved' ? 'info' : table.status === 'inactive' ? 'neutral' : 'success';
              const tint = statusTone(tone);
              return (
                <Pressable key={table.ID} onPress={() => open(table)} style={({ pressed }) => ({ minWidth: 154, minHeight: 136, flexGrow: 1, flexBasis: 170, gap: spacing.sm, borderWidth: 1, borderColor: tint.borderColor, borderRadius: radius.md, backgroundColor: tint.backgroundColor, padding: spacing.lg, opacity: pressed ? 0.74 : 1 })}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                    <Text selectable numberOfLines={1} style={[typeScale.title, { flex: 1 }]}>{table.display_label || table.table_number}</Text>
                    <StatusBadge label={ready ? copy(`ครัวเสร็จ ${ready.toLocaleString('th-TH')}`, `Kitchen done ${ready.toLocaleString('en-US')}`) : order ? copy('มีออเดอร์', 'Occupied') : tableStatusLabel(table.status, language)} tone={tone} />
                  </View>
                  <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy(`${table.capacity.toLocaleString('th-TH')} ที่นั่ง`, `${table.capacity.toLocaleString('en-US')} seats`)}{table.tags?.length ? ` · ${table.tags.map((tag) => tag.name).join(', ')}` : ''}</Text>
                  <View style={{ flex: 1 }} />
                  {order ? <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}><Text selectable style={[typeScale.caption, { flex: 1, color: palette.muted }]}>{order.order_number}</Text><Text selectable style={typeScale.number}>{money(order.grand_total, language)}</Text></View> : <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{table.status === 'inactive' ? copy('เปิดใช้งานจากหน้าจัดการโต๊ะ', 'Activate this table from Table management') : copy('แตะเพื่อเปิดออเดอร์', 'Tap to open an order')}</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {!loading && !groups.length ? <EmptyState title={copy('ไม่พบโต๊ะ', 'No tables found')} detail={tables.length ? copy('ลองเปลี่ยนคำค้น', 'Try a different search.') : canManageTables ? copy('สร้างโต๊ะในหน้าจัดการโต๊ะก่อนรับออเดอร์', 'Create tables in Table management before taking orders.') : copy('ร้านนี้ยังไม่มีโต๊ะที่พร้อมรับออเดอร์', 'This restaurant has no tables ready for orders yet.')} action={canManageTables ? <Button label={copy('ไปหน้าจัดการโต๊ะ', 'Open Table management')} onPress={() => router.push('/table-management')} /> : undefined} /> : null}
    </AppScreen>
  );
}
