import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, useWindowDimensions, View } from 'react-native';

import { kitchenQueue, updateOrderItemStatus } from '@/src/api/order';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import {
  Button,
  ChipGroup,
  Divider,
  EmptyState,
  Feedback,
  SectionHeader,
  StatusBadge,
  Surface,
  TextField,
} from '@/src/components/ui';
import { itemStatusLabel } from '@/src/lib/format';
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
import { palette, spacing, typeScale } from '@/src/theme';
import type { Order, OrderItem } from '@/src/types/order';

type KitchenLane = 'cooking' | 'done';

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

  const load = useCallback(async (quiet = false) => {
    if (!canView) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const response = await kitchenQueue();
      setOrders(response.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('โหลดคิวครัวไม่สำเร็จ', 'Could not load the kitchen queue'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [canView, copy]);

  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(() => load(true), 8000);
    return () => clearInterval(timer);
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
    if (!canUpdate) return false;
    const actionKey = `${status}:${item.ID}`;
    setSubmittingKey(actionKey);
    setError(null);
    setMessage(null);
    try {
      await updateOrderItemStatus(orderId, item.ID, status, reason);
      await load(true);
      if (success) setMessage(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('อัปเดตสถานะอาหารไม่สำเร็จ', 'Could not update the item status'));
      return false;
    } finally {
      setSubmittingKey(null);
    }
  }

  async function markAllDone(order: Order) {
    if (!canUpdate) return;
    const items = (order.items || []).filter((item) => isCookingItem(item.status));
    const actionKey = `all:${kitchenTicketKey(order)}`;
    setSubmittingKey(actionKey);
    setError(null);
    setMessage(null);
    try {
      for (const item of items) {
        await updateOrderItemStatus(order.ID, item.ID, 'ready');
      }
      await load(true);
      setMessage(copy('บันทึกว่าครัวทำเสร็จทั้งรอบแล้ว', 'Marked the entire kitchen batch as done'));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('อัปเดตทั้งรอบไม่สำเร็จ', 'Could not update the entire batch'));
    } finally {
      setSubmittingKey(null);
    }
  }

  function startCancel(itemId: number) {
    setCancelTargetId(itemId);
    setCancelReason('');
    setCancelReasonError(null);
    setUndoConfirmId(null);
  }

  async function confirmCancel(orderId: number, item: OrderItem) {
    if (!canUpdate) return;
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
    if (!canUpdate) return;
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
      action={<StatusBadge label={copy('อัปเดตอัตโนมัติทุก 8 วินาที', 'Auto-updates every 8 seconds')} tone="success" />}
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
        <ChipGroup
          value={filter}
          onChange={setFilter}
          options={[
            { label: copy(`กำลังทำ ${cookingTickets.length.toLocaleString('th-TH')}`, `Cooking ${cookingTickets.length.toLocaleString('en-US')}`), value: 'cooking' },
            { label: copy(`ทำเสร็จ ${doneTickets.length.toLocaleString('th-TH')}`, `Done ${doneTickets.length.toLocaleString('en-US')}`), value: 'done' },
          ]}
        />
      ) : null}
      <View style={{ flexDirection: width >= 820 ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        {visibleGroups.map((group) => (
          <View
            key={group.kind}
            style={{
              width: width >= 820 ? undefined : '100%',
              flex: width >= 820 ? 1 : undefined,
              gap: spacing.md,
            }}
          >
            <SectionHeader title={group.title} detail={copy(`${group.orders.length.toLocaleString('th-TH')} รอบครัว`, `${group.orders.length.toLocaleString('en-US')} kitchen batches`)} />
            {group.orders.map((order) => {
              const ticketKey = kitchenTicketKey(order);
              const items = (order.items || []).filter((item) => (
                group.kind === 'done'
                  ? isKitchenDoneItem(item.status)
                  : isCookingItem(item.status)
              ));
              const location = order.table?.display_label
                || (order.order_type === 'takeaway' ? copy('ซื้อกลับบ้าน', 'Takeaway') : order.order_number);
              const batchLabel = order.kitchen_batch ? copy(`รอบ ${order.kitchen_batch.toLocaleString('th-TH')}`, `Batch ${order.kitchen_batch.toLocaleString('en-US')}`) : copy('รอบครัว', 'Kitchen batch');
              return (
                <Surface
                  key={ticketKey}
                  style={{ borderColor: group.kind === 'done' ? '#A7F3D0' : '#FDE68A' }}
                >
                  <SectionHeader
                    title={order.order_number}
                    detail={`${location} · ${batchLabel} · ${copy(`${items.length.toLocaleString('th-TH')} รายการ`, `${items.length.toLocaleString('en-US')} items`)}`}
                  />
                  {items.map((item, index) => {
                    const cancelling = cancelTargetId === item.ID;
                    const confirmingUndo = undoConfirmId === item.ID;
                    return (
                      <View key={item.ID}>
                        {index ? <Divider /> : null}
                        <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                            <View style={{ flex: 1, gap: 3 }}>
                              <Text selectable style={typeScale.cardTitle}>{item.menu_name}</Text>
                              <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                                {copy(`จำนวน ${item.quantity.toLocaleString('th-TH')}`, `Quantity ${item.quantity.toLocaleString('en-US')}`)}{item.note ? ` · ${item.note}` : ''}
                              </Text>
                              {item.selected_options?.length ? (
                                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                                  {item.selected_options.map((option) => option.option_name).join(', ')}
                                </Text>
                              ) : null}
                            </View>
                            <StatusBadge
                              label={group.kind === 'done' ? copy('ครัวทำเสร็จ', 'Kitchen done') : itemStatusLabel(item.status, language)}
                              tone={group.kind === 'done' ? 'success' : 'warning'}
                            />
                          </View>

                          {canUpdate && group.kind === 'cooking' && !cancelling ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                              <Button
                                compact
                                label={copy('ทำเสร็จ', 'Mark done')}
                                onPress={() => setItemStatus(order.ID, item, 'ready', undefined, copy('ย้ายรายการไปโซนทำเสร็จแล้ว', 'Item moved to Kitchen done'))}
                                loading={submittingKey === `ready:${item.ID}`}
                                style={{ flexGrow: 1 }}
                              />
                              <Button
                                compact
                                variant="secondary"
                                label={copy('ยกเลิกรายการ', 'Cancel item')}
                                onPress={() => startCancel(item.ID)}
                                disabled={submittingKey !== null}
                                style={{ flexGrow: 1 }}
                              />
                            </View>
                          ) : null}

                          {canUpdate && group.kind === 'cooking' && cancelling ? (
                            <View style={{ gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}>
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
                              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                                <Button
                                  compact
                                  variant="secondary"
                                  label={copy('เก็บรายการไว้', 'Keep item')}
                                  onPress={() => {
                                    setCancelTargetId(null);
                                    setCancelReasonError(null);
                                  }}
                                  style={{ flex: 1 }}
                                />
                                <Button
                                  compact
                                  variant="danger"
                                  label={copy('ยืนยันยกเลิก', 'Confirm cancellation')}
                                  onPress={() => confirmCancel(order.ID, item)}
                                  loading={submittingKey === `cancelled:${item.ID}`}
                                  style={{ flex: 1 }}
                                />
                              </View>
                            </View>
                          ) : null}

                          {canUpdate && group.kind === 'done' ? (
                            confirmingUndo ? (
                              <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}>
                                <Text selectable style={[typeScale.body, { color: palette.text }]}>
                                  {copy('ยืนยันย้ายรายการนี้กลับไปโซนกำลังทำ', 'Move this item back to the Cooking lane?')}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                                  <Button
                                    compact
                                    variant="secondary"
                                    label={copy('ยกเลิก', 'Cancel')}
                                    onPress={() => setUndoConfirmId(null)}
                                    style={{ flex: 1 }}
                                  />
                                  <Button
                                    compact
                                    label={copy('ยืนยันย้ายกลับ', 'Confirm move back')}
                                    onPress={() => confirmUndo(order.ID, item)}
                                    loading={submittingKey === `cooking:${item.ID}`}
                                    style={{ flex: 1 }}
                                  />
                                </View>
                              </View>
                            ) : (
                              <Button
                                compact
                                variant="secondary"
                                label={copy('ย้ายกลับไปกำลังทำ', 'Move back to Cooking')}
                                onPress={() => confirmUndo(order.ID, item)}
                                disabled={submittingKey !== null}
                              />
                            )
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                  {canUpdate && group.kind === 'cooking' && items.length > 1 ? (
                    <Button
                      variant="ghost"
                      label={copy('ทำเสร็จทั้งหมด', 'Mark all done')}
                      onPress={() => markAllDone(order)}
                      loading={submittingKey === `all:${ticketKey}`}
                    />
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
