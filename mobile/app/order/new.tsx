import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { createOrder } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { spacing, typeScale } from '@/src/theme';
import type { RestaurantTable } from '@/src/types/table';

export default function NewOrderScreen() {
  const params = useLocalSearchParams<{ tableId?: string; type?: string }>();
  const tableId = Number(params.tableId || 0);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>(params.type === 'takeaway' ? 'takeaway' : 'dine_in');
  const [customerCount, setCustomerCount] = useState('1');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (tableId) listTables().then((response) => { const next = response.tables.find((item) => item.ID === tableId) || null; setTable(next); if (next) setCustomerCount(String(Math.max(1, Math.min(next.capacity || 1, 6)))); }).catch((err) => setError(err instanceof Error ? err.message : 'โหลดข้อมูลโต๊ะไม่สำเร็จ')); }, [tableId]);
  async function submit() {
    setSaving(true); setError(null);
    try {
      const order = await createOrder({ table_id: orderType === 'dine_in' ? tableId : null, order_type: orderType, customer_count: Math.max(1, Number.parseInt(customerCount || '1', 10) || 1), customer_name: customerName.trim(), customer_phone: customerPhone.trim(), note: note.trim() });
      router.replace({ pathname: '/order/[id]', params: { id: String(order.ID) } });
    } catch (err) { setError(err instanceof Error ? err.message : 'เปิดออเดอร์ไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  return (
    <AppScreen title={orderType === 'takeaway' ? 'ออเดอร์ซื้อกลับบ้าน' : `เปิด ${table?.display_label || 'โต๊ะ'}`} subtitle="ตรวจรายละเอียดก่อนเริ่มเพิ่มรายการอาหาร" topLevel={false}>
      {error ? <Feedback title="เปิดออเดอร์ไม่ได้" detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title="ประเภทออเดอร์" />
        <ChipGroup value={orderType} onChange={setOrderType} options={[{ label: 'ทานที่ร้าน', value: 'dine_in' }, { label: 'ซื้อกลับบ้าน', value: 'takeaway' }]} />
        {orderType === 'dine_in' ? <View style={{ flexDirection: 'row', gap: spacing.md }}><View style={{ flex: 1 }}><Text selectable style={typeScale.cardTitle}>{table?.display_label || 'กำลังโหลดโต๊ะ'}</Text><Text selectable style={typeScale.caption}>{table?.capacity || '-'} ที่นั่ง</Text></View></View> : null}
        <TextField label="จำนวนลูกค้า" value={customerCount} onChangeText={setCustomerCount} keyboardType="number-pad" />
        <TextField label="ชื่อลูกค้า (ไม่บังคับ)" value={customerName} onChangeText={setCustomerName} />
        <TextField label="เบอร์โทร (ไม่บังคับ)" value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
        <TextField label="หมายเหตุออเดอร์" value={note} onChangeText={setNote} multiline />
        <Button label="เปิดออเดอร์และเลือกเมนู" onPress={submit} loading={saving} disabled={orderType === 'dine_in' && !tableId} />
      </Surface>
    </AppScreen>
  );
}
