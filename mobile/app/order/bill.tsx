import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Share, Text, View } from 'react-native';

import { apiUrl } from '@/src/api/client';
import { closeOrder, getBill, payOrder } from '@/src/api/order';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Divider, Feedback, SectionHeader, StatusBadge, Surface, TextField } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Bill } from '@/src/types/order';

function resolveImage(value: string) { if (!value) return ''; if (value.startsWith('http')) return value; return `${apiUrl}${value.startsWith('/') ? '' : '/'}${value}`; }

export default function BillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const [bill, setBill] = useState<Bill | null>(null);
  const [method, setMethod] = useState<'cash' | 'promptpay_qr'>('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { setError(null); try { const response = await getBill(orderId); setBill(response); if (!receivedAmount) setReceivedAmount(String(response.grand_total)); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดบิลไม่สำเร็จ'); } }, [orderId, receivedAmount]);
  useEffect(() => { load(); }, [load]);
  const received = Number.parseFloat(receivedAmount || '0') || 0;
  const change = useMemo(() => Math.max(0, received - Number(bill?.grand_total || 0)), [bill, received]);

  async function pay() {
    if (!bill) return;
    if (method === 'cash' && received < bill.grand_total) { setError('จำนวนเงินที่รับน้อยกว่ายอดชำระ'); return; }
    setSaving(true); setError(null); setMessage(null);
    try { await payOrder(orderId, { method, received_amount: method === 'cash' ? received : bill.grand_total, note: note.trim() }); await load(); setMessage('บันทึกการชำระเงินแล้ว'); }
    catch (err) { setError(err instanceof Error ? err.message : 'บันทึกการชำระเงินไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  async function close() {
    setSaving(true); setError(null);
    try { await closeOrder(orderId); router.replace('/orders'); }
    catch (err) { setError(err instanceof Error ? err.message : 'ปิดออเดอร์ไม่สำเร็จ'); setSaving(false); }
  }

  async function shareReceipt() {
    if (!bill) return;
    const order = bill.order;
    const lines = [
      order.order_number,
      order.table?.display_label || (order.order_type === 'takeaway' ? 'ซื้อกลับบ้าน' : ''),
      ...bill.items.map((item) => `${item.quantity} x ${item.menu_name}  ${money(item.subtotal)}`),
      `รวม ${money(bill.subtotal)}`,
      bill.service_charge_enabled ? `ค่าบริการ ${money(bill.service_charge_amount)}` : '',
      bill.vat_enabled ? `VAT ${money(bill.vat_amount)}` : '',
      `ยอดสุทธิ ${money(bill.grand_total)}`,
      bill.payment_status === 'paid' ? 'ชำระแล้ว' : 'ยังไม่ชำระ',
    ].filter(Boolean);
    await Share.share({ title: `ใบเสร็จ ${order.order_number}`, message: lines.join('\n') });
  }

  return (
    <AppScreen title="บิลและการชำระเงิน" subtitle={bill ? `${bill.order.order_number} · ${money(bill.grand_total)}` : 'กำลังโหลดบิล'} topLevel={false} action={bill ? <StatusBadge label={bill.payment_status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'} tone={bill.payment_status === 'paid' ? 'success' : 'warning'} /> : undefined}>
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}
      {message ? <Feedback title={message} tone="success" /> : null}
      {bill ? (
        <>
          <Surface>
            <SectionHeader title={bill.order.table?.display_label || (bill.order.order_type === 'takeaway' ? 'ซื้อกลับบ้าน' : bill.order.order_number)} detail={`${bill.items.length} รายการ`} />
            {bill.items.map((item, index) => <View key={item.ID}>{index ? <Divider /> : null}<View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><View style={{ flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{item.menu_name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>จำนวน {item.quantity}{item.selected_options?.length ? ` · ${item.selected_options.map((option) => option.option_name).join(', ')}` : ''}</Text></View><Text selectable style={typeScale.number}>{money(item.subtotal)}</Text></View></View>)}
            <Divider />
            {[
              ['ยอดอาหาร', money(bill.subtotal)],
              bill.discount_amount ? ['ส่วนลด', `−${money(bill.discount_amount)}`] : null,
              bill.service_charge_enabled ? [`ค่าบริการ ${bill.service_charge_rate}%`, money(bill.service_charge_amount)] : null,
              bill.vat_enabled ? [`VAT ${bill.vat_rate}%`, money(bill.vat_amount)] : null,
            ].filter(Boolean).map((row) => <View key={String(row?.[0])} style={{ flexDirection: 'row', gap: spacing.md }}><Text selectable style={[typeScale.body, { flex: 1, color: palette.muted }]}>{row?.[0]}</Text><Text selectable style={typeScale.cardTitle}>{row?.[1]}</Text></View>)}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.lg }}><Text selectable style={[typeScale.title, { flex: 1 }]}>ยอดสุทธิ</Text><Text selectable style={[typeScale.number, { fontSize: 26 }]}>{money(bill.grand_total)}</Text></View>
          </Surface>

          {bill.payment_status !== 'paid' ? (
            <Surface>
              <SectionHeader title="รับชำระเงิน" detail="เลือกวิธีและตรวจยอดก่อนยืนยัน" />
              <ChipGroup value={method} onChange={setMethod} options={[{ label: 'เงินสด', value: 'cash' }, { label: 'QR PromptPay', value: 'promptpay_qr' }]} />
              {method === 'cash' ? <><TextField label="จำนวนเงินที่รับ" value={receivedAmount} onChangeText={setReceivedAmount} keyboardType="decimal-pad" /><View style={{ flexDirection: 'row', gap: spacing.md }}><Text selectable style={[typeScale.title, { flex: 1 }]}>เงินทอน</Text><Text selectable style={[typeScale.number, { fontSize: 22 }]}>{money(change)}</Text></View></> : <View style={{ alignItems: 'center', gap: spacing.md }}>{bill.promptpay_qr_image ? <Image source={{ uri: resolveImage(bill.promptpay_qr_image) }} resizeMode="contain" style={{ width: 220, height: 220, borderRadius: radius.md, backgroundColor: palette.surfaceSubtle }} /> : <Feedback title="ร้านยังไม่ได้ตั้งค่า QR PromptPay" tone="warning" />}<Text selectable style={typeScale.cardTitle}>{bill.promptpay_name || 'PromptPay'}</Text><Text selectable style={[typeScale.number, { fontSize: 24 }]}>{money(bill.grand_total)}</Text></View>}
              <TextField label="หมายเหตุการรับเงิน" value={note} onChangeText={setNote} />
              <Button label="ยืนยันรับชำระเงิน" onPress={pay} loading={saving} />
            </Surface>
          ) : (
            <Surface>
              <SectionHeader title="ชำระเงินเรียบร้อย" detail="แชร์ใบเสร็จผ่านเมนูระบบ หรือปิดออเดอร์เพื่อคืนโต๊ะเป็นว่าง" />
              {bill.payments.at(-1) ? <View style={{ gap: spacing.sm }}><View style={{ flexDirection: 'row' }}><Text style={[typeScale.body, { flex: 1, color: palette.muted }]}>วิธีชำระ</Text><Text style={typeScale.cardTitle}>{bill.payments.at(-1)?.method === 'cash' ? 'เงินสด' : 'QR PromptPay'}</Text></View>{bill.payments.at(-1)?.change_amount ? <View style={{ flexDirection: 'row' }}><Text style={[typeScale.body, { flex: 1, color: palette.muted }]}>เงินทอน</Text><Text style={typeScale.cardTitle}>{money(bill.payments.at(-1)?.change_amount || 0)}</Text></View> : null}</View> : null}
              <Button variant="secondary" label="แชร์ / พิมพ์ใบเสร็จ" onPress={shareReceipt} />
              {bill.order.status !== 'completed' ? <Button label="ปิดออเดอร์" onPress={close} loading={saving} /> : null}
            </Surface>
          )}
        </>
      ) : null}
    </AppScreen>
  );
}
