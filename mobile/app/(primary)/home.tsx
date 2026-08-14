import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { listIngredients } from '@/src/api/ingredient';
import { kitchenQueue, listOrders } from '@/src/api/order';
import { getManagerReport, getTopMenuItemsByMonth } from '@/src/api/report';
import { listTables } from '@/src/api/table';
import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppRefreshControl, AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { usePrimaryTabSceneStatus } from '@/src/components/primary-tabs-runtime';
import { Button, EdgeRow, EdgeSection, EdgeSectionHeader, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import {
  buildHomeAttention,
  buildHomeOperationalMetrics,
  clampDashboardDate,
  dashboardLoadFailurePolicy,
  resolveHomePriority,
  shiftDashboardDate,
  summarizeHomeOrders,
  summarizeHomeSalesTrend,
  summarizeInventory,
  summarizeKitchenQueue,
  shouldStartDashboardLoad,
  shouldReplaceOptionalDashboardSnapshot,
  topHomeMenuItems,
  type HomeOperationalMetricKey,
  type HomePriority,
} from '@/src/lib/home-dashboard';
import { resolveHomeRestaurantIdentity } from '@/src/lib/app-shell-runtime';
import { formatBangkokDate } from '@/src/lib/order-query';
import { can } from '@/src/lib/rbac';
import { getBangkokReportMonth } from '@/src/lib/report-query';
import { getWorkModeCopy } from '@/src/lib/work-mode';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, statusTone, typeScale } from '@/src/theme';
import type { Ingredient } from '@/src/types/ingredient';
import type { Order, OrderStatus } from '@/src/types/order';
import type { ManagerReport, TopMenuItemsReport } from '@/src/types/report';
import type { RestaurantTable } from '@/src/types/table';

const activeStatuses = new Set(['open', 'sent_to_kitchen', 'cooking', 'ready', 'served']);
type Copy = (thai: string, english: string) => string;
type OptionalFailure = 'kitchen' | 'inventory';
type ReportFailure = 'trend' | 'top-menu';

