import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { createRestaurant } from '@/src/api/restaurant';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, ChipGroup, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { timeOrDefault, toInt } from '@/src/lib/forms';
import { useAuth } from '@/src/providers/auth-provider';
import { spacing } from '@/src/theme';

export default function CreateRestaurantScreen() {
  const { refreshMemberships, setActiveRestaurantFromMembership, user } = useAuth(); const [name, setName] = useState(''); const [branch, setBranch] = useState('สำนักงานใหญ่'); const [type, setType] = useState('restaurant'); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [open, setOpen] = useState('10:00'); const [close, setClose] = useState('22:00'); const [tables, setTables] = useState('0'); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit() { if (!user) { router.replace('/login'); return; } if (!name.trim()) { setError('กรอกชื่อร้านก่อน'); return; } setSaving(true); setError(null); try { const response = await createRestaurant({ name: name.trim(), branch_name: branch.trim() || 'สำนักงานใหญ่', restaurant_type: type, phone: phone.trim(), address: address.trim(), open_time: timeOrDefault(open, '10:00'), close_time: timeOrDefault(close, '22:00'), table_count: toInt(tables, 0) }); await refreshMemberships(); await setActiveRestaurantFromMembership(response.membership); router.replace('/home'); } catch (err) { setError(err instanceof Error ? err.message : 'สร้างร้านไม่สำเร็จ'); } finally { setSaving(false); } }
  return <AuthScreen title="สร้างร้าน" subtitle="ระบบจะตั้งคุณเป็นเจ้าของร้านและเตรียมข้อมูลเริ่มต้นตามประเภทร้าน" showBack>{error ? <Feedback title="สร้างร้านไม่ได้" detail={error} tone="danger" /> : null}<Surface><SectionHeader title="ข้อมูลร้าน" /><TextField label="ชื่อร้าน" value={name} onChangeText={setName} /><TextField label="สาขา" value={branch} onChangeText={setBranch} /><ChipGroup label="ประเภทร้าน" value={type} onChange={setType} options={[{ label: 'ร้านอาหาร', value: 'restaurant' }, { label: 'คาเฟ่', value: 'cafe' }, { label: 'บาร์', value: 'bar' }, { label: 'ฟาสต์ฟู้ด', value: 'fast_food' }]} /><TextField label="เบอร์โทรร้าน" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><TextField label="ที่อยู่" value={address} onChangeText={setAddress} multiline /><View style={{ flexDirection: 'row', gap: spacing.md }}><View style={{ flex: 1 }}><TextField label="เวลาเปิด" value={open} onChangeText={setOpen} /></View><View style={{ flex: 1 }}><TextField label="เวลาปิด" value={close} onChangeText={setClose} /></View></View><TextField label="จำนวนโต๊ะเริ่มต้น" value={tables} onChangeText={setTables} keyboardType="number-pad" /><Button label="สร้างร้านและเริ่มใช้งาน" onPress={submit} loading={saving} /></Surface></AuthScreen>;
}
