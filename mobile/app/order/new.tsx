import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { createOrder } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { spacing, typeScale } from '@/src/theme';
import type { RestaurantTable } from '@/src/types/table';

export default function NewOrderScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
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
  useEffect(() => { if (canTakeOrder && tableId) listTables().then((response) => { const next = response.tables.find((item) => item.ID === tableId) || null; setTable(next); if (next) setCustomerCount(String(Math.max(1, Math.min(next.capacity || 1, 6)))); }).catch((err) => setError(err instanceof Error ? err.message : copy('โหลดข้อมูลโต๊ะไม่สำเร็จ', 'Could not load table details'))); }, [canTakeOrder, copy, tableId]);
  async function submit() {
    if (!canTakeOrder) return;
    setSaving(true); setError(null);
    try {
      const order = await createOrder({ table_id: orderType === 'dine_in' ? tableId : null, order_type: orderType, customer_count: Math.max(1, Number.parseInt(customerCount || '1', 10) || 1), customer_name: customerName.trim(), customer_phone: customerPhone.trim(), note: note.trim() });
      router.replace({ pathname: '/order/[id]', params: { id: String(order.ID) } });
    } catch (err) { setError(err instanceof Error ? err.message : copy('เปิดออเดอร์ไม่สำเร็จ', 'Could not open the order')); }
    finally { setSaving(false); }
  }
  if (!canTakeOrder) return <AppScreen title={copy('เปิดออเดอร์', 'Open order')} topLevel={false}><EmptyState title={copy('ไม่มีสิทธิ์รับออเดอร์', 'No order-taking permission')} detail={copy('ต้องมีสิทธิ์ take_order', 'The take_order permission is required.')} /></AppScreen>;
  return (
    <AppScreen title={orderType === 'takeaway' ? copy('ออเดอร์ซื้อกลับบ้าน', 'Takeaway order') : copy(`เปิด ${table?.display_label || 'โต๊ะ'}`, `Open ${table?.display_label || 'table'}`)} subtitle={copy('ตรวจรายละเอียดก่อนเริ่มเพิ่มรายการอาหาร', 'Check the details before adding menu items.')} topLevel={false}>
      {error ? <Feedback title={copy('เปิดออเดอร์ไม่ได้', 'Could not open the order')} detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title={copy('ประเภทออเดอร์', 'Order type')} />
        <ChipGroup value={orderType} onChange={setOrderType} options={[{ label: copy('ทานที่ร้าน', 'Dine-in'), value: 'dine_in' }, { label: copy('ซื้อกลับบ้าน', 'Takeaway'), value: 'takeaway' }]} />
        {orderType === 'dine_in' ? <View style={{ flexDirection: 'row', gap: spacing.md }}><View style={{ flex: 1 }}><Text selectable style={typeScale.cardTitle}>{table?.display_label || copy('กำลังโหลดโต๊ะ', 'Loading table')}</Text><Text selectable style={typeScale.caption}>{table ? copy(`${table.capacity.toLocaleString('th-TH')} ที่นั่ง`, `${table.capacity.toLocaleString('en-US')} seats`) : '−'}</Text></View></View> : null}
        <TextField label={copy('จำนวนลูกค้า', 'Guest count')} value={customerCount} onChangeText={setCustomerCount} keyboardType="number-pad" />
        <TextField label={copy('ชื่อลูกค้า (ไม่บังคับ)', 'Customer name (optional)')} value={customerName} onChangeText={setCustomerName} />
        <TextField label={copy('เบอร์โทร (ไม่บังคับ)', 'Phone number (optional)')} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
        <TextField label={copy('หมายเหตุออเดอร์', 'Order note')} value={note} onChangeText={setNote} multiline />
        <Button label={copy('เปิดออเดอร์และเลือกเมนู', 'Open order and choose menu items')} onPress={submit} loading={saving} disabled={orderType === 'dine_in' && !tableId} />
      </Surface>
    </AppScreen>
  );
}
