import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import {
  listOrders,
  type OrderListResponse,
} from '@/src/api/order';
import { AppText as Text } from '@/src/components/app-text';
import { AppRefreshControl, AppScreen } from '@/src/components/app-shell';
import { usePrimaryTabSceneStatus } from '@/src/components/primary-tabs-runtime';
import {
  Button,
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
import { canReprintReceipt } from '@/src/lib/order-workflow';
import { orderListAccess, orderListRequest } from '@/src/lib/permission-parity';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';


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
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
    setPagination(undefined);
  }, [access]);

  const load = useCallback(async (page = 1, append = false) => {
    const requestId = ++requestIdRef.current;
    const request = orderListRequest(access, {
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
      const response = await listOrders(request);
      if (requestId !== requestIdRef.current) return;
      setOrders((current) => append
        ? mergeOrderPages(current, response.orders || [])
        : response.orders || []);
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
  }, [access, copy, debouncedSearch]);

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

  const totalCount = pagination?.total ?? orders.length;
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;

  if (access === 'denied') {
    return <AppScreen title={copy('ออเดอร์', 'Orders')} topLevel><EmptyState title={copy('ไม่มีสิทธิ์ดูออเดอร์', 'No permission to view orders')} detail={copy('ต้องมีสิทธิ์รับออเดอร์หรือดูออเดอร์ย้อนหลัง', 'The take_order or view_orders permission is required.')} /></AppScreen>;
  }

  return (
    <AppScreen
      title={copy('คลังออเดอร์', 'Order archive')}
      subtitle={copy(
        `บันทึกออเดอร์ที่ชำระแล้ว · ${totalCount.toLocaleString('th-TH')} ออเดอร์`,
        `A record of paid orders · ${totalCount.toLocaleString('en-US')} orders`,
      )}
      topLevel
      refreshControl={<AppRefreshControl onRefresh={() => load()} />}
    >
      {error ? <Feedback title={copy('โหลดคลังออเดอร์ไม่ได้', 'Could not load the order archive')} detail={error} tone="danger" /> : null}
      <SearchField
        accessibilityLabel={copy('ค้นหาคลังออเดอร์', 'Search the order archive')}
        clearLabel={copy('ล้างคำค้นหา', 'Clear search')}
        value={search}
        onChangeText={setSearch}
        placeholder={copy('ค้นหาเลขออเดอร์ โต๊ะ โซน หรือลูกค้า', 'Search order, table, zone, or customer')}
      />

      <View style={{ gap: spacing.md }}>
        {tabletWorkspace ? (
          <SectionHeader
            title={copy('รายการออเดอร์', 'Orders')}
            detail={copy(
              `${orders.length.toLocaleString('th-TH')}${pagination?.total && pagination.total > orders.length ? ` จาก ${pagination.total.toLocaleString('th-TH')}` : ''} รายการ`,
              `${orders.length.toLocaleString('en-US')}${pagination?.total && pagination.total > orders.length ? ` of ${pagination.total.toLocaleString('en-US')}` : ''} orders`,
            )}
          />
        ) : (
          <EdgeSectionHeader
            title={copy('รายการออเดอร์', 'Orders')}
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
            <View
              key={order.ID}
              style={{
                // Two stable columns. flexGrow used to fight the 48.5% width and
                // stretched a lone card on the last row across the workspace.
                width: '48.5%',
                minHeight: 98,
                flexGrow: 0,
                flexBasis: 'auto',
                minWidth: 300,
                gap: spacing.sm,
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: radius.md,
                backgroundColor: palette.surface,
                paddingHorizontal: spacing.lg,
                paddingVertical: 14,
              }}
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
              <Button
                compact
                variant="secondary"
                icon="receipt-outline"
                label={canReprintReceipt(order)
                  ? copy('ดูใบเสร็จ / พิมพ์ซ้ำ', 'View / reprint receipt')
                  : copy('ดูบิล', 'View bill')}
                onPress={() => router.push({ pathname: '/order/bill' as never, params: { id: String(order.ID) } } as never)}
              />
            </View>
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
                  title={title}
                  detail={detail}
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
                      <Button
                        compact
                        variant="secondary"
                        icon="receipt-outline"
                        label={canReprintReceipt(order)
                          ? copy('ดูใบเสร็จ / พิมพ์ซ้ำ', 'View / reprint receipt')
                          : copy('ดูบิล', 'View bill')}
                        onPress={() => router.push({ pathname: '/order/bill' as never, params: { id: String(order.ID) } } as never)}
                      />
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
            title={copy('ไม่พบออเดอร์', 'No orders found')}
            detail={debouncedSearch
              ? copy('ลองเปลี่ยนคำค้นหา', 'Try another search.')
              : copy('ออเดอร์จะเข้ามาที่นี่หลังรับชำระเงินแล้ว', 'Orders arrive here once they have been paid.')}
          />
        ) : null}
      </View>
    </AppScreen>
  );
}
