import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import { apiUrl } from '@/src/api/client';
import { kitchenQueue, updateOrderItemStatus } from '@/src/api/order';
import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { usePrimaryTabSceneStatus } from '@/src/components/primary-tabs-runtime';
import {
  Button,
  ChipGroup,
  Divider,
  EmptyState,
  Feedback,
  StatusBadge,
  Surface,
  TextField,
} from '@/src/components/ui';
import { itemStatusLabel } from '@/src/lib/format';
import {
  createKitchenMutationGate,
  KitchenMutationError,
  kitchenFulfillmentContext,
  kitchenTicketTiming,
  resolveKitchenImageUrl,
  runKitchenMutation,
} from '@/src/lib/kitchen-workflow';
import { createRequestGeneration } from '@/src/lib/request-generation';
import {
  isCookingItem,
  isKitchenDoneItem,
  kitchenTicketKey,
  validateKitchenCancelReason,
} from '@/src/lib/order-workflow';
import { kitchenAccess } from '@/src/lib/permission-parity';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Order, OrderItem } from '@/src/types/order';

type KitchenLane = 'cooking' | 'done';

const styles = StyleSheet.create({
  focusSwitch: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  focusButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  focusLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  focusCount: {
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  focusCountText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  board: {
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  lane: {
    gap: spacing.md,
  },
  laneHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderStrong,
    paddingBottom: spacing.sm,
  },
  laneIdentity: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  laneDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
  },
  laneTitle: {
    color: palette.textStrong,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  laneCount: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  ticket: {
    gap: 0,
    overflow: 'hidden',
    padding: 0,
  },
  ticketHeader: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ticketIdentity: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  orderNumber: {
    color: palette.textStrong,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  ticketMeta: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  timer: {
    minWidth: 72,
    alignItems: 'flex-end',
    gap: 1,
  },
  timerValue: {
    fontSize: 26,
    lineHeight: 29,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  item: {
    gap: spacing.md,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  itemMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  itemContent: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  quantity: {
    minWidth: 34,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: palette.surfaceStrong,
    paddingHorizontal: spacing.xs,
  },
  quantityText: {
    color: palette.textStrong,
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  itemTitle: {
    minWidth: 0,
    flex: 1,
    color: palette.textStrong,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  itemDetail: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  inlineFlow: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: spacing.md,
  },
  ticketFooter: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});

function KitchenIconAction({
  label,
  icon,
  tone = 'neutral',
  onPress,
  disabled,
  loading,
}: {
  label: string;
  icon: AppIconName;
  tone?: 'success' | 'danger' | 'neutral';
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const color = tone === 'success' ? palette.success : tone === 'danger' ? palette.danger : palette.text;
  const pressedBackground = tone === 'success'
    ? palette.successSoft
    : tone === 'danger'
      ? palette.dangerSoft
      : palette.surfaceStrong;
  const inactive = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(loading), disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        {
          backgroundColor: pressed ? pressedBackground : 'transparent',
          opacity: inactive ? 0.42 : pressed ? 0.72 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={color} size="small" /> : <AppIcon color={color} name={icon} size={22} />}
    </Pressable>
  );
}

export default function KitchenScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const access = kitchenAccess(
    can(activeMembership, 'view_kitchen'),
    can(activeMembership, 'update_order_status'),
  );
  const canUpdate = access.canUpdate;
  const canView = access.canView;
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<KitchenLane>('cooking');
  const [loading, setLoading] = useState(true);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);
  const [undoConfirmId, setUndoConfirmId] = useState<number | null>(null);
  const mutationGateRef = useRef(createKitchenMutationGate());
  const requestGenerationRef = useRef(createRequestGeneration());
  const adjacentWarmRequestedRef = useRef(false);
  const primaryTabSceneStatus = usePrimaryTabSceneStatus();

  const reconcileQueue = useCallback(async () => {
    const request = requestGenerationRef.current.begin();
    try {
      const response = await kitchenQueue();
      if (requestGenerationRef.current.isCurrent(request)) {
        setOrders(response.orders || []);
      }
    } catch (err) {
      if (requestGenerationRef.current.isCurrent(request)) throw err;
    }
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!canView) {
      setLoading(false);
      return;
    }
    if (mutationGateRef.current.locked) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      await reconcileQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('โหลดคิวครัวไม่สำเร็จ', 'Could not load the kitchen queue'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [canView, copy, reconcileQueue]);

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
    const timer = setInterval(() => { void load(true); }, 8000);
    return () => {
      clearInterval(timer);
      requestGenerationRef.current.invalidate();
    };
  }, [load]));

  const cookingTickets = useMemo(
    () => orders.filter((order) => (order.items || []).some((item) => isCookingItem(item.status))),
    [orders],
  );
  const doneTickets = useMemo(
    () => orders.filter((order) => (order.items || []).some((item) => isKitchenDoneItem(item.status))),
    [orders],
  );
  const visibleGroups = width >= 820
    ? [
        { title: copy('กำลังทำ', 'Cooking'), orders: cookingTickets, kind: 'cooking' as const },
        { title: copy('ครัวทำเสร็จ', 'Kitchen done'), orders: doneTickets, kind: 'done' as const },
      ]
    : [{
        title: filter === 'cooking' ? copy('กำลังทำ', 'Cooking') : copy('ครัวทำเสร็จ', 'Kitchen done'),
        orders: filter === 'cooking' ? cookingTickets : doneTickets,
        kind: filter,
      }];

  async function setItemStatus(
    orderId: number,
    item: OrderItem,
    status: 'cooking' | 'ready' | 'cancelled',
    reason?: string,
    success?: string,
  ) {
    if (!canUpdate || !mutationGateRef.current.tryAcquire()) return false;
    requestGenerationRef.current.invalidate();
    const actionKey = `${status}:${item.ID}`;
    setSubmittingKey(actionKey);
    setError(null);
    setMessage(null);
    try {
      await runKitchenMutation(
        () => updateOrderItemStatus(orderId, item.ID, status, reason),
        reconcileQueue,
      );
      if (success) setMessage(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('อัปเดตสถานะอาหารไม่สำเร็จ', 'Could not update the item status'));
      return false;
    } finally {
      setSubmittingKey(null);
      mutationGateRef.current.release();
    }
  }

  async function markAllDone(order: Order) {
    if (!canUpdate) return;
    const items = (order.items || []).filter((item) => isCookingItem(item.status));
    if (!items.length) return;
    if (!mutationGateRef.current.tryAcquire()) return;
    requestGenerationRef.current.invalidate();
    const actionKey = `all:${kitchenTicketKey(order)}`;
    let updatedCount = 0;
    setSubmittingKey(actionKey);
    setError(null);
    setMessage(null);
    try {
      await runKitchenMutation(async () => {
        for (const item of items) {
          await updateOrderItemStatus(order.ID, item.ID, 'ready');
          updatedCount += 1;
        }
      }, reconcileQueue);
      setMessage(copy('บันทึกว่าครัวทำเสร็จทั้งรอบแล้ว', 'Marked the entire kitchen batch as done'));
    } catch (err) {
      const mutationFailed = !(err instanceof KitchenMutationError) || err.mutationFailed;
      const mutationError = err instanceof KitchenMutationError ? err.mutationError : err;
      const reconciliationFailed = err instanceof KitchenMutationError && err.reconciliationFailed;
      const reconciliationError = err instanceof KitchenMutationError ? err.reconciliationError : null;
      const detail = mutationError instanceof Error
        ? mutationError.message
        : copy('อัปเดตทั้งรอบไม่สำเร็จ', 'Could not update the entire batch');
      if (updatedCount > 0 && reconciliationFailed) {
        const reconciliationDetail = reconciliationError instanceof Error
          ? reconciliationError.message
          : copy('โหลดคิวครัวล่าสุดไม่สำเร็จ', 'Could not load the latest kitchen queue');
        setError(copy(
          `อัปเดตสำเร็จ ${updatedCount.toLocaleString('th-TH')} จาก ${items.length.toLocaleString('th-TH')} รายการ แต่ยังตรวจสอบคิวล่าสุดไม่ได้${mutationFailed ? ` · หยุดอัปเดตเพราะ: ${detail}` : ''} · โหลดคิวไม่สำเร็จ: ${reconciliationDetail}`,
          `Updated ${updatedCount.toLocaleString('en-US')} of ${items.length.toLocaleString('en-US')} items, but the latest queue could not be verified${mutationFailed ? ` · Update stopped: ${detail}` : ''} · Queue load failed: ${reconciliationDetail}`,
        ));
      } else {
        setError(updatedCount > 0
          ? copy(
            `อัปเดตสำเร็จ ${updatedCount.toLocaleString('th-TH')} จาก ${items.length.toLocaleString('th-TH')} รายการ และตรวจคิวล่าสุดแล้ว · ${detail}`,
            `Updated ${updatedCount.toLocaleString('en-US')} of ${items.length.toLocaleString('en-US')} items and reconciled the latest queue · ${detail}`,
          )
          : detail);
      }
    } finally {
      setSubmittingKey(null);
      mutationGateRef.current.release();
    }
  }

  function startCancel(itemId: number) {
    if (mutationGateRef.current.locked) return;
    setCancelTargetId(itemId);
    setCancelReason('');
    setCancelReasonError(null);
    setUndoConfirmId(null);
  }

  async function confirmCancel(orderId: number, item: OrderItem) {
    if (!canUpdate || mutationGateRef.current.locked) return;
    const validation = validateKitchenCancelReason(cancelReason);
    if (validation.error) {
      setCancelReasonError(validation.error === 'required'
        ? copy('กรุณาระบุเหตุผลที่ยกเลิก', 'Enter a cancellation reason.')
        : copy('เหตุผลต้องไม่เกิน 500 ตัวอักษร', 'The reason must be 500 characters or fewer.'));
      return;
    }
    const succeeded = await setItemStatus(
      orderId,
      item,
      'cancelled',
      validation.reason,
      copy('ยกเลิกรายการอาหารแล้ว', 'Kitchen item cancelled'),
    );
    if (succeeded) {
      setCancelTargetId(null);
      setCancelReason('');
      setCancelReasonError(null);
    }
  }

  async function confirmUndo(orderId: number, item: OrderItem) {
    if (!canUpdate || mutationGateRef.current.locked) return;
    if (undoConfirmId !== item.ID) {
      setUndoConfirmId(item.ID);
      setCancelTargetId(null);
      return;
    }
    const succeeded = await setItemStatus(
      orderId,
      item,
      'cooking',
      undefined,
      copy('ย้ายรายการกลับไปกำลังทำแล้ว', 'Item moved back to Cooking'),
    );
    if (succeeded) setUndoConfirmId(null);
  }

  if (!canView) {
    return <AppScreen title={copy('จอครัว', 'Kitchen display')} topLevel><EmptyState title={copy('ไม่มีสิทธิ์ดูคิวครัว', 'No permission to view the kitchen queue')} detail={copy('ต้องมีสิทธิ์ view_kitchen', 'The view_kitchen permission is required.')} /></AppScreen>;
  }

  return (
    <AppScreen
      title={copy('จอครัว', 'Kitchen display')}
      subtitle={copy(`${cookingTickets.length.toLocaleString('th-TH')} รอบกำลังทำ · ${doneTickets.length.toLocaleString('th-TH')} รอบทำเสร็จ`, `${cookingTickets.length.toLocaleString('en-US')} cooking batches · ${doneTickets.length.toLocaleString('en-US')} done`)}
      topLevel
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />}
      action={<StatusBadge label={copy('อัปเดตอัตโนมัติทุก 8 วินาที', 'Auto-updates every 8 seconds')} tone="neutral" />}
      contentMaxWidth={1320}
      contentStyle={{ gap: spacing.lg }}
    >
      {error ? <Feedback title={copy('คิวครัวมีปัญหา', 'Kitchen queue issue')} detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}
      {!canUpdate ? (
        <Feedback
          title={copy('โหมดดูคิวครัว', 'Kitchen view mode')}
          detail={copy('บัญชีนี้ดูสถานะได้ แต่ไม่มีสิทธิ์เปลี่ยนสถานะรายการอาหาร', 'This account can view the queue but cannot change item statuses.')}
          tone="info"
        />
      ) : null}
      {width < 820 ? (
        <View accessibilityRole="tablist" style={styles.focusSwitch}>
          {([
            {
              key: 'cooking' as const,
              label: copy('กำลังทำ', 'Cooking'),
              count: cookingTickets.length,
              color: palette.warning,
              soft: palette.warningSoft,
              border: '#FDE68A',
            },
            {
              key: 'done' as const,
              label: copy('ทำเสร็จ', 'Done'),
              count: doneTickets.length,
              color: palette.success,
              soft: palette.successSoft,
              border: '#A7F3D0',
            },
          ]).map((option) => {
            const selected = option.key === filter;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={option.key}
                onPress={() => setFilter(option.key)}
                style={({ pressed }) => [
                  styles.focusButton,
                  {
                    borderColor: selected ? option.border : palette.borderStrong,
                    backgroundColor: selected ? option.soft : palette.surface,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Text style={[styles.focusLabel, { color: selected ? option.color : palette.text }]}>{option.label}</Text>
                <View style={[styles.focusCount, { backgroundColor: selected ? option.color : palette.surfaceStrong }]}>
                  <Text style={[styles.focusCountText, { color: selected ? palette.surface : palette.text }]}>
                    {option.count.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={[styles.board, { flexDirection: width >= 820 ? 'row' : 'column' }]}>
        {visibleGroups.map((group) => (
          <View
            key={group.kind}
            style={[
              styles.lane,
              {
              width: width >= 820 ? undefined : '100%',
              flex: width >= 820 ? 1 : undefined,
              },
            ]}
          >
            <View style={styles.laneHeader}>
              <View style={styles.laneIdentity}>
                <View
                  style={[
                    styles.laneDot,
                    { backgroundColor: group.kind === 'cooking' ? palette.warning : palette.success },
                  ]}
                />
                <Text accessibilityRole="header" selectable style={styles.laneTitle}>{group.title}</Text>
              </View>
              <Text selectable style={styles.laneCount}>
                {copy(
                  `${group.orders.length.toLocaleString('th-TH')} รอบครัว`,
                  `${group.orders.length.toLocaleString('en-US')} kitchen batches`,
                )}
              </Text>
            </View>
            {group.orders.map((order) => {
              const ticketKey = kitchenTicketKey(order);
              const items = (order.items || []).filter((item) => (
                group.kind === 'done'
                  ? isKitchenDoneItem(item.status)
                  : isCookingItem(item.status)
              ));
              const tableLabel = order.table?.display_label
                || order.table?.table_number
                || (order.table_id ? String(order.table_id) : '−');
              const location = order.order_type === 'takeaway'
                ? `${copy('ซื้อกลับบ้าน', 'Takeaway')}${order.customer_name?.trim() ? ` · ${order.customer_name.trim()}` : ''}`
                : copy(`โต๊ะ ${tableLabel}`, `Table ${tableLabel}`);
              const batchLabel = order.kitchen_batch ? copy(`รอบ ${order.kitchen_batch.toLocaleString('th-TH')}`, `Batch ${order.kitchen_batch.toLocaleString('en-US')}`) : copy('รอบครัว', 'Kitchen batch');
              const timing = kitchenTicketTiming({
                opened_at: order.opened_at,
                items,
              });
              const ticketBorderColor = group.kind === 'done'
                ? '#A7F3D0'
                : timing.urgency === 'overdue'
                  ? '#FECACA'
                  : '#FDE68A';
              const ticketHeaderBackground = group.kind === 'done'
                ? palette.successSoft
                : timing.urgency === 'overdue'
                  ? palette.dangerSoft
                  : palette.warningSoft;
              const timerColor = timing.urgency === 'overdue'
                ? palette.danger
                : timing.urgency === 'warning'
                  ? palette.warning
                  : palette.textStrong;
              const urgencyLabel = timing.urgency === 'overdue'
                ? copy('เกินเวลา', 'Overdue')
                : timing.urgency === 'warning'
                  ? copy('ใกล้เกินเวลา', 'Due soon')
                  : null;
              return (
                <Surface
                  key={ticketKey}
                  style={[styles.ticket, { borderColor: ticketBorderColor }]}
                >
                  <View
                    style={[
                      styles.ticketHeader,
                      {
                        borderBottomColor: ticketBorderColor,
                        backgroundColor: ticketHeaderBackground,
                      },
                    ]}
                  >
                    <View style={styles.ticketIdentity}>
                      <Text selectable style={styles.orderNumber}>{order.order_number}</Text>
                      <Text selectable style={styles.ticketMeta}>
                        {location} · {batchLabel} · {copy(
                          `${items.length.toLocaleString('th-TH')} รายการ`,
                          `${items.length.toLocaleString('en-US')} items`,
                        )}
                      </Text>
                    </View>
                    {group.kind === 'cooking' ? (
                      <View style={styles.timer}>
                        <Text selectable style={[styles.timerValue, { color: timerColor }]}>
                          {timing.minutes.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}
                        </Text>
                        <Text selectable style={[styles.timerLabel, { color: timerColor }]}>
                          {urgencyLabel ? `${copy('นาที', 'min')} · ${urgencyLabel}` : copy('นาที', 'min')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {items.map((item, index) => {
                    const cancelling = cancelTargetId === item.ID;
                    const confirmingUndo = undoConfirmId === item.ID;
                    const imageUri = resolveKitchenImageUrl(item.menu?.image_url, apiUrl);
                    const fulfillment = kitchenFulfillmentContext(order.order_type, item.fulfillment_type);
                    return (
                      <View key={item.ID}>
                        {index ? <Divider /> : null}
                        <View style={styles.item}>
                          <View style={styles.itemMain}>
                            {imageUri ? (
                              <Image
                                accessibilityLabel={copy(`รูปเมนู ${item.menu_name}`, `Photo of ${item.menu_name}`)}
                                source={{ uri: imageUri }}
                                resizeMode="contain"
                                 style={{
                                   width: width >= 820 ? 60 : 52,
                                   height: width >= 820 ? 60 : 52,
                                   borderRadius: radius.md,
                                   backgroundColor: 'transparent',
                                 }}
                               />
                             ) : null}
                            <View style={styles.itemContent}>
                              <View style={styles.itemTitleRow}>
                                <View
                                  accessible
                                  accessibilityLabel={copy(
                                    `จำนวน ${item.quantity.toLocaleString('th-TH')}`,
                                    `Quantity ${item.quantity.toLocaleString('en-US')}`,
                                  )}
                                  style={styles.quantity}
                                >
                                  <Text selectable style={styles.quantityText}>
                                    ×{item.quantity.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}
                                  </Text>
                                </View>
                                <Text selectable style={styles.itemTitle}>{item.menu_name}</Text>
                              </View>
                              {item.note ? (
                                <Text selectable style={[styles.itemDetail, { color: palette.text, fontWeight: '700' }]}>
                                  {item.note}
                                </Text>
                              ) : null}
                              {item.selected_options?.length ? (
                                <Text selectable style={styles.itemDetail}>
                                  {item.selected_options.map((option) => option.option_name).join(', ')}
                                </Text>
                              ) : null}
                              {fulfillment.differsFromOrder ? (
                                <Text
                                  selectable
                                  style={[typeScale.caption, { color: palette.info, fontWeight: '700' }]}
                                >
                                  {fulfillment.fulfillment === 'takeaway'
                                    ? copy('รายการนี้กลับบ้าน', 'This item: Takeaway')
                                    : copy('รายการนี้ทานที่ร้าน', 'This item: Dine-in')}
                                </Text>
                              ) : null}
                              {!canUpdate || group.kind === 'done' ? (
                                <StatusBadge
                                  label={group.kind === 'done' ? copy('ครัวทำเสร็จ', 'Kitchen done') : itemStatusLabel(item.status, language)}
                                  tone={group.kind === 'done' ? 'success' : 'warning'}
                                />
                              ) : null}
                            </View>
                            {canUpdate && group.kind === 'cooking' && !cancelling ? (
                              <View style={styles.itemActions}>
                                <KitchenIconAction
                                  label={copy(`ทำ ${item.menu_name} เสร็จ`, `Mark ${item.menu_name} done`)}
                                  icon="checkmark"
                                  tone="success"
                                  onPress={() => setItemStatus(order.ID, item, 'ready', undefined, copy('ย้ายรายการไปโซนทำเสร็จแล้ว', 'Item moved to Kitchen done'))}
                                  loading={submittingKey === `ready:${item.ID}`}
                                  disabled={submittingKey !== null}
                                />
                                <KitchenIconAction
                                  label={copy(`ยกเลิก ${item.menu_name}`, `Cancel ${item.menu_name}`)}
                                  icon="close"
                                  tone="danger"
                                  onPress={() => startCancel(item.ID)}
                                  disabled={submittingKey !== null}
                                />
                              </View>
                            ) : null}
                            {canUpdate && group.kind === 'done' && !confirmingUndo ? (
                              <KitchenIconAction
                                label={copy(`ย้าย ${item.menu_name} กลับไปกำลังทำ`, `Move ${item.menu_name} back to Cooking`)}
                                icon="arrow-undo-outline"
                                onPress={() => confirmUndo(order.ID, item)}
                                disabled={submittingKey !== null}
                              />
                            ) : null}
                          </View>

                          {canUpdate && group.kind === 'cooking' && cancelling ? (
                            <View style={styles.inlineFlow}>
                              <TextField
                                label={copy('เหตุผลที่ยกเลิก', 'Cancellation reason')}
                                value={cancelReason}
                                onChangeText={(value) => {
                                  setCancelReason(value);
                                  setCancelReasonError(null);
                                }}
                                placeholder={copy('เช่น ของหมด หรืออุปกรณ์ขัดข้อง', 'For example, sold out or equipment failure')}
                                multiline
                                error={cancelReasonError}
                              />
                              <ChipGroup
                                value={cancelReason}
                                onChange={(value) => {
                                  setCancelReason(value);
                                  setCancelReasonError(null);
                                }}
                                options={[
                                  { label: copy('ของหมด', 'Sold out'), value: copy('ของหมด', 'Sold out') },
                                  { label: copy('อุปกรณ์ขัดข้อง', 'Equipment failure'), value: copy('อุปกรณ์ขัดข้อง', 'Equipment failure') },
                                  { label: copy('เหตุสุดวิสัย', 'Unavoidable issue'), value: copy('เหตุสุดวิสัย', 'Unavoidable issue') },
                                ]}
                              />
                              <View style={[styles.itemActions, { flexDirection: width < 420 ? 'column' : 'row' }]}>
                                <Button
                                  compact
                                  variant="secondary"
                                  label={copy('เก็บรายการไว้', 'Keep item')}
                                  onPress={() => {
                                    setCancelTargetId(null);
                                    setCancelReasonError(null);
                                  }}
                                  disabled={submittingKey !== null}
                                  style={{ flex: 1 }}
                                />
                                <Button
                                  compact
                                  variant="danger"
                                  label={copy('ยืนยันยกเลิก', 'Confirm cancellation')}
                                  onPress={() => confirmCancel(order.ID, item)}
                                  loading={submittingKey === `cancelled:${item.ID}`}
                                  disabled={submittingKey !== null}
                                  style={{ flex: 1 }}
                                />
                              </View>
                            </View>
                          ) : null}

                          {canUpdate && group.kind === 'done' && confirmingUndo ? (
                            <View style={styles.inlineFlow}>
                              <Text selectable style={[typeScale.body, { color: palette.text }]}>
                                {copy('ยืนยันย้ายรายการนี้กลับไปโซนกำลังทำ', 'Move this item back to the Cooking lane?')}
                              </Text>
                              <View style={[styles.itemActions, { flexDirection: width < 420 ? 'column' : 'row' }]}>
                                <Button
                                  compact
                                  variant="secondary"
                                  label={copy('ยกเลิก', 'Cancel')}
                                  onPress={() => setUndoConfirmId(null)}
                                  disabled={submittingKey !== null}
                                  style={{ flex: 1 }}
                                />
                                <Button
                                  compact
                                  label={copy('ยืนยันย้ายกลับ', 'Confirm move back')}
                                  onPress={() => confirmUndo(order.ID, item)}
                                  loading={submittingKey === `cooking:${item.ID}`}
                                  disabled={submittingKey !== null}
                                  style={{ flex: 1 }}
                                />
                              </View>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                  {canUpdate && group.kind === 'cooking' && items.length > 1 ? (
                    <View style={styles.ticketFooter}>
                      <Button
                        variant="ghost"
                        label={copy('ทำเสร็จทั้งหมด', 'Mark all done')}
                        onPress={() => markAllDone(order)}
                        loading={submittingKey === `all:${ticketKey}`}
                        disabled={submittingKey !== null}
                      />
                    </View>
                  ) : null}
                </Surface>
              );
            })}
            {!loading && !group.orders.length ? (
              <EmptyState
                title={group.kind === 'cooking' ? copy('ไม่มีรายการกำลังทำ', 'No items cooking') : copy('ยังไม่มีรายการที่ครัวทำเสร็จ', 'No kitchen-done items yet')}
                detail={group.kind === 'cooking'
                  ? copy('รายการใหม่จะเข้าคิวอัตโนมัติเมื่อส่งออเดอร์เข้าครัว', 'New items appear automatically after an order is sent to the kitchen.')
                  : copy('รายการที่ทำเสร็จจะอยู่ตรงนี้จนกว่าหน้าร้านจะรับชำระเงิน', 'Done items stay here until front-of-house takes payment.')}
              />
            ) : null}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}
