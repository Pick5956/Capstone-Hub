import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { createOrder } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { AppText as Text } from '@/src/components/app-text';
import { AppIcon } from '@/src/components/app-icon';
import { AppScreen } from '@/src/components/app-shell';
import { ActionDock, Button, ChipGroup, EmptyState, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { canOpenDineInOrder } from '@/src/lib/table-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';
import type { RestaurantTable } from '@/src/types/table';

export default function NewOrderScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const params = useLocalSearchParams<{
    tableId?: string;
    type?: string;
    customerCount?: string;
    customerName?: string;
    customerPhone?: string;
  }>();
  const tableId = Number(params.tableId || 0);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [tableResolved, setTableResolved] = useState(!tableId);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>(params.type === 'takeaway' ? 'takeaway' : 'dine_in');
  const [customerCount, setCustomerCount] = useState(params.customerCount || '1');
  const [customerName, setCustomerName] = useState(params.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(params.customerPhone || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canTakeOrder || !tableId) {
      setTableResolved(true);
      return;
    }
    setTableResolved(false);
    listTables()
      .then((response) => {
        const next = response.tables.find((item) => item.ID === tableId) || null;
        setTable(next);
        setTableResolved(true);
        if (!next) {
          setError(copy('ไม่พบโต๊ะที่เลือก กรุณากลับไปเลือกโต๊ะใหม่', 'The selected table was not found. Go back and choose a table again.'));
        }
        if (next && !params.customerCount) {
          setCustomerCount(String(Math.max(1, Math.min(next.capacity || 1, 6))));
        }
      })
      .catch((err) => {
        setTableResolved(true);
        setError(
          err instanceof Error
            ? err.message
            : copy('โหลดข้อมูลโต๊ะไม่สำเร็จ', 'Could not load table details'),
        );
      });
  }, [canTakeOrder, copy, params.customerCount, tableId]);
  async function submit() {
    if (!canTakeOrder) return;
    if (orderType === 'dine_in' && !canOpenDineInOrder(tableId, Boolean(table))) {
      setError(copy('เลือกโต๊ะที่ใช้งานได้ก่อนเปิดออเดอร์', 'Choose a valid table before opening the order.'));
      return;
    }
    setSaving(true); setError(null);
    try {
      const takeaway = orderType === 'takeaway';
      const order = await createOrder({
        table_id: takeaway ? null : tableId,
        order_type: orderType,
        customer_count: Math.max(1, Number.parseInt(customerCount || '1', 10) || 1),
        // Guest name and phone belong to takeaway only: a dine-in order is
        // identified by its table, and web POS sends neither field for dine-in.
        customer_name: takeaway ? customerName.trim() : '',
        customer_phone: takeaway ? customerPhone.trim() : '',
        note: note.trim(),
      });
      router.replace({ pathname: '/order/[id]', params: { id: String(order.ID) } });
    } catch (err) { setError(err instanceof Error ? err.message : copy('เปิดออเดอร์ไม่สำเร็จ', 'Could not open the order')); }
    finally { setSaving(false); }
  }
  if (!canTakeOrder) return <AppScreen title={copy('เปิดออเดอร์', 'Open order')} topLevel={false}><EmptyState title={copy('ไม่มีสิทธิ์รับออเดอร์', 'No order-taking permission')} /></AppScreen>;
  return (
    <AppScreen
      title={orderType === 'takeaway' ? copy('ออเดอร์ซื้อกลับบ้าน', 'Takeaway order') : copy(`เปิด ${table?.display_label || 'โต๊ะ'}`, `Open ${table?.display_label || 'table'}`)}
      subtitle={orderType === 'takeaway'
        ? copy('ระบุข้อมูลลูกค้าก่อนเลือกเมนู', 'Add guest details before choosing menu items')
        : copy('ยืนยันจำนวนลูกค้าก่อนเลือกเมนู', 'Confirm the guest count before choosing menu items')}
      topLevel={false}
      footer={!tabletWorkspace ? <ActionDock><Button icon="arrow-forward" label={copy('เปิดออเดอร์', 'Open order')} onPress={submit} loading={saving} disabled={orderType === 'dine_in' && !canOpenDineInOrder(tableId, Boolean(table))} /></ActionDock> : undefined}
    >
      {error ? <Feedback title={copy('เปิดออเดอร์ไม่ได้', 'Could not open the order')} detail={error} tone="danger" /> : null}
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        <Surface style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 0.8 : undefined }}>
          <SectionHeader title={copy('ประเภทออเดอร์', 'Order type')} action={<AppIcon color={palette.muted} name={orderType === 'takeaway' ? 'bag-handle-outline' : 'restaurant-outline'} size={22} />} />
          <ChipGroup value={orderType} onChange={setOrderType} options={[{ label: copy('ทานที่ร้าน', 'Dine-in'), value: 'dine_in' }, { label: copy('ซื้อกลับบ้าน', 'Takeaway'), value: 'takeaway' }]} />
          {orderType === 'dine_in' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}><AppIcon color={palette.text} name="restaurant-outline" size={22} /><View style={{ flex: 1 }}><Text selectable style={typeScale.cardTitle}>{table?.display_label || (tableResolved ? copy('ไม่พบโต๊ะ', 'Table not found') : copy('กำลังโหลดโต๊ะ', 'Loading table'))}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{table ? copy(`${table.capacity.toLocaleString('th-TH')} ที่นั่ง`, `${table.capacity.toLocaleString('en-US')} seats`) : '−'}</Text></View></View> : null}
        </Surface>
        <Surface style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 1.2 : undefined }}>
          <TextField icon="people-outline" label={copy('จำนวนลูกค้า', 'Guest count')} value={customerCount} onChangeText={setCustomerCount} keyboardType="number-pad" maxLength={4} />
          {orderType === 'takeaway' ? (
            <>
              <TextField icon="person-outline" label={copy('ชื่อลูกค้า (ไม่บังคับ)', 'Customer name (optional)')} placeholder={copy('เช่น คุณแนน', 'For example, Nan')} value={customerName} onChangeText={setCustomerName} maxLength={80} />
              <TextField icon="call-outline" label={copy('เบอร์ลูกค้า (ไม่บังคับ)', 'Customer phone (optional)')} placeholder={copy('เช่น 081-234-5678', 'For example, 081-234-5678')} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" maxLength={32} />
            </>
          ) : null}
          <TextField label={copy('หมายเหตุออเดอร์', 'Order note')} value={note} onChangeText={setNote} multiline maxLength={1000} />
          {tabletWorkspace ? <Button icon="arrow-forward" label={copy('เปิดออเดอร์', 'Open order')} onPress={submit} loading={saving} disabled={orderType === 'dine_in' && !canOpenDineInOrder(tableId, Boolean(table))} /> : null}
        </Surface>
      </View>
    </AppScreen>
  );
}
