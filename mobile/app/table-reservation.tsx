import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { listTables, updateTableStatus } from '@/src/api/table';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { reservationArrivalPlan } from '@/src/lib/table-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import type { RestaurantTable } from '@/src/types/table';

export default function TableReservationScreen() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
  const { tableId: rawId } = useLocalSearchParams<{ tableId?: string }>();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [tableId, setTableId] = useState(Number(rawId || 0));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!canTakeOrder) return;
    listTables()
      .then((response) => {
        setTables(response.tables || []);
        const selectedTable = response.tables.find((item) => item.ID === Number(rawId));
        if (selectedTable) {
          setTableId(selectedTable.ID);
          setName(selectedTable.reservation_name || '');
          setPhone(selectedTable.reservation_phone || '');
        }
      })
      .catch((err) => setError(
        err instanceof Error
          ? err.message
          : copy('โหลดโต๊ะไม่สำเร็จ', 'Could not load tables'),
      ));
  }, [canTakeOrder, copy, rawId]);

  const selected = tables.find((item) => item.ID === tableId) || null;
  const options = useMemo(
    () => tables
      .filter((item) => item.status === 'free' || item.status === 'reserved' || item.ID === tableId)
      .map((item) => ({
        label: `${item.display_label || item.table_number}${item.status === 'reserved' ? copy(' · จองแล้ว', ' · Reserved') : ''}`,
        value: item.ID,
      })),
    [copy, tableId, tables],
  );

  function choose(id: number) {
    setTableId(id);
    const item = tables.find((current) => current.ID === id);
    setName(item?.reservation_name || '');
    setPhone(item?.reservation_phone || '');
    setConfirmCancel(false);
  }

  async function reserve() {
    if (!canTakeOrder) return;
    if (!tableId || phone.replace(/\D/g, '').length < 9) {
      setError(copy(
        'เลือกโต๊ะและกรอกเบอร์โทรอย่างน้อย 9 หลัก',
        'Choose a table and enter a phone number with at least 9 digits.',
      ));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTableStatus(tableId, 'reserved', phone.trim(), name.trim());
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('จองโต๊ะไม่สำเร็จ', 'Could not reserve the table'));
    } finally {
      setSaving(false);
    }
  }

  async function acceptReservation() {
    if (!canTakeOrder || !selected) return;
    const plan = reservationArrivalPlan(selected.ID);
    setSaving(true);
    setError(null);
    try {
      await updateTableStatus(selected.ID, plan.tableStatus);
      router.replace(plan.route as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy(
        'รับลูกค้าและเปิดออเดอร์ไม่สำเร็จ',
        'Could not seat the guests and open an order',
      ));
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!canTakeOrder || !selected) return;
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTableStatus(selected.ID, 'free');
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy('ยกเลิกการจองไม่สำเร็จ', 'Could not cancel the reservation'));
    } finally {
      setSaving(false);
    }
  }

  if (!canTakeOrder) {
    return (
      <AppScreen title={copy('จองโต๊ะ', 'Table reservation')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์รับออเดอร์', 'No order-taking permission')}
          detail={copy('ต้องมีสิทธิ์ take_order เพื่อจัดการการจองโต๊ะ', 'The take_order permission is required to manage table reservations.')}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={selected?.status === 'reserved'
        ? copy('รายละเอียดการจอง', 'Reservation details')
        : copy('จองโต๊ะ', 'Table reservation')}
      subtitle={copy(
        'บันทึกชื่อและเบอร์โทรให้หน้าร้านตรวจสอบก่อนรับลูกค้า',
        'Save a name and phone number so front-of-house staff can verify the reservation.',
      )}
      topLevel={false}
    >
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Could not complete this action')} detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title={copy('ข้อมูลการจอง', 'Reservation details')} />
        <ChipGroup label={copy('โต๊ะ', 'Table')} value={tableId} onChange={choose} options={options} />
        <TextField label={copy('ชื่อเล่นที่จอง (ไม่บังคับ)', 'Reservation name (optional)')} value={name} onChangeText={setName} />
        <TextField label={copy('เบอร์โทรที่จอง', 'Reservation phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Button
          variant={selected?.status === 'reserved' ? 'secondary' : 'primary'}
          label={selected?.status === 'reserved'
            ? copy('บันทึกข้อมูลการจอง', 'Save reservation details')
            : copy('ยืนยันจองโต๊ะ', 'Confirm reservation')}
          onPress={reserve}
          loading={saving}
        />
      </Surface>
      {selected?.status === 'reserved' ? (
        <>
          <Surface>
            <SectionHeader
              title={copy('รับลูกค้า', 'Seat guests')}
              detail={copy(
                'คืนสถานะโต๊ะเป็นว่าง แล้วไปตรวจจำนวนลูกค้าก่อนเปิดออเดอร์',
                'Free the reserved table, then confirm the guest count before opening an order.',
              )}
            />
            <Button label={copy('รับลูกค้าและเปิดออเดอร์', 'Seat guests and open order')} onPress={acceptReservation} loading={saving} />
          </Surface>
          <Surface>
            <SectionHeader
              title={copy('ยกเลิกการจอง', 'Cancel reservation')}
              detail={confirmCancel
                ? copy('แตะยืนยันอีกครั้ง โต๊ะจะกลับเป็นสถานะว่าง', 'Confirm once more to return the table to available.')
                : copy('ใช้เมื่อลูกค้ายกเลิกนัดและต้องการคืนโต๊ะให้ลูกค้าทั่วไป', 'Use this when guests cancel and the table should become available again.')}
            />
            <Button
              variant={confirmCancel ? 'danger' : 'secondary'}
              label={confirmCancel
                ? copy('ยืนยันยกเลิกการจอง', 'Confirm reservation cancellation')
                : copy('ยกเลิกการจอง', 'Cancel reservation')}
              onPress={cancel}
              loading={saving}
            />
          </Surface>
        </>
      ) : null}
    </AppScreen>
  );
}
