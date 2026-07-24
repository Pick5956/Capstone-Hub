import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { listTables, updateTableStatus } from '@/src/api/table';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import type { RestaurantTable } from '@/src/types/table';

export default function TableReservationScreen() {
  const { tableId: rawId } = useLocalSearchParams<{ tableId?: string }>();
  const [tables, setTables] = useState<RestaurantTable[]>([]); const [tableId, setTableId] = useState(Number(rawId || 0)); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => { listTables().then((response) => { setTables(response.tables || []); const selected = response.tables.find((item) => item.ID === Number(rawId)); if (selected) { setTableId(selected.ID); setName(selected.reservation_name || ''); setPhone(selected.reservation_phone || ''); } }).catch((err) => setError(err instanceof Error ? err.message : 'โหลดโต๊ะไม่สำเร็จ')); }, [rawId]);
  const selected = tables.find((item) => item.ID === tableId) || null;
  const options = useMemo(() => tables.filter((item) => item.status === 'free' || item.status === 'reserved' || item.ID === tableId).map((item) => ({ label: `${item.display_label || item.table_number}${item.status === 'reserved' ? ' · จองแล้ว' : ''}`, value: item.ID })), [tableId, tables]);
  function choose(id: number) { setTableId(id); const item = tables.find((current) => current.ID === id); setName(item?.reservation_name || ''); setPhone(item?.reservation_phone || ''); setConfirmCancel(false); }
  async function reserve() { if (!tableId || phone.replace(/\D/g, '').length < 9) { setError('เลือกโต๊ะและกรอกเบอร์โทรอย่างน้อย 9 หลัก'); return; } setSaving(true); setError(null); try { await updateTableStatus(tableId, 'reserved', phone.trim(), name.trim()); router.back(); } catch (err) { setError(err instanceof Error ? err.message : 'จองโต๊ะไม่สำเร็จ'); } finally { setSaving(false); } }
  async function cancel() { if (!selected) return; if (!confirmCancel) { setConfirmCancel(true); return; } setSaving(true); setError(null); try { await updateTableStatus(selected.ID, 'free'); router.back(); } catch (err) { setError(err instanceof Error ? err.message : 'ยกเลิกการจองไม่สำเร็จ'); setSaving(false); } }
  return <AppScreen title={selected?.status === 'reserved' ? 'รายละเอียดการจอง' : 'จองโต๊ะ'} subtitle="บันทึกชื่อและเบอร์โทรให้หน้าร้านตรวจสอบก่อนรับลูกค้า" topLevel={false}>{error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}<Surface><SectionHeader title="ข้อมูลการจอง" /><ChipGroup label="โต๊ะ" value={tableId} onChange={choose} options={options} /><TextField label="ชื่อเล่นที่จอง (ไม่บังคับ)" value={name} onChangeText={setName} /><TextField label="เบอร์โทรที่จอง" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Button label={selected?.status === 'reserved' ? 'บันทึกข้อมูลการจอง' : 'ยืนยันจองโต๊ะ'} onPress={reserve} loading={saving} /></Surface>{selected?.status === 'reserved' ? <Surface><SectionHeader title="ยกเลิกการจอง" detail={confirmCancel ? 'แตะยืนยันอีกครั้ง โต๊ะจะกลับเป็นสถานะว่าง' : 'ใช้เมื่อยกเลิกนัดหรือพร้อมเปิดโต๊ะให้ลูกค้าทั่วไป'} /><Button variant={confirmCancel ? 'danger' : 'secondary'} label={confirmCancel ? 'ยืนยันยกเลิกการจอง' : 'ยกเลิกการจอง'} onPress={cancel} loading={saving} /></Surface> : null}</AppScreen>;
}
