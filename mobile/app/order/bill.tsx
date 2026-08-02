import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, Share, View } from 'react-native';

import { apiUrl } from '@/src/api/client';
import { listCategories, listMenuItems } from '@/src/api/menu';
import { addOrderItem, getBill, payOrder, updateOrderItemStatus } from '@/src/api/order';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, EmptyState, Feedback, SectionHeader, StatusBadge, Surface, TextField } from '@/src/components/ui';
import { itemStatusLabel, money } from '@/src/lib/format';
import {
  activeOrderItems,
  billExitRoute,
  billPaymentStage,
  canTakeOrderPayment,
  paymentReceivedAmount,
  undeliveredOrderItems,
  validateKitchenCancelReason,
} from '@/src/lib/order-workflow';
import { resetRouteStack } from '@/src/lib/navigation-runtime';
import { can } from '@/src/lib/rbac';
import { buildReceiptShareText } from '@/src/lib/receipt';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Category, MenuItem } from '@/src/types/menu';
import type { Bill, OrderItem } from '@/src/types/order';

function resolveImage(value: string) {
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return `${apiUrl}${value.startsWith('/') ? '' : '/'}${value}`;
}

function itemTone(status: OrderItem['status']) {
  if (status === 'ready' || status === 'served') return 'success' as const;
  if (status === 'cooking' || status === 'pending') return 'warning' as const;
  return 'neutral' as const;
}

function hasRequiredOptions(item: MenuItem) {
  return (item.option_groups || []).some(
    (group) => group.is_active && Math.max(0, Number(group.min_select) || 0) > 0,
  );
}