function dashboardDateLabel(value: string, language: 'th' | 'en') {
  const date = new Date(`${value}T12:00:00+07:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMoney(value: number | null | undefined, language: 'th' | 'en') {
  return `฿${Number(value || 0).toLocaleString(language === 'th' ? 'th-TH' : 'en-US', {
    maximumFractionDigits: 0,
  })}`;
}

function formatSignedMoney(value: number, language: 'th' | 'en') {
  if (!value) return formatMoney(0, language);
  const sign = value > 0 ? '+' : '−';
  return `${sign}${formatMoney(Math.abs(value), language)}`;
}

function reportMonthLabel(report: TopMenuItemsReport, language: 'th' | 'en') {
  const date = new Date(Date.UTC(report.year, report.month - 1, 1, 12));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
    timeZone: 'Asia/Bangkok',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatBangkokTime(value: string | null | undefined, language: 'th' | 'en') {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-US', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function operationalMetricLabel(key: HomeOperationalMetricKey, copy: Copy) {
  const labels: Record<HomeOperationalMetricKey, [string, string]> = {
    'orders-active': ['ออเดอร์กำลังดำเนินการ', 'Active orders'],
    'tables-occupied': ['โต๊ะใช้งาน', 'Occupied tables'],
    'tables-free': ['โต๊ะว่าง', 'Free tables'],
    'tables-reserved': ['โต๊ะจอง', 'Reserved tables'],
    'kitchen-active': ['คิวครัวกำลังทำ', 'Active kitchen tickets'],
    'kitchen-ready': ['คิวพร้อมเสิร์ฟ', 'Ready to serve'],
  };
  return copy(...labels[key]);
}

function operationalMetricPresentation(key: HomeOperationalMetricKey): {
  href: '/orders' | '/tables' | '/kitchen';
  icon: AppIconName;
  tone: 'success' | 'warning' | 'info' | 'neutral';
} {
  switch (key) {
    case 'orders-active':
      return { href: '/orders', icon: 'receipt-outline', tone: 'neutral' };
    case 'tables-occupied':
      return { href: '/tables', icon: 'people-outline', tone: 'warning' };
    case 'tables-free':
      return { href: '/tables', icon: 'restaurant-outline', tone: 'success' };
    case 'tables-reserved':
      return { href: '/tables', icon: 'time-outline', tone: 'info' };
    case 'kitchen-active':
      return { href: '/kitchen', icon: 'flame-outline', tone: 'warning' };
    case 'kitchen-ready':
      return { href: '/kitchen', icon: 'checkmark-circle-outline', tone: 'success' };
  }
}

function localizedOrderStatus(status: OrderStatus, copy: Copy) {
  const labels: Record<OrderStatus, [string, string]> = {
    open: ['เปิดอยู่', 'Open'],
    sent_to_kitchen: ['ส่งเข้าครัว', 'Sent to kitchen'],
    cooking: ['กำลังทำ', 'Cooking'],
    ready: ['ครัวทำเสร็จ', 'Ready'],
    served: ['ครัวทำเสร็จ', 'Ready'],
    completed: ['ปิดแล้ว', 'Completed'],
    cancelled: ['ยกเลิก', 'Cancelled'],
  };
  return copy(...labels[status]);
}

function localizedWorkMode(
  workMode: ReturnType<typeof getWorkModeCopy>,
  copy: Copy,
) {
  const titles: Record<string, string> = {
    โหมดครัว: 'Kitchen mode',
    โหมดหน้าร้าน: 'Front-of-house mode',
    โหมดแคชเชียร์: 'Cashier mode',
    โหมดเจ้าของร้าน: 'Owner mode',
    โหมดทำงาน: 'Work mode',
  };
  return {
    title: copy(workMode.title, titles[workMode.title] || workMode.title),
  };
}

function priorityCopy(priority: HomePriority, copy: Copy) {
  switch (priority.key) {
    case 'kitchen-overdue':
      return {
        title: copy(
          `คิวครัวเกินเวลา ${priority.count} คิว`,
          `${priority.count} overdue kitchen ${priority.count === 1 ? 'ticket' : 'tickets'}`,
        ),
        detail: copy(
          'มีคิวที่รออย่างน้อย 10 นาที ควรตรวจและจัดลำดับงานทันที',
          'Some tickets have waited at least 10 minutes. Review and reprioritize them now.',
        ),
        label: copy('เปิดคิวครัว', 'Open kitchen queue'),
      };
    case 'kitchen-ready':
      return {
        title: copy(
          `อาหารพร้อมเสิร์ฟ ${priority.count} คิว`,
          `${priority.count} ${priority.count === 1 ? 'ticket' : 'tickets'} ready to serve`,
        ),
        detail: copy(
          'นำอาหารที่ทำเสร็จออกจากครัวเพื่อไม่ให้โต๊ะรอนาน',
          'Move completed dishes out of the kitchen so tables do not wait.',
        ),
        label: copy('เปิดคิวครัว', 'Open kitchen queue'),
      };
    case 'stock-out':
      return {
        title: copy(
          `วัตถุดิบหมด ${priority.count} รายการ`,
          `${priority.count} ${priority.count === 1 ? 'ingredient is' : 'ingredients are'} out of stock`,
        ),
        detail: copy(
          'ตรวจรายการที่อาจกระทบการขายและเติมสต็อก',
          'Review items that may affect sales and replenish their stock.',
        ),
        label: copy('เปิดคลัง', 'Open inventory'),
      };
    case 'stock-low':
      return {
        title: copy(
          `วัตถุดิบใกล้หมด ${priority.count} รายการ`,
          `${priority.count} low-stock ${priority.count === 1 ? 'ingredient' : 'ingredients'}`,
        ),
        detail: copy(
          'ตรวจปริมาณคงเหลือก่อนเริ่มรอบขายถัดไป',
          'Check remaining quantities before the next service period.',
        ),
        label: copy('เปิดคลัง', 'Open inventory'),
      };
    case 'kitchen-active':
      return {
        title: copy(
          `ครัวกำลังทำ ${priority.count} คิว`,
          `${priority.count} active kitchen ${priority.count === 1 ? 'ticket' : 'tickets'}`,
        ),
        detail: copy(
          'ติดตามคิวและอัปเดตอาหารที่ทำเสร็จ',
          'Track the queue and update dishes as they are completed.',
        ),
        label: copy('เปิดคิวครัว', 'Open kitchen queue'),
      };
    case 'take-order':
      return {
        title: copy('ร้านพร้อมรับออเดอร์', 'Ready to take orders'),
        detail: copy(
          'เริ่มจากเลือกโต๊ะว่างหรือเปิดออเดอร์เดิม',
          'Start by choosing an available table or opening an existing order.',
        ),
        label: copy('เลือกโต๊ะ', 'Choose table'),
      };
    case 'orders':
      return {
        title: copy('ติดตามงานระหว่างกะ', 'Track shift activity'),
        detail: copy(
          'ตรวจออเดอร์ล่าสุดและงานที่ต้องดำเนินการต่อ',
          'Review recent orders and work that needs attention.',
        ),
        label: copy('ดูออเดอร์', 'View orders'),
      };
    default:
      return {
        title: copy('ภาพรวมร้านพร้อมใช้งาน', 'Restaurant overview is ready'),
        detail: copy(
          'ยังไม่มีงานเร่งด่วนที่เปิดได้ด้วยสิทธิ์ของคุณ',
          'There is no urgent work available with your current access.',
        ),
        label: undefined,
      };
  }
}

function attentionLabel(priority: HomePriority, copy: Copy) {
  switch (priority.key) {
    case 'kitchen-overdue':
      return copy('คิวครัวเกินเวลา', 'Overdue kitchen tickets');
    case 'kitchen-ready':
      return copy('อาหารพร้อมเสิร์ฟ', 'Ready to serve');
    case 'stock-out':
      return copy('วัตถุดิบหมด', 'Out of stock');
    case 'stock-low':
      return copy('วัตถุดิบใกล้หมด', 'Low stock');
    default:
      return '';
  }
}

function priorityPresentation(priority: HomePriority): {
  backgroundColor: string;
  borderColor: string;
  color: string;
  icon: AppIconName;
} {
  if (priority.key === 'take-order') {
    return {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentMuted,
      color: palette.accent,
      icon: 'restaurant-outline',
    };
  }

  const tone = statusTone(priority.tone);
  const icons: Record<HomePriority['key'], AppIconName> = {
    'kitchen-overdue': 'timer-outline',
    'kitchen-ready': 'checkmark-circle-outline',
    'stock-out': 'alert-circle-outline',
    'stock-low': 'cube-outline',
    'kitchen-active': 'flame-outline',
    'take-order': 'restaurant-outline',
    orders: 'receipt-outline',
    overview: 'checkmark-circle-outline',
  };
  return { ...tone, icon: icons[priority.key] };
}

function orderStatusPresentation(status: OrderStatus) {
  if (status === 'completed' || status === 'ready' || status === 'served') return statusTone('success');
  if (status === 'sent_to_kitchen' || status === 'cooking') return statusTone('warning');
  if (status === 'cancelled') return statusTone('danger');
  return statusTone('info');
}

function HomeRestaurantIdentity() {
  const { activeMembership, user } = useAuth();
  const { copy } = useDisplayPreferences();
  const identity = resolveHomeRestaurantIdentity({
    restaurantName: activeMembership?.restaurant?.name,
    branchName: activeMembership?.restaurant?.branch_name,
    roleDisplayNameOverride: activeMembership?.role?.display_name_override,
    roleDisplayName: activeMembership?.role?.display_name,
    roleName: activeMembership?.role?.name,
    nickname: user?.nickname,
    firstName: user?.first_name,
    email: user?.email,
  });
  const detail = identity.detail || copy('เลือกร้าน', 'Choose restaurant');

  return (
    <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Pressable
        accessibilityLabel={copy(
          `เปลี่ยนร้าน ร้านปัจจุบัน ${identity.restaurantName} ${detail}`,
          `Change restaurant. Current restaurant: ${identity.restaurantName}, ${detail}`,
        )}
        accessibilityRole="button"
        onPress={() => router.push('/restaurants')}
        style={({ pressed }) => ({
          minWidth: 0,
          minHeight: 48,
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          opacity: pressed ? 0.68 : 1,
        })}
      >
        <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.accentSoft }}>
          <AppIcon color={palette.accent} name="storefront-outline" size={20} />
        </View>
        <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
          <Text numberOfLines={1} style={{ color: palette.textStrong, fontSize: 15, fontWeight: '800' }}>
            {identity.restaurantName}
          </Text>
          <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 12 }}>
            {detail}
          </Text>
        </View>
        <AppIcon color={palette.muted} name="chevron-down" size={17} />
      </Pressable>
      <Pressable
        accessibilityLabel={copy('เปิดบัญชีและการตั้งค่า', 'Open account and settings')}
        accessibilityRole="button"
        onPress={() => router.push('/settings')}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: palette.accentMuted,
          borderRadius: radius.full,
          backgroundColor: palette.accentSoft,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text allowFontScaling={false} style={{ color: palette.accent, fontSize: 14, fontWeight: '800' }}>
          {identity.userInitial}
        </Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const { width } = useWindowDimensions();
  const requestIdRef = useRef(0);
  const foregroundRequestIdRef = useRef<number | null>(null);
  const adjacentWarmRequestedRef = useRef(false);
  const primaryTabSceneStatus = usePrimaryTabSceneStatus();
  const [selectedDate, setSelectedDate] = useState(() => formatBangkokDate());
  const [loadedDate, setLoadedDate] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [managerReport, setManagerReport] = useState<ManagerReport | null>(null);
  const [topMenuReport, setTopMenuReport] = useState<TopMenuItemsReport | null>(null);
  const [optionalFailures, setOptionalFailures] = useState<OptionalFailure[]>([]);
  const [reportFailures, setReportFailures] = useState<ReportFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const workMode = localizedWorkMode(getWorkModeCopy(activeMembership), copy);
  const canViewDashboard = can(activeMembership, 'view_dashboard');
  const canTakeOrder = can(activeMembership, 'take_order');
  const canViewOrders = can(activeMembership, 'view_orders');
  const canViewKitchen = can(activeMembership, 'view_kitchen');
  const canViewInventory = can(activeMembership, 'view_inventory') || can(activeMembership, 'manage_inventory');
  const canViewTables = canTakeOrder || can(activeMembership, 'view_tables') || can(activeMembership, 'manage_table');
  const canViewReports = can(activeMembership, 'view_reports');
  const today = formatBangkokDate();
  const isToday = selectedDate === today;

  const load = useCallback(async (quiet = false) => {
    if (!canViewDashboard) {
      foregroundRequestIdRef.current = null;
      setLoading(false);
      return;
    }

    if (!shouldStartDashboardLoad(quiet, foregroundRequestIdRef.current !== null)) return;

    const requestId = ++requestIdRef.current;
    if (!quiet) {
      foregroundRequestIdRef.current = requestId;
      setLoading(true);
      setError(null);
    }

    try {
      const shouldLoadReports = isToday && canViewReports && !quiet;
      const orderRequest = canViewOrders
        ? listOrders({ date: selectedDate, limit: 200 })
        : Promise.resolve({ orders: [] as Order[] });
      const tableRequest = isToday && canViewTables
        ? listTables()
        : Promise.resolve({ tables: [] as RestaurantTable[] });
      const kitchenRequest = isToday && canViewKitchen
        ? kitchenQueue()
          .then((response) => ({ response, failed: false }))
          .catch(() => ({ response: { orders: [] as Order[] }, failed: true }))
        : Promise.resolve({ response: { orders: [] as Order[] }, failed: false });
      const ingredientRequest = isToday && canViewInventory
        ? listIngredients()
          .then((response) => ({ response, failed: false }))
          .catch(() => ({ response: { ingredients: [] as Ingredient[] }, failed: true }))
        : Promise.resolve({ response: { ingredients: [] as Ingredient[] }, failed: false });
      const managerReportRequest = shouldLoadReports
        ? getManagerReport(14)
          .then((response) => ({ response, failed: false }))
          .catch(() => ({ response: null as ManagerReport | null, failed: true }))
        : Promise.resolve({ response: null as ManagerReport | null, failed: false });
      const topMenuRequest = shouldLoadReports
        ? getTopMenuItemsByMonth(getBangkokReportMonth())
          .then((response) => ({ response, failed: false }))
          .catch(() => ({ response: null as TopMenuItemsReport | null, failed: true }))
        : Promise.resolve({ response: null as TopMenuItemsReport | null, failed: false });

      const [
        orderResponse,
        tableResponse,
        kitchenResponse,
        ingredientResponse,
        managerReportResponse,
        topMenuResponse,
      ] = await Promise.all([
        orderRequest,
        tableRequest,
        kitchenRequest,
        ingredientRequest,
        managerReportRequest,
        topMenuRequest,
      ]);
      if (requestId !== requestIdRef.current) return;

      setError(null);
      setOrders(orderResponse.orders || []);
      setTables(tableResponse.tables || []);
      if (shouldReplaceOptionalDashboardSnapshot(quiet, kitchenResponse.failed)) {
        setKitchenOrders(kitchenResponse.response.orders || []);
      }
      if (shouldReplaceOptionalDashboardSnapshot(quiet, ingredientResponse.failed)) {
        setIngredients(ingredientResponse.response.ingredients || []);
      }
      setOptionalFailures([
        ...(isToday && canViewKitchen && kitchenResponse.failed ? ['kitchen' as const] : []),
        ...(isToday && canViewInventory && ingredientResponse.failed ? ['inventory' as const] : []),
      ]);
      if (!quiet) {
        setManagerReport(shouldLoadReports ? managerReportResponse.response : null);
        setTopMenuReport(shouldLoadReports ? topMenuResponse.response : null);
        setReportFailures(shouldLoadReports
          ? [
            ...(managerReportResponse.failed ? ['trend' as const] : []),
            ...(topMenuResponse.failed ? ['top-menu' as const] : []),
          ]
          : []);
      }
      setLoadedDate(selectedDate);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const failurePolicy = dashboardLoadFailurePolicy(quiet);
      if (!failurePolicy.preserveSnapshot) {
        setOrders([]);
        setTables([]);
        setKitchenOrders([]);
        setIngredients([]);
        setOptionalFailures([]);
        setManagerReport(null);
        setTopMenuReport(null);
        setReportFailures([]);
        setLoadedDate(selectedDate);
      }
      if (failurePolicy.showError) {
        setError(
          err instanceof Error
            ? err.message
            : copy('โหลดภาพรวมร้านไม่สำเร็จ', 'Could not load the restaurant overview'),
        );
      }
    } finally {
      if (!quiet && foregroundRequestIdRef.current === requestId) {
        foregroundRequestIdRef.current = null;
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }
  }, [
    canViewDashboard,
    canViewInventory,
    canViewKitchen,
    canViewOrders,
    canViewReports,
    canViewTables,
    copy,
    isToday,
    selectedDate,
  ]);

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
    const timer = isToday ? setInterval(() => load(true), 15000) : null;
    return () => {
      if (timer) clearInterval(timer);
      requestIdRef.current += 1;
      foregroundRequestIdRef.current = null;
      setLoading(false);
    };
  }, [isToday, load]));

  const selectDate = useCallback((candidate: string) => {
    setSelectedDate((current) => clampDashboardDate(current, candidate, formatBangkokDate()));
  }, []);

  const validOrders = useMemo(() => orders.filter((order) => order.status !== 'cancelled'), [orders]);
  const activeOrders = useMemo(() => validOrders.filter((order) => activeStatuses.has(order.status)), [validOrders]);
  const orderSummary = useMemo(() => summarizeHomeOrders(orders), [orders]);
  const occupiedTableCount = useMemo(() => tables.filter((table) => table.status === 'occupied').length, [tables]);
  const freeTableCount = useMemo(() => tables.filter((table) => table.status === 'free').length, [tables]);
  const reservedTableCount = useMemo(() => tables.filter((table) => table.status === 'reserved').length, [tables]);
  const kitchenSummary = useMemo(() => summarizeKitchenQueue(kitchenOrders), [kitchenOrders]);
  const inventorySummary = useMemo(() => summarizeInventory(ingredients), [ingredients]);
  const compactStats = width < 390;
  const tabletWorkspace = width >= 900;
  const summaryColumns = tabletWorkspace ? 4 : compactStats ? 1 : 2;
  const counts = useMemo(() => ({
    ...kitchenSummary,
    ...inventorySummary,
    occupiedTables: occupiedTableCount,
  }), [inventorySummary, kitchenSummary, occupiedTableCount]);
  const access = useMemo(() => ({
    canViewKitchen,
    canViewInventory,
    canTakeOrder,
    canViewOrders,
  }), [canTakeOrder, canViewInventory, canViewKitchen, canViewOrders]);
  const priority = useMemo(() => resolveHomePriority(counts, access), [access, counts]);
  const attention = useMemo(() => buildHomeAttention(counts, access), [access, counts]);
  const operationalMetrics = useMemo(() => buildHomeOperationalMetrics({
    activeOrders: orderSummary.activeOrders,
    occupiedTables: occupiedTableCount,
    freeTables: freeTableCount,
    reservedTables: reservedTableCount,
    activeKitchen: kitchenSummary.activeKitchen,
    readyKitchen: kitchenSummary.readyKitchen,
  }, {
    canViewOrders,
    canViewTables,
    canViewKitchen,
  }), [
    canViewKitchen,
    canViewOrders,
    canViewTables,
    freeTableCount,
    kitchenSummary,
    occupiedTableCount,
    orderSummary.activeOrders,
    reservedTableCount,
  ]);
  const salesTrend = useMemo(
    () => managerReport ? summarizeHomeSalesTrend(managerReport.sales_days, today, 7) : null,
    [managerReport, today],
  );
  const topMenuItems = useMemo(
    () => topHomeMenuItems(topMenuReport?.items || [], 3),
    [topMenuReport],
  );
  const priorityText = priorityCopy(priority, copy);
  const priorityVisual = priorityPresentation(priority);
  const priorityNeedsAttention = attention.some((item) => item.key === priority.key);
  const secondaryAttention = attention.filter((item) => item.key !== priority.key);
  const optionalFailureLabels = optionalFailures.map((failure) =>
    failure === 'kitchen'
      ? copy('คิวครัว', 'kitchen queue')
      : copy('คลังวัตถุดิบ', 'inventory'),
  );
  const displayOrders = useMemo(
    () => isToday
      ? [...activeOrders, ...validOrders.filter((order) => !activeStatuses.has(order.status))]
      : validOrders,
    [activeOrders, isToday, validOrders],
  );
  const dateLoading = loading && loadedDate !== selectedDate;

  if (!canViewDashboard) {
    return (
      <AppScreen
        beforeHeading={<HomeRestaurantIdentity />}
        title={copy('ภาพรวมร้าน', 'Restaurant overview')}
        topLevel
      >
        <EmptyState
          title={copy('ไม่มีสิทธิ์ดูภาพรวมร้าน', 'You cannot view the restaurant overview')}
          detail={copy('ต้องมีสิทธิ์ view_dashboard', 'The view_dashboard permission is required')}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      beforeHeading={<HomeRestaurantIdentity />}
      title={copy('ภาพรวมร้าน', 'Restaurant overview')}
      subtitle={workMode.title}
      topLevel
      refreshControl={<AppRefreshControl onRefresh={() => load()} />}
      action={(
        <StatusBadge
          label={
            error
              ? copy('ต้องตรวจสอบ', 'Needs attention')
              : isToday
                ? copy('ข้อมูลสด', 'Live data')
                : copy('ข้อมูลย้อนหลัง', 'History')
          }
          tone={error ? 'danger' : isToday ? 'success' : 'info'}
        />
      )}
    >
      <View style={{ gap: spacing.md }}>
        <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: isToday ? palette.accentSoft : palette.infoSoft }}>
            <AppIcon color={isToday ? palette.accent : palette.info} name="calendar-outline" size={20} />
          </View>
          <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
            <Text selectable numberOfLines={1} adjustsFontSizeToFit style={{ color: palette.textStrong, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {dashboardDateLabel(selectedDate, language)}
            </Text>
            <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
              {isToday
                ? copy('วันนี้ · อัปเดตอัตโนมัติ', 'Today · Updates automatically')
                : copy('กำลังดูวันที่เลือก', 'Viewing selected date')}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={copy('วันก่อนหน้า', 'Previous day')}
            accessibilityRole="button"
            onPress={() => selectDate(shiftDashboardDate(selectedDate, -1))}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: palette.borderStrong,
              borderRadius: radius.md,
              backgroundColor: palette.surface,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <AppIcon color={palette.text} name="chevron-back" size={20} />
          </Pressable>
          <Pressable
            accessibilityLabel={copy('วันถัดไป', 'Next day')}
            accessibilityRole="button"
            accessibilityState={{ disabled: selectedDate >= today }}
            disabled={selectedDate >= today}
            onPress={() => selectDate(shiftDashboardDate(selectedDate, 1))}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: palette.borderStrong,
              borderRadius: radius.md,
              backgroundColor: palette.surface,
              opacity: selectedDate >= today ? 0.35 : pressed ? 0.72 : 1,
            })}
          >
            <AppIcon color={palette.text} name="chevron-forward" size={20} />
          </Pressable>
        </View>
        {!isToday ? (
          <Button
            compact
            variant="secondary"
            label={copy('กลับมาวันนี้', 'Back to today')}
            onPress={() => selectDate(today)}
          />
        ) : null}
      </View>

      {error ? (
        <Feedback
          title={copy('อัปเดตข้อมูลไม่ได้', 'Could not update data')}
          detail={error}
          tone="danger"
        />
      ) : null}

      {dateLoading ? (
        <Surface>
          <Text selectable style={[typeScale.body, { color: palette.muted }]}>
            {copy(
              'กำลังโหลดข้อมูลของวันที่เลือก...',
              'Loading data for the selected date...',
            )}
          </Text>
        </Surface>
      ) : (
        <>
          {!isToday ? (
            <Surface style={{ borderColor: statusTone('info').borderColor, backgroundColor: palette.infoSoft }}>
              <SectionHeader
                title={copy('กำลังดูสรุปย้อนหลัง', 'Viewing a historical summary')}
                detail={copy(
                  'หน้านี้ไม่ผสมสถานะสดของครัว โต๊ะ และคลังเข้ากับข้อมูลของวันที่เลือก',
                  'Live kitchen, table, and inventory status is not mixed into the selected date.',
                )}
              />
            </Surface>
          ) : (
            <Pressable
              accessibilityLabel={[priorityText.title, priorityText.detail, priorityText.label].filter(Boolean).join('. ')}
              accessibilityRole={priority.href ? 'button' : undefined}
              disabled={!priority.href}
              onPress={() => priority.href && router.push(priority.href as never)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                borderWidth: 1,
                borderColor: priorityVisual.borderColor,
                borderRadius: radius.md,
                backgroundColor: priorityVisual.backgroundColor,
                padding: spacing.lg,
                opacity: pressed ? 0.76 : 1,
              })}
            >
              <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: palette.surface }}>
                <AppIcon color={priorityVisual.color} name={priorityVisual.icon} size={23} />
              </View>
              <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
                <Text selectable style={[typeScale.caption, { color: priorityVisual.color, fontWeight: '700' }]}>
                  {priorityNeedsAttention
                    ? copy('ต้องจัดการตอนนี้', 'Needs attention now')
                    : priority.key === 'overview'
                      ? copy('สถานะกะ', 'Shift status')
                      : copy('งานถัดไป', 'Next action')}
                </Text>
                <Text selectable style={[typeScale.title, { fontSize: 17 }]}>{priorityText.title}</Text>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{priorityText.detail}</Text>
                {priorityText.label ? (
                  <Text selectable style={[typeScale.caption, { color: priorityVisual.color, fontWeight: '700' }]}>
                    {priorityText.label}
                  </Text>
                ) : null}
              </View>
              {priority.href ? <AppIcon color={priorityVisual.color} name="chevron-forward" size={20} /> : null}
            </Pressable>
          )}

          {isToday && operationalMetrics.length ? (
            <View style={{ gap: spacing.md }}>
              <EdgeSectionHeader
                title={copy('สถานะระหว่างกะ', 'Live shift status')}
                detail={copy('แสดงเฉพาะข้อมูลที่บัญชีนี้มีสิทธิ์ดู', 'Only permitted live counts are shown')}
              />
              <EdgeSection>
                {operationalMetrics.map((metric) => {
                  const presentation = operationalMetricPresentation(metric.key);
                  const tone = statusTone(presentation.tone);
                  const canOpenMetric = presentation.href !== '/tables' || canTakeOrder;
                  return (
                    <EdgeRow
                      accessibilityLabel={`${operationalMetricLabel(metric.key, copy)}: ${metric.count}`}
                      icon={presentation.icon}
                      iconColor={tone.color}
                      key={metric.key}
                      onPress={canOpenMetric ? () => router.push(presentation.href) : undefined}
                      showChevron={canOpenMetric}
                      title={operationalMetricLabel(metric.key, copy)}
                      trailing={<Text selectable style={[typeScale.number, { fontSize: 20 }]}>{metric.count}</Text>}
                    />
                  );
                })}
              </EdgeSection>
            </View>
          ) : null}

          {isToday && optionalFailures.length ? (
            <Feedback
              title={copy('ข้อมูลบางส่วนยังไม่ครบ', 'Some live data is unavailable')}
              detail={copy(
                `ระบบยังอัปเดตไม่ได้: ${optionalFailureLabels.join(', ')} และจะลองใหม่อัตโนมัติ`,
                `Could not update: ${optionalFailureLabels.join(', ')}. The app will retry automatically.`,
              )}
              tone="warning"
            />
          ) : null}

          {isToday && secondaryAttention.length ? (
            <View style={{ gap: spacing.md }}>
              <EdgeSectionHeader title={copy('งานอื่นที่ต้องดู', 'Other items to review')} />
              <EdgeSection>
                {secondaryAttention.map((item) => {
                  const tone = statusTone(item.tone);
                  const label = attentionLabel(item, copy);
                  return (
                    <EdgeRow
                      accessibilityLabel={`${label}: ${item.count}`}
                      key={item.key}
                      onPress={() => item.href && router.push(item.href as never)}
                      leading={<View style={{ width: 9, height: 9, borderRadius: radius.full, backgroundColor: tone.color }} />}
                      title={label}
                      trailing={<Text selectable style={[typeScale.number, { color: tone.color, fontSize: 18 }]}>{item.count}</Text>}
                    />
                  );
                })}
              </EdgeSection>
            </View>
          ) : null}

          {canViewOrders ? (
            <View style={{ gap: spacing.md }}>
              <SectionHeader
                title={isToday ? copy('สรุปวันนี้', 'Today’s summary') : copy('สรุปวันที่เลือก', 'Selected date summary')}
                detail={dashboardDateLabel(selectedDate, language)}
              />
              <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {[
                    {
                      value: String(orderSummary.totalOrders),
                      label: copy('ออเดอร์ทั้งหมด', 'Total orders'),
                    },
                    {
                      value: formatMoney(orderSummary.paidRevenue, language),
                      label: copy('ยอดรับเงิน', 'Payments received'),
                    },
                    {
                      value: formatMoney(orderSummary.averageBill, language),
                      label: copy('ยอดเฉลี่ยต่อบิล', 'Average bill'),
                    },
                    {
                      value: String(orderSummary.guests),
                      label: copy('จำนวนลูกค้า', 'Guests'),
                    },
                  ].map((item, index) => (
                    <View
                      key={item.label}
                      style={{
                        width: `${100 / summaryColumns}%`,
                        minHeight: 82,
                        justifyContent: 'center',
                        gap: spacing.xs,
                        borderLeftWidth: index % summaryColumns ? 1 : 0,
                        borderTopWidth: index >= summaryColumns ? 1 : 0,
                        borderColor: palette.border,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                      }}
                    >
                      <Text selectable numberOfLines={1} adjustsFontSizeToFit style={[typeScale.number, { fontSize: 19 }]}>
                        {item.value}
                      </Text>
                      <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </Surface>
            </View>
          ) : null}

          {isToday && canViewReports ? (
            <View style={{ gap: spacing.md }}>
              <SectionHeader
                title={copy('สรุปสำหรับผู้จัดการ', 'Manager summary')}
                detail={copy(
                  'แนวโน้ม 7 วันล่าสุดเทียบกับ 7 วันก่อนหน้า',
                  'Latest 7 days compared with the previous 7 days',
                )}
                action={(
                  <Button
                    compact
                    variant="secondary"
                    label={copy('ดูรายงาน', 'View reports')}
                    onPress={() => router.push('/reports')}
                  />
                )}
              />
              <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>

              {salesTrend ? (
                <View style={{ flexDirection: compactStats ? 'column' : 'row' }}>
                  {[
                    {
                      key: 'revenue',
                      label: copy('รายได้ 7 วัน', '7-day revenue'),
                      value: salesTrend.current.revenue,
                      delta: salesTrend.delta.revenue,
                    },
                    {
                      key: 'profit',
                      label: copy('กำไร 7 วัน', '7-day profit'),
                      value: salesTrend.current.profit,
                      delta: salesTrend.delta.profit,
                    },
                  ].map((item, index) => (
                    <View
                      key={item.key}
                      style={{
                        minHeight: 96,
                        flex: 1,
                        justifyContent: 'center',
                        gap: spacing.xs,
                        borderLeftWidth: !compactStats && index ? 1 : 0,
                        borderTopWidth: compactStats && index ? 1 : 0,
                        borderColor: palette.border,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                      }}
                    >
                      <Text
                        selectable
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={[
                          typeScale.number,
                          { color: item.key === 'profit' && item.value < 0 ? palette.danger : palette.textStrong },
                        ]}
                      >
                        {formatMoney(item.value, language)}
                      </Text>
                      <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text>
                      <Text
                        selectable
                        style={[
                          typeScale.caption,
                          { color: item.delta > 0 ? palette.success : item.delta < 0 ? palette.danger : palette.muted },
                        ]}
                      >
                        {copy(
                          `เปลี่ยนแปลง ${formatSignedMoney(item.delta, language)} จาก 7 วันก่อน`,
                          `${formatSignedMoney(item.delta, language)} vs previous 7 days`,
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ gap: spacing.xs, borderTopWidth: 1, borderColor: palette.border, padding: spacing.lg }}>
                  <Text selectable style={[typeScale.cardTitle, { color: palette.warning }]}>
                    {copy('ยังโหลดแนวโน้มรายได้ไม่ได้', 'Revenue trend is unavailable')}
                  </Text>
                  <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                    {copy(
                      'ส่วนงานสดยังใช้งานได้ และจะลองโหลดข้อมูลนี้อีกครั้งเมื่อเปิดหน้าหรือดึงหน้าจอลง',
                      'Live operations remain available. Reopen or pull down to retry this summary.',
                    )}
                  </Text>
                </View>
              )}

              <View style={{ gap: spacing.md, borderTopWidth: 1, borderColor: palette.border, padding: spacing.lg }}>
                <SectionHeader
                  title={copy('เมนูขายดีประจำเดือน', 'Monthly top menu items')}
                  detail={topMenuReport
                    ? reportMonthLabel(topMenuReport, language)
                    : copy('เดือนปัจจุบัน', 'Current month')}
                />
                {topMenuItems.length ? topMenuItems.map((item, index) => (
                  <View
                    key={item.menu_id}
                    style={{
                      minHeight: 42,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      borderTopWidth: index ? 1 : 0,
                      borderColor: palette.border,
                      paddingTop: index ? spacing.md : 0,
                    }}
                  >
                    <Text selectable style={[typeScale.caption, { width: 24, color: palette.muted, fontWeight: '700' }]}>
                      {index + 1}
                    </Text>
                    <Text selectable numberOfLines={2} style={[typeScale.body, { minWidth: 0, flex: 1, color: palette.textStrong, fontWeight: '700' }]}>
                      {item.menu_name}
                    </Text>
                    <Text selectable style={[typeScale.number, { fontSize: 16 }]}>
                      {copy(
                        `${Number(item.quantity).toLocaleString('th-TH')} จาน`,
                        `${Number(item.quantity).toLocaleString('en-US')} sold`,
                      )}
                    </Text>
                  </View>
                )) : (
                  <View style={{ gap: spacing.xs }}>
                    <Text
                      selectable
                      style={[
                        typeScale.cardTitle,
                        { color: reportFailures.includes('top-menu') ? palette.warning : palette.textStrong },
                      ]}
                    >
                      {reportFailures.includes('top-menu')
                        ? copy('ยังโหลดอันดับเมนูไม่ได้', 'Top menu items are unavailable')
                        : copy('ยังไม่มีข้อมูลการขายเดือนนี้', 'No menu sales this month yet')}
                    </Text>
                    <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                      {reportFailures.includes('top-menu')
                        ? copy(
                          'เปิดหน้านี้ใหม่หรือดึงหน้าจอลงเพื่อลองอีกครั้ง',
                          'Reopen or pull down to try again.',
                        )
                        : copy(
                          'เมื่อมีรายการขาย ระบบจะแสดง 3 เมนูแรกตรงนี้',
                          'The top three items will appear here after sales are recorded.',
                        )}
                    </Text>
                  </View>
                )}
              </View>
              </Surface>
            </View>
          ) : null}

          <View style={{ gap: spacing.md }}>
            <EdgeSectionHeader
              title={
                isToday
                  ? copy('ความเคลื่อนไหวล่าสุด', 'Recent activity')
                  : copy('ออเดอร์ของวันที่เลือก', 'Orders for the selected date')
              }
              detail={
                isToday
                  ? copy(
                    `${activeOrders.length} ออเดอร์ยังอยู่ระหว่างดำเนินการ`,
                    `${activeOrders.length} active ${activeOrders.length === 1 ? 'order' : 'orders'}`,
                  )
                  : dashboardDateLabel(selectedDate, language)
              }
            />
            {displayOrders.length ? (
              <EdgeSection>
                {displayOrders.slice(0, 6).map((order) => {
                  const orderTone = orderStatusPresentation(order.status);
                  const orderTime = formatBangkokTime(order.closed_at || order.opened_at, language);
                  return (
                    <EdgeRow
                      accessibilityLabel={`${order.table?.display_label || order.order_number}, ${localizedOrderStatus(order.status, copy)}, ${formatMoney(order.grand_total, language)}`}
                      detail={`${order.order_number} · ${localizedOrderStatus(order.status, copy)}`}
                      key={order.ID}
                      leading={(
                        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: orderTone.backgroundColor }}>
                          <AppIcon color={orderTone.color} name={order.payment_status === 'paid' ? 'checkmark' : 'receipt-outline'} size={18} />
                        </View>
                      )}
                      onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } })}
                      title={order.table?.display_label || order.order_number}
                      trailing={(
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Text selectable style={[typeScale.number, { fontSize: 16 }]}>{formatMoney(order.grand_total, language)}</Text>
                        {orderTime ? <Text selectable style={[typeScale.caption, { color: palette.muted, fontVariant: ['tabular-nums'] }]}>{orderTime}</Text> : null}
                        </View>
                      )}
                    />
                  );
                })}
              </EdgeSection>
            ) : (
              <EmptyState
                title={
                  canViewOrders
                    ? copy('ยังไม่มีออเดอร์ในวันที่เลือก', 'No orders for the selected date')
                    : copy('ไม่มีสิทธิ์ดูรายการออเดอร์', 'You cannot view order details')
                }
                detail={
                  canViewOrders
                    ? copy(
                      'เมื่อมีออเดอร์ รายการของวันที่เลือกจะอยู่ตรงนี้',
                      'Orders for the selected date will appear here.',
                    )
                    : copy(
                      'สรุปส่วนที่เหลือจะแสดงตามสิทธิ์ของคุณ',
                      'The remaining summary is shown based on your access.',
                    )
                }
              />
            )}
          </View>
        </>
      )}
    </AppScreen>
  );
}
