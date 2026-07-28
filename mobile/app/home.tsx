import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, useWindowDimensions, View } from 'react-native';

import { listIngredients } from '@/src/api/ingredient';
import { kitchenQueue, listOrders } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { Button, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import {
  buildHomeAttention,
  clampDashboardDate,
  resolveHomePriority,
  shiftDashboardDate,
  summarizeInventory,
  summarizeKitchenQueue,
  type HomePriority,
} from '@/src/lib/home-dashboard';
import { formatBangkokDate } from '@/src/lib/order-query';
import { can } from '@/src/lib/rbac';
import { getWorkModeCopy } from '@/src/lib/work-mode';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, statusTone, typeScale } from '@/src/theme';
import type { Ingredient } from '@/src/types/ingredient';
import type { Order, OrderStatus } from '@/src/types/order';
import type { RestaurantTable } from '@/src/types/table';

const activeStatuses = new Set(['open', 'sent_to_kitchen', 'cooking', 'ready', 'served']);
type Copy = (thai: string, english: string) => string;
type OptionalFailure = 'kitchen' | 'inventory';

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
  const hints: Record<string, string> = {
    'เปิดคิวครัวไว้เพื่อดูออเดอร์ที่ส่งเข้ามาและอัปเดตสถานะอาหาร':
      'Keep the kitchen queue open to receive orders and update item statuses.',
    'เริ่มจากเลือกโต๊ะ เปิดออเดอร์ เพิ่มเมนู แล้วส่งเข้าครัว':
      'Choose a table, open an order, add items, then send it to the kitchen.',
    'ติดตามออเดอร์ ออกบิล และบันทึกการชำระเงินจากมือถือ':
      'Track orders, issue bills, and record payments from your phone.',
    'ดูภาพรวมร้าน จัดการเมนู โต๊ะ พนักงาน และรายงานจากแอพเดียว':
      'Monitor the restaurant and manage menus, tables, staff, and reports in one app.',
    'ระบบจะแสดงเครื่องมือที่ตรงกับสิทธิ์ของบัญชีนี้':
      'The app shows the tools available to this account.',
  };

  return {
    title: copy(workMode.title, titles[workMode.title] || workMode.title),
    hint: copy(workMode.hint, hints[workMode.hint] || workMode.hint),
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

function priorityBackground(priority: HomePriority) {
  if (priority.tone === 'danger') return palette.dangerSoft;
  if (priority.tone === 'success') return palette.successSoft;
  if (priority.tone === 'warning') return palette.warningSoft;
  if (priority.tone === 'info') return palette.infoSoft;
  return palette.neutralSoft;
}

export default function HomeScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const { width } = useWindowDimensions();
  const requestIdRef = useRef(0);
  const [selectedDate, setSelectedDate] = useState(() => formatBangkokDate());
  const [loadedDate, setLoadedDate] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [optionalFailures, setOptionalFailures] = useState<OptionalFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const workMode = localizedWorkMode(getWorkModeCopy(activeMembership), copy);
  const restaurant = activeMembership?.restaurant;
  const canViewDashboard = can(activeMembership, 'view_dashboard');
  const canTakeOrder = can(activeMembership, 'take_order');
  const canViewOrders = can(activeMembership, 'view_orders');
  const canViewKitchen = can(activeMembership, 'view_kitchen');
  const canViewInventory = can(activeMembership, 'view_inventory') || can(activeMembership, 'manage_inventory');
  const canViewTables = canTakeOrder || can(activeMembership, 'view_tables') || can(activeMembership, 'manage_table');
  const today = formatBangkokDate();
  const isToday = selectedDate === today;

  const load = useCallback(async (quiet = false) => {
    if (!canViewDashboard) {
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    if (!quiet) setLoading(true);
    setError(null);

    try {
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

      const [orderResponse, tableResponse, kitchenResponse, ingredientResponse] = await Promise.all([
        orderRequest,
        tableRequest,
        kitchenRequest,
        ingredientRequest,
      ]);
      if (requestId !== requestIdRef.current) return;

      setOrders(orderResponse.orders || []);
      setTables(tableResponse.tables || []);
      setKitchenOrders(kitchenResponse.response.orders || []);
      setIngredients(ingredientResponse.response.ingredients || []);
      setOptionalFailures([
        ...(isToday && canViewKitchen && kitchenResponse.failed ? ['kitchen' as const] : []),
        ...(isToday && canViewInventory && ingredientResponse.failed ? ['inventory' as const] : []),
      ]);
      setLoadedDate(selectedDate);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setOrders([]);
      setTables([]);
      setKitchenOrders([]);
      setIngredients([]);
      setOptionalFailures([]);
      setLoadedDate(selectedDate);
      setError(
        err instanceof Error
          ? err.message
          : copy('โหลดภาพรวมร้านไม่สำเร็จ', 'Could not load the restaurant overview'),
      );
    } finally {
      if (requestId === requestIdRef.current && !quiet) setLoading(false);
    }
  }, [
    canViewDashboard,
    canViewInventory,
    canViewKitchen,
    canViewOrders,
    canViewTables,
    copy,
    isToday,
    selectedDate,
  ]);

  useFocusEffect(useCallback(() => {
    load();
    if (!isToday) return undefined;
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [isToday, load]));

  const selectDate = useCallback((candidate: string) => {
    setSelectedDate((current) => clampDashboardDate(current, candidate, formatBangkokDate()));
  }, []);

  const validOrders = useMemo(() => orders.filter((order) => order.status !== 'cancelled'), [orders]);
  const activeOrders = useMemo(() => validOrders.filter((order) => activeStatuses.has(order.status)), [validOrders]);
  const paidOrders = useMemo(
    () => validOrders.filter((order) => order.payment_status === 'paid' || order.status === 'completed'),
    [validOrders],
  );
  const paidRevenue = useMemo(
    () => paidOrders.reduce((sum, order) => sum + Number(order.grand_total || order.total_amount || 0), 0),
    [paidOrders],
  );
  const averageBill = paidOrders.length ? paidRevenue / paidOrders.length : 0;
  const guestCount = useMemo(
    () => validOrders.reduce((sum, order) => sum + (order.order_type === 'dine_in' ? Number(order.customer_count || 0) : 0), 0),
    [validOrders],
  );
  const occupiedTableCount = useMemo(() => tables.filter((table) => table.status === 'occupied').length, [tables]);
  const kitchenSummary = useMemo(() => summarizeKitchenQueue(kitchenOrders), [kitchenOrders]);
  const inventorySummary = useMemo(() => summarizeInventory(ingredients), [ingredients]);
  const compactStats = width < 390;
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
  const priorityText = priorityCopy(priority, copy);
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
      <AppScreen title={copy('ภาพรวมร้าน', 'Restaurant overview')} topLevel>
        <EmptyState
          title={copy('ไม่มีสิทธิ์ดูภาพรวมร้าน', 'You cannot view the restaurant overview')}
          detail={copy('ต้องมีสิทธิ์ view_dashboard', 'The view_dashboard permission is required')}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={restaurant?.name || copy('ภาพรวมร้าน', 'Restaurant overview')}
      subtitle={`${restaurant?.branch_name || copy('สาขาหลัก', 'Main branch')} · ${workMode.title}`}
      topLevel
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      action={(
        <StatusBadge
          label={
            error
              ? copy('ต้องตรวจสอบ', 'Needs attention')
              : isToday
                ? copy('อัปเดตอัตโนมัติ', 'Auto-updating')
                : copy('ข้อมูลย้อนหลัง', 'History')
          }
          tone={error ? 'danger' : isToday ? 'success' : 'info'}
        />
      )}
    >
      <Surface style={{ gap: spacing.md }}>
        <SectionHeader
          title={
            isToday
              ? copy('ภาพรวมวันนี้', 'Today’s overview')
              : copy('ข้อมูลย้อนหลัง', 'Historical data')
          }
          detail={
            isToday
              ? copy(
                'ข้อมูลสดตามวันทำการของกรุงเทพฯ',
                'Live data based on the Bangkok business day',
              )
              : copy(
                'ข้อมูลครัว โต๊ะ และคลังจะแสดงเฉพาะวันนี้',
                'Kitchen, table, and inventory status is available for today only',
              )
          }
        />
        <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          <Pressable
            accessibilityLabel={copy('วันก่อนหน้า', 'Previous day')}
            accessibilityRole="button"
            onPress={() => selectDate(shiftDashboardDate(selectedDate, -1))}
            style={({ pressed }) => ({
              width: 46,
              minHeight: 46,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: palette.borderStrong,
              borderTopLeftRadius: radius.md,
              borderBottomLeftRadius: radius.md,
              backgroundColor: palette.surface,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Text style={{ color: palette.text, fontSize: 24, fontWeight: '700' }}>‹</Text>
          </Pressable>
          <View style={{ minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.borderStrong, backgroundColor: palette.surface, paddingHorizontal: spacing.sm }}>
            <Text selectable numberOfLines={1} adjustsFontSizeToFit style={{ color: palette.textStrong, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{dashboardDateLabel(selectedDate, language)}</Text>
            <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
              {isToday ? copy('วันนี้', 'Today') : copy('วันที่เลือก', 'Selected date')}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={copy('วันถัดไป', 'Next day')}
            accessibilityRole="button"
            accessibilityState={{ disabled: selectedDate >= today }}
            disabled={selectedDate >= today}
            onPress={() => selectDate(shiftDashboardDate(selectedDate, 1))}
            style={({ pressed }) => ({
              width: 46,
              minHeight: 46,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: palette.borderStrong,
              borderTopRightRadius: radius.md,
              borderBottomRightRadius: radius.md,
              backgroundColor: palette.surface,
              opacity: selectedDate >= today ? 0.35 : pressed ? 0.72 : 1,
            })}
          >
            <Text style={{ color: palette.text, fontSize: 24, fontWeight: '700' }}>›</Text>
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
      </Surface>

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
            <Surface style={{ backgroundColor: palette.infoSoft }}>
              <SectionHeader
                title={copy('กำลังดูสรุปย้อนหลัง', 'Viewing a historical summary')}
                detail={copy(
                  'หน้านี้ไม่ผสมสถานะสดของครัว โต๊ะ และคลังเข้ากับข้อมูลของวันที่เลือก',
                  'Live kitchen, table, and inventory status is not mixed into the selected date.',
                )}
              />
            </Surface>
          ) : (
            <Surface style={{ backgroundColor: priorityBackground(priority) }}>
              <SectionHeader
                title={priorityText.title}
                detail={priorityText.detail}
                action={priority.href && priorityText.label
                  ? <Button compact label={priorityText.label} onPress={() => router.push(priority.href as never)} />
                  : undefined}
              />
            </Surface>
          )}

          <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
            <View style={{ flexDirection: compactStats ? 'column' : 'row' }}>
              {[
                {
                  value: String(validOrders.length),
                  label: copy('ออเดอร์ทั้งหมด', 'Total orders'),
                },
                {
                  value: formatMoney(paidRevenue, language),
                  label: copy('ยอดรับเงิน', 'Payments received'),
                },
                {
                  value: formatMoney(averageBill, language),
                  label: copy('ยอดเฉลี่ยต่อบิล', 'Average bill'),
                },
                { value: String(guestCount), label: copy('จำนวนลูกค้า', 'Guests') },
              ].map((item, index) => (
                <View key={item.label} style={{ minHeight: 82, flex: 1, justifyContent: 'center', gap: spacing.xs, borderLeftWidth: !compactStats && index ? 1 : 0, borderTopWidth: compactStats && index ? 1 : 0, borderColor: palette.border, paddingHorizontal: spacing.lg }}>
                  <Text selectable numberOfLines={1} adjustsFontSizeToFit style={[typeScale.number, { fontSize: 19 }]}>{item.value}</Text>
                  <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </Surface>

          {isToday && (canViewKitchen || canViewInventory) ? (
            <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
              <View style={{ padding: spacing.lg }}>
                <SectionHeader
                  title={copy('ต้องดูตอนนี้', 'Needs attention now')}
                  detail={optionalFailures.length
                    ? copy(
                      `ยังอัปเดตบางส่วนไม่ได้: ${optionalFailureLabels.join(', ')}`,
                      `Some sections could not update: ${optionalFailureLabels.join(', ')}`,
                    )
                    : copy(
                      'งานครัวและสต็อกที่อาจกระทบกะปัจจุบัน',
                      'Kitchen and stock issues that may affect the current shift',
                    )}
                />
              </View>
              {attention.length ? attention.map((item) => {
                const tone = statusTone(item.tone);
                const label = attentionLabel(item, copy);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${label}: ${item.count}`}
                    key={item.key}
                    onPress={() => item.href && router.push(item.href as never)}
                    style={({ pressed }) => ({
                      minHeight: 54,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      borderTopWidth: 1,
                      borderColor: palette.border,
                      backgroundColor: pressed ? tone.backgroundColor : palette.surface,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                    })}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: tone.color }} />
                    <Text selectable style={[typeScale.body, { flex: 1, color: palette.textStrong, fontWeight: '700' }]}>{label}</Text>
                    <StatusBadge label={String(item.count)} tone={item.tone} />
                    <Text style={{ color: palette.muted, fontSize: 20 }}>›</Text>
                  </Pressable>
                );
              }) : optionalFailures.length ? (
                <View style={{ gap: spacing.xs, borderTopWidth: 1, borderColor: palette.border, padding: spacing.lg }}>
                  <Text selectable style={[typeScale.cardTitle, { color: palette.warning }]}>
                    {copy('ข้อมูลแจ้งเตือนยังไม่ครบ', 'Alert data is incomplete')}
                  </Text>
                  <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                    {copy(
                      'ภาพรวมส่วนอื่นยังใช้งานได้ ระบบจะลองอัปเดตส่วนนี้ให้อัตโนมัติ',
                      'The rest of the overview is still available. The app will retry these updates automatically.',
                    )}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: spacing.xs, borderTopWidth: 1, borderColor: palette.border, padding: spacing.lg }}>
                  <Text selectable style={[typeScale.cardTitle, { color: palette.success }]}>
                    {copy('ยังไม่มีงานเร่งด่วน', 'Nothing urgent right now')}
                  </Text>
                  <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                    {copy(
                      'คิวครัวและสต็อกที่คุณมีสิทธิ์ดูยังอยู่ในเกณฑ์ปกติ',
                      'The kitchen queue and stock levels available to you are within normal limits.',
                    )}
                  </Text>
                </View>
              )}
            </Surface>
          ) : null}

          {isToday ? (
            <Surface>
              <SectionHeader title={copy('งานระหว่างกะ', 'Shift actions')} detail={workMode.hint} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {canTakeOrder ? (
                  <Button
                    label={copy('รับออเดอร์', 'Take order')}
                    onPress={() => router.push('/tables')}
                    style={{ flexGrow: 1 }}
                  />
                ) : null}
                {canViewOrders ? (
                  <Button
                    variant="secondary"
                    label={copy('ดูออเดอร์', 'View orders')}
                    onPress={() => router.push('/orders')}
                    style={{ flexGrow: 1 }}
                  />
                ) : null}
                {canViewKitchen ? (
                  <Button
                    variant="secondary"
                    label={copy('เปิดคิวครัว', 'Open kitchen queue')}
                    onPress={() => router.push('/kitchen')}
                    style={{ flexGrow: 1 }}
                  />
                ) : null}
              </View>
            </Surface>
          ) : null}

          <View style={{ gap: spacing.md }}>
            <SectionHeader
              title={
                isToday
                  ? copy('ออเดอร์ของวันนี้', 'Today’s orders')
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
            {displayOrders.length ? displayOrders.slice(0, 6).map((order) => (
              <Pressable
                accessibilityLabel={`${order.table?.display_label || order.order_number}, ${localizedOrderStatus(order.status, copy)}, ${formatMoney(order.grand_total, language)}`}
                key={order.ID}
                onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(order.ID) } })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: pressed ? 0.78 : 1 })}
              >
                <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
                  <Text selectable numberOfLines={1} style={typeScale.cardTitle}>{order.table?.display_label || order.order_number}</Text>
                  <Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>
                    {order.order_number} · {localizedOrderStatus(order.status, copy)}
                  </Text>
                </View>
                <Text selectable style={typeScale.number}>{formatMoney(order.grand_total, language)}</Text>
              </Pressable>
            )) : (
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
