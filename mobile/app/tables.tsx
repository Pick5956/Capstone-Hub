import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { createOrder, listOrders } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { tableStatusLabel } from '@/src/lib/format';
import { colors, layout, typeScale } from '@/src/theme';
import type { RestaurantTable } from '@/src/types/table';

export default function TablesScreen() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await listTables();
      setTables(response.tables);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดโต๊ะไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openTable(table: RestaurantTable) {
    setOpeningId(table.ID);
    setError(null);
    try {
      const active = await listOrders({ table_id: table.ID });
      const existing = active.orders.find((order) => order.status !== 'completed' && order.status !== 'cancelled');
      if (existing) {
        router.push({ pathname: '/order/[id]', params: { id: String(existing.ID) } });
        return;
      }

      const order = await createOrder({ table_id: table.ID, customer_count: 1 });
      router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปิดโต๊ะไม่สำเร็จ');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <MobileScreen
      kicker="TABLES"
      title="ผังโต๊ะ"
      subtitle={`${tables.length} โต๊ะ`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <StateMessage title="โหลดโต๊ะไม่ได้" detail={error} /> : null}
      {!error && !loading && tables.length === 0 ? <StateMessage title="ยังไม่มีโต๊ะ" /> : null}
      <View style={{ gap: 10 }}>
        {tables.map((table) => (
          <Pressable
            key={table.ID}
            onPress={() => openTable(table)}
            style={({ pressed }) => [
              layout.card,
              pressed && { borderColor: colors.primary },
              openingId === table.ID && { opacity: 0.65 },
            ]}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <Text selectable style={typeScale.cardTitle}>{table.display_label || table.table_number}</Text>
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                {table.table_zone?.name || table.zone || 'ไม่มีโซน'} · {table.capacity} ที่นั่ง
              </Text>
              {table.tags?.length ? (
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  {table.tags.map((tag) => tag.name).join(', ')}
                </Text>
              ) : null}
            </View>
            <Text selectable style={[typeScale.caption, { color: colors.primary, fontWeight: '900' }]}>
              {openingId === table.ID ? 'กำลังเปิด' : tableStatusLabel(table.status)}
            </Text>
          </Pressable>
        ))}
      </View>
    </MobileScreen>
  );
}
