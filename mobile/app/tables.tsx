import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { createOrder, listOrders } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { MotionPressable, MotionView } from '@/src/components/motion';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { money, tableStatusLabel } from '@/src/lib/format';
import { colors, inputStyles, layout, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';
import type { RestaurantTable } from '@/src/types/table';

const activeOrderStatuses = ['open', 'sent_to_kitchen', 'cooking', 'ready', 'served'];

export default function TablesScreen() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [customerCount, setCustomerCount] = useState('1');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeOrderByTable = useMemo(() => {
    const map = new Map<number, Order>();
    orders
      .filter((order) => activeOrderStatuses.includes(order.status))
      .forEach((order) => map.set(order.table_id, order));
    return map;
  }, [orders]);

  const busyCount = activeOrderByTable.size;
  const groupedTables = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const groups = new Map<string, { label: string; tables: RestaurantTable[] }>();
    tables
      .filter((table) => {
        if (!keyword) return true;
        return [
          table.table_number,
          table.display_label,
          table.table_zone?.name,
          table.zone,
          ...(table.tags?.map((tag) => tag.name) ?? []),
        ].some((value) => String(value ?? '').toLowerCase().includes(keyword));
      })
      .forEach((table) => {
        const key = table.zone_id ? String(table.zone_id) : 'none';
        if (!groups.has(key)) {
          groups.set(key, { label: table.table_zone?.name || table.zone || 'ไม่มีโซน', tables: [] });
        }
        groups.get(key)?.tables.push(table);
      });
    return Array.from(groups.values());
  }, [search, tables]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tableResponse, orderResponse] = await Promise.all([listTables(), listOrders()]);
      setTables(tableResponse.tables);
      setOrders(orderResponse.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดผังโต๊ะไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleTablePress(table: RestaurantTable) {
    setNotice(null);
    setError(null);
    const activeOrder = activeOrderByTable.get(table.ID);
    if (activeOrder) {
      router.push({ pathname: '/order/[id]', params: { id: String(activeOrder.ID) } } as never);
      return;
    }
    if (table.status === 'reserved') {
      setNotice('โต๊ะนี้ถูกจองไว้ ยังเปิดออเดอร์จากหน้านี้ไม่ได้');
      return;
    }
    setSelectedTable(table);
    setCustomerCount(String(Math.max(1, Math.min(table.capacity || 1, 6))));
    setNote('');
  }

  async function confirmOpenTable() {
    if (!selectedTable) return;
    setOpeningId(selectedTable.ID);
    setError(null);
    try {
      const count = Math.max(1, Number.parseInt(customerCount || '1', 10) || 1);
      const order = await createOrder({ table_id: selectedTable.ID, customer_count: count, note: note.trim() });
      setSelectedTable(null);
      router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } } as never);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เปิดออเดอร์ไม่สำเร็จ';
      if (message.toLowerCase().includes('open order')) {
        await load();
      }
      setError(message);
    } finally {
      setOpeningId(null);
    }
  }

  function adjustCustomerCount(delta: number) {
    setCustomerCount((current) => String(Math.max(1, (Number.parseInt(current || '1', 10) || 1) + delta)));
  }

  return (
    <>
      <MobileScreen
        kicker="POS"
        title="เลือกโต๊ะ"
        subtitle={`${tables.length} โต๊ะ · ${busyCount} โต๊ะกำลังใช้งาน`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View style={layout.panel}>
          <Text selectable style={typeScale.title}>รับออเดอร์</Text>
          <Text selectable style={[typeScale.body, { color: colors.muted }]}>
            แตะโต๊ะว่างเพื่อเลือกจำนวนลูกค้าก่อนเปิดออเดอร์ หรือแตะโต๊ะที่ใช้งานเพื่อทำรายการต่อ
          </Text>
          <TextInput
            onChangeText={setSearch}
            placeholder="ค้นหาโต๊ะ"
            placeholderTextColor={colors.placeholder}
            style={inputStyles.input}
            value={search}
          />
        </View>

        {error ? <StateMessage title="เปิดโต๊ะไม่สำเร็จ" detail={error} /> : null}
        {notice ? <StateMessage title="ยังเปิดโต๊ะนี้ไม่ได้" detail={notice} /> : null}
        {!error && !loading && tables.length === 0 ? (
          <StateMessage title="ยังไม่มีโต๊ะ" detail="ไปที่หน้า ผังโต๊ะ เพื่อสร้างโต๊ะก่อนรับออเดอร์" />
        ) : null}
        {!loading && tables.length > 0 && groupedTables.length === 0 ? (
          <StateMessage title="ไม่พบโต๊ะ" detail="ลองค้นหาด้วยชื่อโต๊ะ โซน หรือ tag อื่น" />
        ) : null}

        <View style={{ gap: 18 }}>
          {groupedTables.map((group, groupIndex) => (
            <MotionView key={group.label} delay={80 + groupIndex * 40} style={{ gap: 10 }}>
              <Text selectable style={[typeScale.caption, { color: colors.muted, fontWeight: '900' }]}>{group.label}</Text>
              <View style={layout.grid}>
                {group.tables.map((table, index) => {
                  const order = activeOrderByTable.get(table.ID);
                  const busy = Boolean(order);
                  const reserved = table.status === 'reserved' && !busy;
                  const readyCount = order?.items?.reduce((sum, item) => item.status === 'ready' ? sum + item.quantity : sum, 0) || 0;
                  const statusText = readyCount
                    ? `พร้อมเสิร์ฟ ${readyCount}`
                    : busy
                      ? 'มีออเดอร์'
                      : tableStatusLabel(table.status);
                  const statusColor = readyCount
                    ? '#047857'
                    : busy
                      ? '#B45309'
                      : reserved
                        ? '#0369A1'
                        : '#047857';
                  const cardStyle = readyCount
                    ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }
                    : busy
                      ? { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }
                      : reserved
                        ? { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }
                        : undefined;

                  return (
                    <MotionPressable
                      key={table.ID}
                      delay={120 + index * 25}
                      onPress={() => handleTablePress(table)}
                      style={({ pressed }) => [
                        layout.tile,
                        { minHeight: 150 },
                        cardStyle,
                        pressed && { borderColor: colors.primary },
                        openingId === table.ID && { opacity: 0.65 },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 7 }}>
                        <View style={layout.headerRow}>
                          <Text selectable style={[typeScale.title, { flex: 1 }]}>{table.display_label || table.table_number}</Text>
                          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface }}>
                            <Text selectable style={[typeScale.caption, { color: statusColor, fontWeight: '900' }]}>
                              {statusText}
                            </Text>
                          </View>
                        </View>
                        <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                          {table.capacity} ที่นั่ง
                        </Text>
                        {table.tags?.length ? (
                          <Text selectable numberOfLines={1} style={[typeScale.caption, { color: colors.muted }]}>
                            {table.tags.map((tag) => tag.name).join(', ')}
                          </Text>
                        ) : null}
                      </View>
                      {order ? (
                        <View style={{ gap: 2 }}>
                          <Text selectable style={[typeScale.cardTitle, { fontVariant: ['tabular-nums'] }]}>
                            {order.order_number}
                          </Text>
                          <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                            {money(order.grand_total)}
                          </Text>
                        </View>
                      ) : (
                        <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                          แตะเพื่อเปิดโต๊ะ
                        </Text>
                      )}
                    </MotionPressable>
                  );
                })}
              </View>
            </MotionView>
          ))}
        </View>
      </MobileScreen>

      <Modal animationType="none" transparent visible={Boolean(selectedTable)} onRequestClose={() => setSelectedTable(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.42)', padding: 14 }}
          >
            <Pressable style={{ flex: 1 }} onPress={() => setSelectedTable(null)} />
            <Animated.View
              entering={SlideInDown.duration(220)}
              exiting={SlideOutDown.duration(160)}
              style={[layout.panel, { gap: 18 }]}
            >
              <View style={layout.headerRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text selectable style={typeScale.title}>เปิดออเดอร์</Text>
                  <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                    {selectedTable?.display_label || selectedTable?.table_number}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedTable(null)} style={layout.secondaryButton}>
                  <Text style={layout.secondaryButtonText}>ปิด</Text>
                </Pressable>
              </View>

              <View style={{ gap: 10 }}>
                <Text selectable style={inputStyles.label}>จำนวนลูกค้า</Text>
                <View style={layout.headerRow}>
                  <Pressable onPress={() => adjustCustomerCount(-1)} style={[layout.secondaryButton, { width: 54 }]}>
                    <Text style={layout.secondaryButtonText}>-</Text>
                  </Pressable>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={setCustomerCount}
                    style={[inputStyles.input, { flex: 1, textAlign: 'center', fontWeight: '900' }]}
                    value={customerCount}
                  />
                  <Pressable onPress={() => adjustCustomerCount(1)} style={[layout.secondaryButton, { width: 54 }]}>
                    <Text style={layout.secondaryButtonText}>+</Text>
                  </Pressable>
                </View>
                <View style={layout.headerRow}>
                  <Pressable onPress={() => adjustCustomerCount(5)} style={[layout.secondaryButton, { flex: 1 }]}>
                    <Text style={layout.secondaryButtonText}>+5</Text>
                  </Pressable>
                  <Pressable onPress={() => adjustCustomerCount(10)} style={[layout.secondaryButton, { flex: 1 }]}>
                    <Text style={layout.secondaryButtonText}>+10</Text>
                  </Pressable>
                </View>
              </View>

              <TextInput
                multiline
                onChangeText={setNote}
                placeholder="หมายเหตุ"
                placeholderTextColor={colors.placeholder}
                style={[inputStyles.input, { minHeight: 92, paddingTop: 12, textAlignVertical: 'top' }]}
                value={note}
              />

              <Pressable disabled={openingId === selectedTable?.ID} onPress={confirmOpenTable} style={[layout.primaryButton, openingId === selectedTable?.ID && { opacity: 0.65 }]}>
                <Text style={layout.primaryButtonText}>{openingId === selectedTable?.ID ? 'กำลังเปิดโต๊ะ...' : 'เปิดโต๊ะ'}</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