export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const validOrderId = Number.isInteger(orderId) && orderId > 0;
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
  const canPay = can(activeMembership, 'take_payment');
  const canViewOrders = can(activeMembership, 'view_orders');
  const canAccessBill = canViewOrders || canTakeOrder || canPay;
  const [bill, setBill] = useState<Bill | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<'cash' | 'promptpay_qr'>('cash');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<OrderItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentRecorded, setPaymentRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!canAccessBill || !validOrderId) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const nextBill = await getBill(orderId);
      setBill(nextBill);
      if (nextBill.payment_status === 'paid') setPaymentRecorded(false);
      setMethod(nextBill.payments.at(-1)?.method || 'cash');
      if (nextBill.payment_status !== 'paid' && canTakeOrder) {
        const [menuResponse, categoryResponse] = await Promise.all([
          listMenuItems(),
          listCategories(),
        ]);
        setMenuItems(menuResponse.menu_items || []);
        setCategories(categoryResponse.categories || []);
        if (undeliveredOrderItems(nextBill.items).length > 0) setEditing(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('โหลดบิลไม่สำเร็จ', 'Could not load the bill'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [canAccessBill, canTakeOrder, copy, orderId, validOrderId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const activeItems = useMemo(() => activeOrderItems(bill?.items), [bill?.items]);
  const itemCount = useMemo(
    () => activeItems.reduce((sum, item) => sum + item.quantity, 0),
    [activeItems],
  );
  const undelivered = useMemo(() => undeliveredOrderItems(activeItems), [activeItems]);
  const paymentReady = canTakeOrderPayment(activeItems);
  const paymentStage = bill
    ? billPaymentStage(bill.payment_status, paymentRecorded)
    : 'due';
  const canEditBill = paymentStage === 'due' && canTakeOrder;
  const filteredMenu = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const categoryMatch = categoryId === 'all'
        || item.category_id === Number(categoryId)
        || item.categories?.some((link) => link.category_id === Number(categoryId));
      const searchMatch = !keyword
        || [item.name, item.description].some(
          (value) => String(value || '').toLowerCase().includes(keyword),
        );
      return categoryMatch && searchMatch;
    });
  }, [categoryId, menuItems, search]);

  async function refreshBillAfterMutation(successMessage: string) {
    setMessage(successMessage);
    try {
      setBill(await getBill(orderId));
    } catch (err) {
      setError(err instanceof Error
        ? copy(`${successMessage} แต่โหลดบิลล่าสุดไม่สำเร็จ: ${err.message}`, `${successMessage}, but the latest bill could not be loaded: ${err.message}`)
        : copy(`${successMessage} แต่โหลดบิลล่าสุดไม่สำเร็จ`, `${successMessage}, but the latest bill could not be loaded`));
    }
  }

  async function addServedItem(item: MenuItem) {
    if (!bill || !canEditBill || saving || !item.is_available || hasRequiredOptions(item)) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await addOrderItem(orderId, {
        menu_id: item.ID,
        quantity: 1,
        serve_immediately: true,
        fulfillment_type: bill.order.order_type === 'takeaway' ? 'takeaway' : 'dine_in',
      });
      await refreshBillAfterMutation(copy('เพิ่มรายการที่เสิร์ฟแล้ว', 'Served item added'));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('เพิ่มรายการไม่สำเร็จ', 'Could not add the item'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelBillItem() {
    if (!cancelTarget || !canEditBill || saving) return;
    const validation = validateKitchenCancelReason(cancelReason);
    if (validation.error === 'required') {
      setError(copy('กรอกเหตุผลที่นำรายการออกจากบิล', 'Enter a reason for removing the item from the bill.'));
      return;
    }
    if (validation.error === 'too_long') {
      setError(copy('เหตุผลต้องไม่เกิน 500 ตัวอักษร', 'The reason must be 500 characters or fewer.'));
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateOrderItemStatus(orderId, cancelTarget.ID, 'cancelled', validation.reason);
      setCancelTarget(null);
      setCancelReason('');
      await refreshBillAfterMutation(copy('นำรายการออกจากบิลแล้ว', 'Item removed from the bill'));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('นำรายการออกจากบิลไม่สำเร็จ', 'Could not remove the item from the bill'));
    } finally {
      setSaving(false);
    }
  }

  async function pay() {
    if (!bill || !canPay || !paymentReady || paymentRecorded) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await payOrder(orderId, {
        method,
        received_amount: paymentReceivedAmount(method, bill.grand_total),
        note: note.trim(),
      });
      setPaymentRecorded(true);
      setEditing(false);
      setAdding(false);
      setCancelTarget(null);
      setCancelReason('');
      setMessage(copy('รับชำระเงินเรียบร้อย', 'Payment recorded'));
      try {
        const paidBill = await getBill(orderId);
        setBill(paidBill);
        if (paidBill.payment_status === 'paid') setPaymentRecorded(false);
      } catch (err) {
        setError(err instanceof Error
          ? copy(
            `รับชำระเงินแล้ว แต่โหลดใบเสร็จล่าสุดไม่สำเร็จ: ${err.message}`,
            `Payment was recorded, but the latest receipt could not be loaded: ${err.message}`,
          )
          : copy(
            'รับชำระเงินแล้ว แต่โหลดใบเสร็จล่าสุดไม่สำเร็จ',
            'Payment was recorded, but the latest receipt could not be loaded',
          ));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('บันทึกการชำระเงินไม่สำเร็จ', 'Could not record the payment'));
    } finally {
      setSaving(false);
    }
  }

  async function shareReceipt() {
    if (!bill || !canAccessBill) return;
    await Share.share({
      title: copy(`ใบเสร็จ ${bill.order.order_number}`, `Receipt ${bill.order.order_number}`),
      message: buildReceiptShareText(bill, activeMembership?.restaurant, language),
    });
  }

  if (!canAccessBill) {
    return (
      <AppScreen title={copy('บิลและการชำระเงิน', 'Bill and payment')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์ดูบิล', 'No permission to view bills')}
          detail={copy('ต้องมีสิทธิ์รับออเดอร์ ดูออเดอร์ หรือรับชำระเงิน', 'The take_order, view_orders, or take_payment permission is required.')}
        />
      </AppScreen>
    );
  }

  if (!validOrderId) {
    return (
      <AppScreen title={copy('บิลและการชำระเงิน', 'Bill and payment')} topLevel={false}>
        <EmptyState
          title={copy('ไม่พบบิลนี้', 'Bill not found')}
          detail={copy('รหัสออเดอร์ไม่ถูกต้อง กรุณากลับไปเลือกรายการใหม่', 'The order ID is invalid. Go back and choose an order again.')}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('บิลและการชำระเงิน', 'Bill and payment')}
      subtitle={bill
        ? `${bill.order.order_number} · ${money(bill.grand_total, language)}`
        : loading
          ? copy('กำลังโหลดบิล', 'Loading bill')
          : copy('ไม่พบบิล', 'Bill unavailable')}
      topLevel={false}
      action={bill ? (
        <StatusBadge
          label={paymentStage === 'paid'
            ? copy('ชำระแล้ว', 'Paid')
            : paymentStage === 'recorded'
              ? copy('บันทึกยอดแล้ว', 'Payment recorded')
              : copy('รอชำระ', 'Payment due')}
          tone={paymentStage === 'due' ? 'warning' : 'success'}
        />
      ) : undefined}
    >
      {error ? <Feedback title={copy('ทำรายการไม่สำเร็จ', 'Could not complete this action')} detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}

      {!loading && !bill && !error ? (
        <EmptyState
          title={copy('ไม่พบบิลนี้', 'Bill not found')}
          detail={copy('ออเดอร์อาจถูกลบหรือไม่มีสิทธิ์เข้าถึง', 'The order may no longer exist or be unavailable.')}
        />
      ) : null}

      {bill ? (
        <>
          <Surface>
            <SectionHeader
              title={bill.order.table?.display_label || (bill.order.order_type === 'takeaway' ? copy('ซื้อกลับบ้าน', 'Takeaway') : bill.order.order_number)}
              detail={copy(`${itemCount.toLocaleString('th-TH')} รายการ`, `${itemCount.toLocaleString('en-US')} items`)}
              action={canEditBill ? (
                <Button
                  compact
                  variant={editing ? 'primary' : 'secondary'}
                  label={editing ? copy('เสร็จสิ้น', 'Done') : copy('แก้รายการ', 'Edit items')}
                  onPress={() => {
                    setEditing((value) => !value);
                    setAdding(false);
                    setCancelTarget(null);
                    setCancelReason('');
                  }}
                />
              ) : undefined}
            />

            {activeItems.map((item, index) => (
              <View key={item.ID}>
                {index ? <Divider /> : null}
                <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                  <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                    <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
                      <Text selectable style={typeScale.cardTitle}>{item.menu_name}</Text>
                      <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                        {copy(`จำนวน ${item.quantity.toLocaleString('th-TH')}`, `Quantity ${item.quantity.toLocaleString('en-US')}`)}
                        {item.selected_options?.length ? ` · ${item.selected_options.map((option) => option.option_name).join(', ')}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                      <Text selectable style={typeScale.number}>{money(item.subtotal, language)}</Text>
                      <StatusBadge label={itemStatusLabel(item.status, language)} tone={itemTone(item.status)} />
                    </View>
                  </View>

                  {editing && canEditBill ? (
                    cancelTarget?.ID === item.ID ? (
                      <View style={{ gap: spacing.sm }}>
                        <TextField
                          label={copy('เหตุผลที่นำออกจากบิล', 'Reason for removing this item')}
                          value={cancelReason}
                          onChangeText={setCancelReason}
                          multiline
                        />
                        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                          <Button
                            variant="secondary"
                            label={copy('เก็บรายการไว้', 'Keep item')}
                            onPress={() => {
                              setCancelTarget(null);
                              setCancelReason('');
                            }}
                            style={{ flex: 1 }}
                          />
                          <Button
                            variant="danger"
                            label={copy('ยืนยันนำออก', 'Remove item')}
                            onPress={cancelBillItem}
                            loading={saving}
                            disabled={!cancelReason.trim()}
                            style={{ flex: 1 }}
                          />
                        </View>
                      </View>
                    ) : (
                      <Button
                        compact
                        variant="secondary"
                        label={copy('นำออกจากบิล', 'Remove from bill')}
                        onPress={() => {
                          setCancelTarget(item);
                          setCancelReason('');
                          setAdding(false);
                        }}
                      />
                    )
                  ) : null}
                </View>
              </View>
            ))}

            {!activeItems.length ? (
              <EmptyState
                title={copy('ไม่มีรายการที่เรียกเก็บเงิน', 'No billable items')}
                detail={copy('เพิ่มรายการที่เสิร์ฟแล้ว หรือกลับไปจัดการออเดอร์นี้', 'Add a served item or return to manage this order.')}
              />
            ) : null}

            {editing && canEditBill ? (
              <Button
                variant="secondary"
                label={adding ? copy('กลับไปดูบิล', 'Back to bill') : copy('เพิ่มรายการที่เสิร์ฟแล้ว', 'Add served item')}
                onPress={() => {
                  setAdding((value) => !value);
                  setCancelTarget(null);
                  setCancelReason('');
                }}
              />
            ) : null}
          </Surface>

          {adding && editing && canEditBill ? (
            <Surface>
              <SectionHeader
                title={copy('เพิ่มรายการที่เสิร์ฟแล้ว', 'Add a served item')}
                detail={copy('รายการนี้จะไม่ส่งเข้าครัวและจะพร้อมคิดเงินทันที', 'This item skips the kitchen and is immediately ready for payment.')}
              />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={copy('ค้นหาเมนู', 'Search menu')}
                placeholderTextColor={palette.placeholder}
                style={inputStyles.input}
              />
              <ChipGroup
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { label: copy('ทั้งหมด', 'All'), value: 'all' },
                  ...categories
                    .filter((category) => category.is_active)
                    .map((category) => ({ label: category.name, value: String(category.ID) })),
                ]}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {filteredMenu.map((item) => {
                  const requiresOptions = hasRequiredOptions(item);
                  const disabled = saving || !item.is_available || requiresOptions;
                  return (
                    <Pressable
                      key={item.ID}
                      disabled={disabled}
                      onPress={() => {
                        void addServedItem(item);
                      }}
                      style={({ pressed }) => ({
                        minWidth: 148,
                        minHeight: 112,
                        flexGrow: 1,
                        flexBasis: 160,
                        gap: spacing.sm,
                        borderWidth: 1,
                        borderColor: palette.border,
                        borderRadius: radius.md,
                        backgroundColor: palette.surface,
                        padding: spacing.lg,
                        opacity: disabled ? 0.46 : pressed ? 0.74 : 1,
                      })}
                    >
                      <Text selectable numberOfLines={2} style={typeScale.cardTitle}>{item.name}</Text>
                      <View style={{ flex: 1 }} />
                      <Text selectable style={typeScale.number}>{money(item.price, language)}</Text>
                      {!item.is_available ? <Text style={[typeScale.caption, { color: palette.danger }]}>{copy('หมด', 'Sold out')}</Text> : null}
                      {requiresOptions ? <Text style={[typeScale.caption, { color: palette.warning }]}>{copy('มีตัวเลือกบังคับ', 'Requires options')}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
              {!filteredMenu.length ? (
                <EmptyState
                  title={copy('ไม่พบเมนู', 'No menu items found')}
                  detail={copy('ลองเปลี่ยนหมวดหรือคำค้น', 'Try another category or search.')}
                />
              ) : null}
            </Surface>
          ) : null}

          <Surface>
            <SectionHeader title={copy('สรุปยอด', 'Bill summary')} />
            {[
              [copy('ยอดอาหาร', 'Food subtotal'), money(bill.subtotal, language)],
              bill.discount_amount ? [copy('ส่วนลด', 'Discount'), `−${money(bill.discount_amount, language)}`] : null,
              bill.service_charge_enabled ? [copy(`ค่าบริการ ${bill.service_charge_rate.toLocaleString('th-TH')}%`, `Service charge ${bill.service_charge_rate.toLocaleString('en-US')}%`), money(bill.service_charge_amount, language)] : null,
              bill.vat_enabled ? [`VAT ${bill.vat_rate.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}%`, money(bill.vat_amount, language)] : null,
            ].filter(Boolean).map((row) => (
              <View key={String(row?.[0])} style={{ flexDirection: 'row', gap: spacing.md }}>
                <Text selectable style={[typeScale.body, { flex: 1, color: palette.muted }]}>{row?.[0]}</Text>
                <Text selectable style={typeScale.cardTitle}>{row?.[1]}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.lg }}>
              <Text selectable style={[typeScale.title, { flex: 1 }]}>{copy('ยอดสุทธิ', 'Grand total')}</Text>
              <Text selectable style={[typeScale.number, { fontSize: 26 }]}>{money(bill.grand_total, language)}</Text>
            </View>
          </Surface>

          {paymentStage === 'due' && canPay ? (
            <Surface>
              <SectionHeader
                title={copy('รับชำระเงิน', 'Take payment')}
                detail={copy('เลือกวิธีและตรวจยอดก่อนยืนยัน', 'Choose a method and check the total before confirming.')}
              />
              {undelivered.length > 0 ? (
                <Feedback
                  title={copy('ยังมีรายการที่ครัวทำไม่เสร็จ', 'Some items are still being prepared')}
                  detail={copy('นำรายการที่ส่งมอบไม่ได้ออกจากบิล หรือรอให้ครัวทำเสร็จก่อนรับเงิน', 'Remove unfulfilled items from the bill or wait until the kitchen finishes before taking payment.')}
                  tone="warning"
                />
              ) : null}
              <ChipGroup
                value={method}
                onChange={setMethod}
                options={[
                  { label: copy('เงินสด', 'Cash'), value: 'cash' },
                  { label: 'PromptPay QR', value: 'promptpay_qr' },
                ]}
              />
              {method === 'cash' ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
                  <Text selectable style={[typeScale.body, { flex: 1, color: palette.muted }]}>
                    {copy('รับเงินสดตามยอดสุทธิ', 'Collect the exact grand total in cash')}
                  </Text>
                  <Text selectable style={[typeScale.number, { fontSize: 24 }]}>{money(bill.grand_total, language)}</Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center', gap: spacing.md }}>
                  {bill.promptpay_qr_image ? (
                    <Image
                      source={{ uri: resolveImage(bill.promptpay_qr_image) }}
                      resizeMode="contain"
                      style={{ width: 220, height: 220, borderRadius: radius.md, backgroundColor: palette.surfaceSubtle }}
                    />
                  ) : (
                    <Feedback title={copy('ร้านยังไม่ได้ตั้งค่า QR PromptPay', 'PromptPay QR is not configured for this restaurant')} tone="warning" />
                  )}
                  <Text selectable style={typeScale.cardTitle}>{bill.promptpay_name || 'PromptPay'}</Text>
                  <Text selectable style={[typeScale.number, { fontSize: 24 }]}>{money(bill.grand_total, language)}</Text>
                </View>
              )}
              <TextField label={copy('หมายเหตุการรับเงิน', 'Payment note')} value={note} onChangeText={setNote} />
              <Button
                label={copy('ยืนยันรับชำระเงิน', 'Confirm payment')}
                onPress={pay}
                loading={saving}
                disabled={!paymentReady}
              />
            </Surface>
          ) : paymentStage === 'paid' ? (
            <Surface>
              <SectionHeader
                title={copy('ชำระเงินเรียบร้อย', 'Payment complete')}
                detail={copy('ออเดอร์ปิดแล้ว สามารถแชร์ใบเสร็จให้ลูกค้าได้', 'The order is closed. You can share the receipt with the guest.')}
              />
              <Button variant="secondary" label={copy('แชร์ใบเสร็จ', 'Share receipt')} onPress={shareReceipt} />
              <Button
                label={canTakeOrder
                  ? copy('กลับไปหน้าโต๊ะ', 'Back to tables')
                  : canViewOrders
                    ? copy('กลับไปคลังออเดอร์', 'Back to orders')
                    : copy('กลับหน้าหลัก', 'Back to home')}
                onPress={() => resetRouteStack(
                  router,
                  billExitRoute(canTakeOrder, canViewOrders),
                )}
              />
            </Surface>
          ) : paymentStage === 'recorded' ? (
            <Surface>
              <SectionHeader
                title={copy('รับชำระเงินแล้ว', 'Payment recorded')}
                detail={copy(
                  'ระบบบันทึกยอดแล้ว แต่ยังโหลดใบเสร็จล่าสุดไม่สำเร็จ เพื่อป้องกันการรับเงินซ้ำ กรุณาลองโหลดใบเสร็จอีกครั้ง',
                  'The payment is recorded, but the latest receipt did not load. To prevent a duplicate payment, try loading the receipt again.',
                )}
              />
              <Button
                variant="secondary"
                label={copy('ลองอีกครั้ง', 'Try again')}
                onPress={() => { void load(); }}
                loading={loading}
              />
            </Surface>
          ) : (
            <Feedback
              title={copy('ดูบิลได้ แต่รับชำระเงินไม่ได้', 'You can view this bill but cannot take payment')}
              detail={copy('กรุณาให้แคชเชียร์หรือผู้จัดการดำเนินการต่อ', 'Ask a cashier or manager to continue.')}
              tone="info"
            />
          )}
        </>
      ) : null}
    </AppScreen>
  );
}
