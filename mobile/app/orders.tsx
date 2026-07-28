import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import {
  listOrders,
  type OrderListResponse,
  type OrderListStatus,
  type OrderListSummary,
} from '@/src/api/order';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import {
  Button,
  ChipGroup,
  EmptyState,
  Feedback,
  SectionHeader,
  StatusBadge,
  Surface,
} from '@/src/components/ui';
import { money, orderStatusLabel } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

type ArchiveFilter = '' | 'active' | 'completed' | 'cancelled';

const PAGE_SIZE = 25;

function mergeOrderPages(current: Order[], next: Order[]) {
  const byId = new Map(current.map((order) => [order.ID, order]));
  next.forEach((order) => byId.set(order.ID, order));
  return Array.from(byId.values());
}

export default function OrdersScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const canViewOrders = can(activeMembership, 'view_orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<ArchiveFilter>('active');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [summary, setSummary] = useState<OrderListSummary | null>(null);
  const [pagination, setPagination] = useState<OrderListResponse['pagination']>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (page = 1, append = false) => {
    const requestId = ++requestIdRef.current;
    if (!canViewOrders) {
      setLoading(false);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await listOrders({
        status: filter as OrderListStatus,
        search: debouncedSearch,
        include_summary: true,
        page,
        limit: PAGE_SIZE,
      });
      if (requestId !== requestIdRef.current) return;
      setOrders((current) => append
        ? mergeOrderPages(current, response.orders || [])
        : response.orders || []);
      setSummary(response.summary || null);
      setPagination(response.pagination);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : copy('โหลดคลังออเดอร์ไม่สำเร็จ', 'Could not load the order archive'));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [canViewOrders, copy, debouncedSearch, filter]);

  useFocusEffect(useCallback(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]));

  const totalCount = summary?.total ?? pagination?.total ?? orders.length;
  const activeCount = summary?.active ?? 0;
  const completedCount = summary?.statuses?.completed ?? 0;
  const cancelledCount = summary?.statuses?.cancelled ?? 0;

  if (!canViewOrders) {
    return <AppScreen title={copy('คลังออเดอร์', 'Order archive')} topLevel><EmptyState title={copy('ไม่มีสิทธิ์ดูออเดอร์', 'No permission to view orders')} detail={copy('ต้องมีสิทธิ์ view_orders', 'The view_orders permission is required.')} /></AppScreen>;
  }

  return (
    <AppScreen
      title={copy('คลังออเดอร์', 'Order archive')}
      subtitle={copy(`${activeCount.toLocaleString('th-TH')} กำลังดำเนินการ · ${totalCount.toLocaleString('th-TH')} ออเดอร์ทั้งหมด`, `${activeCount.toLocaleString('en-US')} active · ${totalCount.toLocaleString('en-US')} total orders`)}
      topLevel
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
    >
      {error ? <Feedback title={copy('โหลดคลังออเดอร์ไม่ได้', 'Could not load the order archive')} detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader
          title={copy('ค้นหาออเดอร์', 'Search orders')}
          detail={copy('ค้นหาด้วยเลขออเดอร์ โต๊ะ โซน ชื่อลูกค้า หรือเบอร์โทร', 'Search by order number, table, zone, customer name, or phone number.')}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={copy('ค้นหาคลังออเดอร์', 'Search the order archive')}
          placeholderTextColor={palette.placeholder}
          style={inputStyles.input}
        />
        <ChipGroup
          value={filter}
          onChange={setFilter}
          options={[
            { label: copy(`ทั้งหมด ${totalCount.toLocaleString('th-TH')}`, `All ${totalCount.toLocaleString('en-US')}`), value: '' },
            { label: copy(`กำลังดำเนินการ ${activeCount.toLocaleString('th-TH')}`, `Active ${activeCount.toLocaleString('en-US')}`), value: 'active' },
            { label: copy(`สำเร็จ ${completedCount.toLocaleString('th-TH')}`, `Completed ${completedCount.toLocaleString('en-US')}`), value: 'completed' },
            { label: copy(`ยกเลิก ${cancelledCount.toLocaleString('th-TH')}`, `Cancelled ${cancelledCount.toLocaleString('en-US')}`), value: 'cancelled' },
          ]}
        />
      </Surface>

      <View style={{ gap: spacing.md }}>
        <SectionHeader
          title={copy('รายการออเดอร์', 'Orders')}
          detail={copy(
            `${orders.length.toLocaleString('th-TH')}${pagination?.total && pagination.total > orders.length ? ` จาก ${pagination.total.toLocaleString('th-TH')}` : ''} รายการ`,
            `${orders.length.toLocaleString('en-US')}${pagination?.total && pagination.total > orders.length ? ` of ${pagination.total.toLocaleString('en-US')}` : ''} orders`,
          )}
        />
        {orders.map((order) => (
          <Pressable
            key={order.ID}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } })}
            style={({ pressed }) => ({
              gap: spacing.md,
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: radius.md,
              backgroundColor: palette.surface,
              padding: spacing.lg,
              opacity: pressed ? 0.76 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
                <Text selectable numberOfLines={1} style={typeScale.cardTitle}>
                  {order.table?.display_label
                    || (order.order_type === 'takeaway' ? copy('ซื้อกลับบ้าน', 'Takeaway') : order.order_number)}
                </Text>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                  {order.order_number} · {copy(`${(order.items?.length || 0).toLocaleString('th-TH')} รายการ`, `${(order.items?.length || 0).toLocaleString('en-US')} items`)}
                </Text>
              </View>
              <Text selectable style={[typeScale.number, { fontSize: 19 }]}>
                {money(order.grand_total, language)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <StatusBadge
                label={orderStatusLabel(order.status, language)}
                tone={order.status === 'ready'
                  ? 'success'
                  : order.status === 'cooking'
                    ? 'warning'
                    : order.status === 'cancelled'
                      ? 'danger'
                      : 'neutral'}
              />
              <StatusBadge
                label={order.payment_status === 'paid' ? copy('ชำระแล้ว', 'Paid') : copy('รอชำระ', 'Payment due')}
                tone={order.payment_status === 'paid' ? 'success' : 'warning'}
              />
            </View>
          </Pressable>
        ))}

        {pagination?.has_more ? (
          <Button
            variant="secondary"
            label={copy('โหลดออเดอร์เพิ่มเติม', 'Load more orders')}
            onPress={() => load((pagination.page || 1) + 1, true)}
            loading={loadingMore}
          />
        ) : null}

        {!loading && !orders.length ? (
          <EmptyState
            title={copy('ไม่พบออเดอร์', 'No orders found')}
            detail={debouncedSearch || filter
              ? copy('ลองเปลี่ยนตัวกรองหรือคำค้น', 'Try a different filter or search.')
              : copy('ออเดอร์ใหม่จะปรากฏเมื่อเปิดโต๊ะหรือรับรายการซื้อกลับบ้าน', 'New orders appear after opening a table or starting a takeaway order.')}
          />
        ) : null}
      </View>
    </AppScreen>
  );
}
