import { useEffect, useState } from 'react';

import { updateProfile } from '@/src/api/auth';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';

export default function AccountSettingsScreen() {
  const { user, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [nickname, setNickname] = useState(''); const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setFirstName(user?.first_name || ''); setLastName(user?.last_name || ''); setNickname(user?.nickname || ''); setPhone(user?.phone || ''); }, [user]);
  async function save() { if (!firstName.trim() || !lastName.trim()) { setError('กรอกชื่อและนามสกุลให้ครบ'); return; } setSaving(true); setError(null); setMessage(null); try { await updateProfile({ first_name: firstName.trim(), last_name: lastName.trim(), nickname: nickname.trim(), phone: phone.trim() }); await refreshProfile(); setMessage('บันทึกข้อมูลบัญชีแล้ว'); } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกบัญชีไม่สำเร็จ'); } finally { setSaving(false); } }
  return <AppScreen title="บัญชีของฉัน" subtitle={user?.email || 'ข้อมูลผู้ใช้งาน'} topLevel={false}>{error ? <Feedback title="บันทึกไม่ได้" detail={error} tone="danger" /> : null}{message ? <Feedback title={message} tone="success" /> : null}<Surface><SectionHeader title="ข้อมูลส่วนตัว" /><TextField label="ชื่อ" value={firstName} onChangeText={setFirstName} /><TextField label="นามสกุล" value={lastName} onChangeText={setLastName} /><TextField label="ชื่อเล่น" value={nickname} onChangeText={setNickname} /><TextField label="เบอร์โทร" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Button label="บันทึกข้อมูลบัญชี" onPress={save} loading={saving} /></Surface><Surface><SectionHeader title="วิธีเข้าสู่ระบบ" detail={user?.auth_provider === 'google' ? 'บัญชีนี้เชื่อมกับ Google' : 'บัญชีนี้ใช้รหัสผ่าน'} /></Surface></AppScreen>;
}
