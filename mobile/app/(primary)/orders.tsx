import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import {
  listOrders,
  type OrderListResponse,
  type OrderListStatus,
  type OrderListSummary,
} from '@/src/api/order';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppRefreshControl, AppScreen } from '@/src/components/app-shell';
import { usePrimaryTabSceneStatus } from '@/src/components/primary-tabs-runtime';
import {
  Button,
  ChipGroup,
  EdgeRow,
  EdgeSection,
  EdgeSectionHeader,
  EmptyState,
  Feedback,
  SearchField,
  SectionHeader,
  StatusBadge,
} from '@/src/components/ui';
import { money, orderStatusLabel } from '@/src/lib/format';
import { orderListAccess, orderListRequest } from '@/src/lib/permission-parity';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

type ArchiveFilter = '' | 'active' | 'completed' | 'cancelled';

const PAGE_SIZE = 25;

function mergeOrderPages(current: Order[], next: Order[]) {
  const byId = new Map(current.map((order) => [order.ID, order]));
  next.forEach((order) => byId.set(order.ID, order));
  return Array.from(byId.values());
}

function formatOrderTime(value: string | null | undefined, language: 'th' | 'en') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export default function OrdersScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const canViewOrders = can(activeMembership, 'view_orders');
  const canTakeOrder = can(activeMembership, 'take_order');
  const access = orderListAccess(canViewOrders, canTakeOrder);
  const archiveMode = access === 'archive';
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
  const adjacentWarmRequestedRef = useRef(false);
  const primaryTabSceneStatus = usePrimaryTabSceneStatus();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    requestIdRef.current += 1;
    setOrders([]);
    setSummary(null);
    setPagination(undefined);
    if (access !== 'archive') {
      setSearch('');
      setDebouncedSearch('');
      setFilter('active');
    }
  }, [access]);

  const load = useCallback(async (page = 1, append = false) => {
    const requestId = ++requestIdRef.current;
    const request = orderListRequest(access, {
      status: filter,
      search: debouncedSearch,
      page,
      limit: PAGE_SIZE,
    });
    if (!request) {
      setLoading(false);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await listOrders({
        ...request,
        status: request.status as OrderListStatus,
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
  }, [access, copy, debouncedSearch, filter]);

  useEffect(() => {
    if (
      primaryTabSceneStatus !== 'adjacent' ||
      adjacentWarmRequestedRef.current
    ) return;
    adjacentWarmRequestedRef.current = true;
    void load();
  }, [load, primaryTabSceneStatus]);

  useFocusEffect(useCallback(() => {
    if (adjacentWarmRequestedRef.current) {
      adjacentWarmRequestedRef.current = false;
    } else {
      void load();
    }
    return () => {
      requestIdRef.current += 1;
      setLoading(false);
      setLoadingMore(false);
    };
  }, [load]));

  const totalCount = summary?.total ?? pagination?.total ?? orders.length;
  const activeCount = summary?.active ?? 0;
  const completedCount = summary?.statuses?.completed ?? 0;
  const cancelledCount = summary?.statuses?.cancelled ?? 0;
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;

  if (access === 'denied') {
    return <AppScreen title={copy('ออเดอร์', 'Orders')} topLevel><EmptyState title={copy('ไม่มีสิทธิ์ดูออเดอร์', 'No permission to view orders')} detail={copy('ต้องมีสิทธิ์รับออเดอร์หรือดูออเดอร์ย้อนหลัง', 'The take_order or view_orders permission is required.')} /></AppScreen>;
  }

  return (
    <AppScreen
      title={archiveMode ? copy('คลังออเดอร์', 'Order archive') : copy('ออเดอร์ที่กำลังทำ', 'Active orders')}
      subtitle={archiveMode
        ? copy(`${activeCount.toLocaleString('th-TH')} กำลังดำเนินการ · ${totalCount.toLocaleString('th-TH')} ออเดอร์ทั้งหมด`, `${activeCount.toLocaleString('en-US')} active · ${totalCount.toLocaleString('en-US')} total orders`)
        : copy(`${totalCount.toLocaleString('th-TH')} ออเดอร์ที่ยังไม่ปิด`, `${totalCount.toLocaleString('en-US')} open ${totalCount === 1 ? 'order' : 'orders'}`)}
      topLevel
      refreshControl={<AppRefreshControl onRefresh={() => load()} />}
    >
      {error ? <Feedback title={archiveMode ? copy('โหลดคลังออเดอร์ไม่ได้', 'Could not load the order archive') : copy('โหลดออเดอร์ที่กำลังทำไม่ได้', 'Could not load active orders')} detail={error} tone="danger" /> : null}
      {archiveMode ? (
        <View style={{ gap: spacing.md }}>
          <SearchField
            accessibilityLabel={copy('ค้นหาคลังออเดอร์', 'Search the order archive')}
            clearLabel={copy('ล้างคำค้นหา', 'Clear search')}
            value={search}
            onChangeText={setSearch}
            placeholder={copy('ค้นหาออเดอร์ โต๊ะ หรือลูกค้า', 'Search orders, tables, or customers')}
          />
          <ChipGroup
            scrollable
            value={filter}
            onChange={setFilter}
            options={[
              { label: copy(`ทั้งหมด ${totalCount.toLocaleString('th-TH')}`, `All ${totalCount.toLocaleString('en-US')}`), value: '' },
              { label: copy(`กำลังดำเนินการ ${activeCount.toLocaleString('th-TH')}`, `Active ${activeCount.toLocaleString('en-US')}`), value: 'active' },
              { label: copy(`สำเร็จ ${completedCount.toLocaleString('th-TH')}`, `Completed ${completedCount.toLocaleString('en-US')}`), value: 'completed' },
              { label: copy(`ยกเลิก ${cancelledCount.toLocaleString('th-TH')}`, `Cancelled ${cancelledCount.toLocaleString('en-US')}`), value: 'cancelled' },
            ]}
          />
        </View>
      ) : null}

      <View style={{ gap: spacing.md }}>
        {tabletWorkspace ? (
          <SectionHeader
            title={archiveMode ? copy('รายการออเดอร์', 'Orders') : copy('งานที่ต้องดำเนินการต่อ', 'Orders in progress')}
            detail={copy(
              `${orders.length.toLocaleString('th-TH')}${pagination?.total && pagination.total > orders.length ? ` จาก ${pagination.total.toLocaleString('th-TH')}` : ''} รายการ`,
              `${orders.length.toLocaleString('en-US')}${pagination?.total && pagination.total > orders.length ? ` of ${pagination.total.toLocaleString('en-US')}` : ''} orders`,
            )}
          />
        ) : (
          <EdgeSectionHeader
            title={archiveMode ? copy('รายการออเดอร์', 'Orders') : copy('งานที่ต้องดำเนินการต่อ', 'Orders in progress')}
            detail={copy(
              `${orders.length.toLocaleString('th-TH')}${pagination?.total && pagination.total > orders.length ? ` จาก ${pagination.total.toLocaleString('th-TH')}` : ''} รายการ`,
              `${orders.length.toLocaleString('en-US')}${pagination?.total && pagination.total > orders.length ? ` of ${pagination.total.toLocaleString('en-US')}` : ''} orders`,
            )}
          />
        )}
        {orders.length ? tabletWorkspace ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {orders.map((order) => {
            const statusTone = order.status === 'cancelled'
              ? 'danger'
              : order.status === 'ready' || order.status === 'served' || order.status === 'completed'
                ? 'success'
                : order.status === 'cooking' || order.status === 'sent_to_kitchen'
                  ? 'warning'
                  : 'neutral';
            const openedAt = formatOrderTime(order.opened_at, language);
            return (
            <Pressable
              accessibilityLabel={copy(
                `เปิด ${order.table?.display_label || order.order_number}, ${orderStatusLabel(order.status, language)}`,
                `Open ${order.table?.display_label || order.order_number}, ${orderStatusLabel(order.status, language)}`,
              )}
              accessibilityRole="button"
              key={order.ID}
              onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } })}
              style={({ pressed }) => ({
                width: '48.5%',
                minHeight: 98,
                flexGrow: 1,
                flexBasis: 340,
                gap: spacing.sm,
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: radius.md,
                backgroundColor: pressed ? palette.surfaceSubtle : palette.surface,
                paddingHorizontal: spacing.lg,
                paddingVertical: 14,
                opacity: pressed ? 0.74 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Text selectable numberOfLines={1} style={[typeScale.cardTitle, { minWidth: 0, flex: 1, color: palette.textStrong, fontSize: 16 }]}>
                  {order.table?.display_label
                    ? order.table.display_label
                    : order.order_type === 'takeaway'
                      ? copy('ซื้อกลับบ้าน', 'Takeaway')
                      : order.order_number}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text selectable numberOfLines={1} adjustsFontSizeToFit style={[typeScale.number, { fontSize: 18 }]}>{money(order.grand_total, language)}</Text>
                  <AppIcon color={palette.muted} name="chevron-forward" size={17} />
                </View>
              </View>
              <Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>
                {order.order_number}{openedAt ? ` · ${openedAt}` : ''} · {copy(`${(order.items?.length || 0).toLocaleString('th-TH')} รายการ`, `${(order.items?.length || 0).toLocaleString('en-US')} items`)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <StatusBadge label={orderStatusLabel(order.status, language)} tone={statusTone} />
                {order.status !== 'cancelled' ? (
                  <Text selectable numberOfLines={1} style={[typeScale.caption, { minWidth: 0, flex: 1, color: order.payment_status === 'paid' ? palette.success : palette.warning, fontWeight: '600' }]}>
                    {order.payment_status === 'paid' ? copy('ชำระแล้ว', 'Paid') : copy('รอชำระเงิน', 'Payment due')}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            );
          })}
        </View> : (
          <EdgeSection>
            {orders.map((order) => {
              const statusTone = order.status === 'cancelled'
                ? 'danger'
                : order.status === 'ready' || order.status === 'served' || order.status === 'completed'
                  ? 'success'
                  : order.status === 'cooking' || order.status === 'sent_to_kitchen'
                    ? 'warning'
                    : 'neutral';
              const openedAt = formatOrderTime(order.opened_at, language);
              const title = order.table?.display_label
                ? order.table.display_label
                : order.order_type === 'takeaway'
                  ? copy('ซื้อกลับบ้าน', 'Takeaway')
                  : order.order_number;
              const paymentLabel = order.status === 'cancelled'
                ? ''
                : order.payment_status === 'paid'
                  ? copy('ชำระแล้ว', 'Paid')
                  : copy('รอชำระเงิน', 'Payment due');
              const detail = `${order.order_number}${openedAt ? ` · ${openedAt}` : ''} · ${copy(`${(order.items?.length || 0).toLocaleString('th-TH')} รายการ`, `${(order.items?.length || 0).toLocaleString('en-US')} items`)}`;

              return (
                <EdgeRow
                  key={order.ID}
                  accessibilityLabel={copy(
                    `เปิด ${order.table?.display_label || order.order_number}, ${orderStatusLabel(order.status, language)}`,
                    `Open ${order.table?.display_label || order.order_number}, ${orderStatusLabel(order.status, language)}`,
                  )}
                  title={title}
                  detail={detail}
                  onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } })}
                  style={{ minHeight: 96 }}
                  trailing={(
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text selectable numberOfLines={1} adjustsFontSizeToFit style={[typeScale.number, { fontSize: 17 }]}>
                        {money(order.grand_total, language)}
                      </Text>
                      <StatusBadge label={orderStatusLabel(order.status, language)} tone={statusTone} />
                      {paymentLabel ? (
                        <Text
                          selectable
                          numberOfLines={1}
                          style={{
                            color: order.payment_status === 'paid' ? palette.success : palette.warning,
                            fontSize: 11,
                            lineHeight: 14,
                            fontWeight: '600',
                          }}
                        >
                          {paymentLabel}
                        </Text>
                      ) : null}
                    </View>
                  )}
                />
              );
            })}
          </EdgeSection>
        ) : null}

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
            title={archiveMode ? copy('ไม่พบออเดอร์', 'No orders found') : copy('ไม่มีออเดอร์ที่กำลังทำ', 'No active orders')}
            detail={archiveMode
              ? debouncedSearch || filter
                ? copy('ลองเปลี่ยนตัวกรองหรือคำค้น', 'Try a different filter or search.')
                : copy('ออเดอร์ใหม่จะปรากฏเมื่อเปิดโต๊ะหรือรับรายการซื้อกลับบ้าน', 'New orders appear after opening a table or starting a takeaway order.')
              : copy('ออเดอร์โต๊ะและซื้อกลับบ้านที่ยังไม่ปิดจะแสดงที่นี่', 'Open table and takeaway orders appear here so staff can continue them.')}
          />
        ) : null}
      </View>
    </AppScreen>
  );
}
