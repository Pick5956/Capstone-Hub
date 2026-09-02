import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import {
  cancelReservation,
  reserveTable,
} from '@/src/api/reservation';
import { createOrder } from '@/src/api/order';
import { listTables } from '@/src/api/table';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import {
  ActionDock,
  Button,
  ChipGroup,
  EmptyState,
  Feedback,
  SectionHeader,
  StatusBadge,
  Surface,
  TextField,
} from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { reservationArrivalOrderInput } from '@/src/lib/table-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';
import type { RestaurantTable } from '@/src/types/table';

function defaultGuestCount(table: RestaurantTable | null | undefined) {
  return String(Math.max(1, Math.min(table?.capacity || 1, 6)));
}

export default function TableReservationScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const { tableId: rawId } = useLocalSearchParams<{ tableId?: string }>();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [tableId, setTableId] = useState(Number(rawId || 0));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guestCount, setGuestCount] = useState('1');
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
          setGuestCount(defaultGuestCount(selectedTable));
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
    const item = tables.find((current) => current.ID === id);
    setTableId(id);
    setName(item?.reservation_name || '');
    setPhone(item?.reservation_phone || '');
    setGuestCount(defaultGuestCount(item));
    setConfirmCancel(false);
    setError(null);
  }

  async function reserve() {
    if (!canTakeOrder || selected?.status === 'reserved') return;
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
      await reserveTable(tableId, {
        reservation_phone: phone.trim(),
        reservation_name: name.trim(),
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('จองโต๊ะไม่สำเร็จ', 'Could not reserve the table'));
    } finally {
      setSaving(false);
    }
  }

  async function acceptReservation() {
    if (!canTakeOrder || !selected || selected.status !== 'reserved') return;
    const input = reservationArrivalOrderInput(selected.ID, {
      customerCount: guestCount,
      customerName: selected.reservation_name || name,
      customerPhone: selected.reservation_phone || phone,
    });
    setSaving(true);
    setError(null);
    try {
      const order = await createOrder(input);
      router.replace({
        pathname: '/order/[id]',
        params: { id: String(order.ID) },
      });
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy(
          'รับลูกค้าและเปิดออเดอร์ไม่สำเร็จ',
          'Could not seat the guests and open an order',
        ));
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!canTakeOrder || !selected || selected.status !== 'reserved') return;
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await cancelReservation(selected.ID);
      router.back();
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('ยกเลิกการจองไม่สำเร็จ', 'Could not cancel the reservation'));
    } finally {
      setSaving(false);
    }
  }

  if (!canTakeOrder) {
    return (
      <AppScreen title={copy('จองโต๊ะ', 'Table reservation')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์รับออเดอร์', 'No order-taking permission')}
          detail={copy(
            'ต้องมีสิทธิ์รับออเดอร์เพื่อจัดการการจองโต๊ะ',
            'Order-taking permission is required to manage table reservations.',
          )}
        />
      </AppScreen>
    );
  }

  const isReserved = selected?.status === 'reserved';

  return (
    <AppScreen
      title={isReserved
        ? copy('รายละเอียดการจอง', 'Reservation details')
        : copy('จองโต๊ะ', 'Table reservation')}
      subtitle={isReserved
        ? copy('ตรวจข้อมูลก่อนเปิดออเดอร์', 'Check the details before opening an order')
        : copy('บันทึกชื่อและเบอร์โทรผู้จอง', 'Save the guest name and phone number')}
      topLevel={false}
      footer={!tabletWorkspace && !confirmCancel ? (
        <ActionDock>
          <Button
            icon={isReserved ? 'restaurant-outline' : 'calendar-outline'}
            label={isReserved ? copy('รับลูกค้าและเปิดออเดอร์', 'Seat guests and open order') : copy('ยืนยันจองโต๊ะ', 'Confirm reservation')}
            onPress={() => { if (isReserved) void acceptReservation(); else void reserve(); }}
            loading={saving}
          />
        </ActionDock>
      ) : undefined}
    >
      {error ? (
        <Feedback
          title={copy('ทำรายการไม่ได้', 'Could not complete this action')}
          detail={error}
          tone="danger"
        />
      ) : null}
      <View style={{ flexDirection: tabletWorkspace && isReserved ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
      <Surface style={{ width: tabletWorkspace && isReserved ? undefined : '100%', minWidth: 0, flex: tabletWorkspace && isReserved ? 1.2 : undefined }}>
        <SectionHeader title={copy('ข้อมูลการจอง', 'Reservation details')} />
        <ChipGroup
          label={copy('โต๊ะ', 'Table')}
          value={tableId}
          onChange={choose}
          options={options}
        />
        {isReserved ? (
          <>
            <StatusBadge label={copy('กำลังจอง', 'Active reservation')} tone="info" />
            <View style={{ gap: spacing.sm }}>
              <View style={{ gap: 2 }}>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                  {copy('ชื่อผู้จอง', 'Guest name')}
                </Text>
                <Text selectable style={typeScale.cardTitle}>
                  {name || copy('ไม่ระบุชื่อ', 'No guest name')}
                </Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                  {copy('เบอร์โทร', 'Phone')}
                </Text>
                <Text selectable style={typeScale.body}>{phone || '−'}</Text>
              </View>
            </View>
            <TextField
              icon="people-outline"
              label={copy('จำนวนลูกค้า', 'Guest count')}
              value={guestCount}
              onChangeText={setGuestCount}
              keyboardType="number-pad"
              maxLength={4}
            />
          </>
        ) : (
          <>
            <TextField
              icon="person-outline"
              label={copy('ชื่อเล่นที่จอง (ไม่บังคับ)', 'Reservation name (optional)')}
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
            <TextField
              icon="call-outline"
              label={copy('เบอร์โทรที่จอง', 'Reservation phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={32}
            />
            {tabletWorkspace ? <Button
              icon="calendar-outline"
              label={copy('ยืนยันจองโต๊ะ', 'Confirm reservation')}
              onPress={() => { void reserve(); }}
              loading={saving}
            /> : null}
          </>
        )}
      </Surface>
      {isReserved ? (
        <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 0.8 : undefined, gap: spacing.lg }}>
          <Surface>
            <SectionHeader
              title={copy('รับลูกค้า', 'Seat guests')}
              detail={copy('เปิดออเดอร์แล้วเลือกเมนูต่อ', 'Open the order, then choose menu items.')}
              action={<AppIcon color={palette.muted} name="restaurant-outline" size={22} />}
            />
            {tabletWorkspace ? <Button
              icon="restaurant-outline"
              label={copy('รับลูกค้าและเปิดออเดอร์', 'Seat guests and open order')}
              onPress={() => { void acceptReservation(); }}
              loading={saving}
            /> : null}
          </Surface>
          <Surface>
            <SectionHeader
              title={copy('ยกเลิกการจอง', 'Cancel reservation')}
              detail={confirmCancel
                ? copy(
                  'แตะยืนยันอีกครั้ง โต๊ะจะกลับเป็นสถานะว่าง',
                  'Confirm once more to return the table to available.',
                )
                : copy(
                  'ใช้เมื่อลูกค้ายกเลิกหรือไม่มาตามนัด',
                  'Use this when guests cancel or do not arrive.',
                )}
            />
            <Button
              icon="close-circle-outline"
              variant={confirmCancel ? 'danger' : 'secondary'}
              label={confirmCancel
                ? copy('ยืนยันยกเลิกการจอง', 'Confirm reservation cancellation')
                : copy('ยกเลิกการจอง', 'Cancel reservation')}
              onPress={() => { void cancel(); }}
              loading={saving}
            />
          </Surface>
        </View>
      ) : null}
      </View>
    </AppScreen>
  );
}
