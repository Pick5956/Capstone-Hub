import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Share, View } from 'react-native';

import { apiUrl } from '@/src/api/client';
import { getBill, payOrder } from '@/src/api/order';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, EmptyState, Feedback, SectionHeader, StatusBadge, Surface, TextField } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { paymentReceivedAmount } from '@/src/lib/order-workflow';
import { can } from '@/src/lib/rbac';
import { buildReceiptShareText } from '@/src/lib/receipt';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Bill } from '@/src/types/order';

function resolveImage(value: string) { if (!value) return ''; if (value.startsWith('http')) return value; return `${apiUrl}${value.startsWith('/') ? '' : '/'}${value}`; }

export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const canPay = can(activeMembership, 'take_payment');
  const canViewOrders = can(activeMembership, 'view_orders');
  const orderId = Number(id);
  const [bill, setBill] = useState<Bill | null>(null);
  const [method, setMethod] = useState<'cash' | 'promptpay_qr'>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { if (!canViewOrders) return; setError(null); try { setBill(await getBill(orderId)); } catch (err) { setError(err instanceof Error ? err.message : copy('โหลดบิลไม่สำเร็จ', 'Could not load the bill')); } }, [canViewOrders, copy, orderId]);
  useEffect(() => { load(); }, [load]);

  async function pay() {
    if (!bill || !canPay) return;
    setSaving(true); setError(null); setMessage(null);
    try { await payOrder(orderId, { method, received_amount: paymentReceivedAmount(method, bill.grand_total), note: note.trim() }); await load(); setMessage(copy('บันทึกการชำระเงินและปิดออเดอร์แล้ว', 'Payment recorded and order closed')); }
    catch (err) { setError(err instanceof Error ? err.message : copy('บันทึกการชำระเงินไม่สำเร็จ', 'Could not record the payment')); }
    finally { setSaving(false); }
  }

  async function shareReceipt() {
    if (!bill || !canViewOrders) return;
    await Share.share({
      title: copy(`ใบเสร็จ ${bill.order.order_number}`, `Receipt ${bill.order.order_number}`),
      message: buildReceiptShareText(bill, activeMembership?.restaurant, language),
    });
  }

  if (!canViewOrders) {
    return <AppScreen title={copy('บิลและการชำระเงิน', 'Bill and payment')} topLevel={false}><EmptyState title={copy('ไม่มีสิทธิ์ดูบิล', 'No permission to view bills')} detail={copy('ต้องมีสิทธิ์ view_orders', 'The view_orders permission is required.')} /></AppScreen>;
  }

  return (
    <AppScreen title={copy('บิลและการชำระเงิน', 'Bill and payment')} subtitle={bill ? `${bill.order.order_number} · ${money(bill.grand_total, language)}` : copy('กำลังโหลดบิล', 'Loading bill')} topLevel={false} action={bill ? <StatusBadge label={bill.payment_status === 'paid' ? copy('ชำระแล้ว', 'Paid') : copy('รอชำระ', 'Payment due')} tone={bill.payment_status === 'paid' ? 'success' : 'warning'} /> : undefined}>
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Could not complete this action')} detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}
      {bill ? (
        <>
          <Surface>
            <SectionHeader title={bill.order.table?.display_label || (bill.order.order_type === 'takeaway' ? copy('ซื้อกลับบ้าน', 'Takeaway') : bill.order.order_number)} detail={copy(`${bill.items.length.toLocaleString('th-TH')} รายการ`, `${bill.items.length.toLocaleString('en-US')} items`)} />
            {bill.items.map((item, index) => <View key={item.ID}>{index ? <Divider /> : null}<View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><View style={{ flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{item.menu_name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{copy(`จำนวน ${item.quantity.toLocaleString('th-TH')}`, `Quantity ${item.quantity.toLocaleString('en-US')}`)}{item.selected_options?.length ? ` · ${item.selected_options.map((option) => option.option_name).join(', ')}` : ''}</Text></View><Text selectable style={typeScale.number}>{money(item.subtotal, language)}</Text></View></View>)}
            <Divider />
            {[
              [copy('ยอดอาหาร', 'Food subtotal'), money(bill.subtotal, language)],
              bill.discount_amount ? [copy('ส่วนลด', 'Discount'), `−${money(bill.discount_amount, language)}`] : null,
              bill.service_charge_enabled ? [copy(`ค่าบริการ ${bill.service_charge_rate.toLocaleString('th-TH')}%`, `Service charge ${bill.service_charge_rate.toLocaleString('en-US')}%`), money(bill.service_charge_amount, language)] : null,
              bill.vat_enabled ? [`VAT ${bill.vat_rate.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}%`, money(bill.vat_amount, language)] : null,
            ].filter(Boolean).map((row) => <View key={String(row?.[0])} style={{ flexDirection: 'row', gap: spacing.md }}><Text selectable style={[typeScale.body, { flex: 1, color: palette.muted }]}>{row?.[0]}</Text><Text selectable style={typeScale.cardTitle}>{row?.[1]}</Text></View>)}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.lg }}><Text selectable style={[typeScale.title, { flex: 1 }]}>{copy('ยอดสุทธิ', 'Grand total')}</Text><Text selectable style={[typeScale.number, { fontSize: 26 }]}>{money(bill.grand_total, language)}</Text></View>
          </Surface>

          {bill.payment_status !== 'paid' && canPay ? (
            <Surface>
              <SectionHeader title={copy('รับชำระเงิน', 'Take payment')} detail={copy('เลือกวิธีและตรวจยอดก่อนยืนยัน', 'Choose a method and check the total before confirming.')} />
              <ChipGroup value={method} onChange={setMethod} options={[{ label: copy('เงินสด', 'Cash'), value: 'cash' }, { label: 'PromptPay QR', value: 'promptpay_qr' }]} />
              {method === 'cash' ? <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}><Text selectable style={[typeScale.body, { flex: 1, color: palette.muted }]}>{copy('รับเงินสดตามยอดสุทธิ', 'Collect the exact grand total in cash')}</Text><Text selectable style={[typeScale.number, { fontSize: 24 }]}>{money(bill.grand_total, language)}</Text></View> : <View style={{ alignItems: 'center', gap: spacing.md }}>{bill.promptpay_qr_image ? <Image source={{ uri: resolveImage(bill.promptpay_qr_image) }} resizeMode="contain" style={{ width: 220, height: 220, borderRadius: radius.md, backgroundColor: palette.surfaceSubtle }} /> : <Feedback title={copy('ร้านยังไม่ได้ตั้งค่า QR PromptPay', 'PromptPay QR is not configured for this restaurant')} tone="warning" />}<Text selectable style={typeScale.cardTitle}>{bill.promptpay_name || 'PromptPay'}</Text><Text selectable style={[typeScale.number, { fontSize: 24 }]}>{money(bill.grand_total, language)}</Text></View>}
              <TextField label={copy('หมายเหตุการรับเงิน', 'Payment note')} value={note} onChangeText={setNote} />
              <Button label={copy('ยืนยันรับชำระเงิน', 'Confirm payment')} onPress={pay} loading={saving} />
            </Surface>
          ) : bill.payment_status === 'paid' ? (
            <Surface>
              <SectionHeader title={copy('ชำระเงินเรียบร้อย', 'Payment complete')} detail={copy('ระบบปิดออเดอร์และคืนโต๊ะว่างแล้ว แชร์ใบเสร็จให้ลูกค้าได้ทันที', 'The order is closed and the table is available. You can share the receipt now.')} />
              {bill.payments.at(-1) ? <View style={{ gap: spacing.sm }}><View style={{ flexDirection: 'row' }}><Text style={[typeScale.body, { flex: 1, color: palette.muted }]}>{copy('วิธีชำระ', 'Payment method')}</Text><Text style={typeScale.cardTitle}>{bill.payments.at(-1)?.method === 'cash' ? copy('เงินสด', 'Cash') : 'PromptPay QR'}</Text></View></View> : null}
              <Button variant="secondary" label={copy('แชร์ / พิมพ์ใบเสร็จ', 'Share / print receipt')} onPress={shareReceipt} />
            </Surface>
          ) : (
            <Feedback
              title={copy('ดูบิลได้ แต่รับชำระเงินไม่ได้', 'You can view this bill but cannot take payment')}
              detail={copy('บัญชีนี้ไม่มีสิทธิ์รับชำระเงิน กรุณาให้แคชเชียร์หรือผู้จัดการดำเนินการ', 'This account cannot take payments. Ask a cashier or manager to continue.')}
              tone="info"
            />
          )}
        </>
      ) : null}
    </AppScreen>
  );
}
