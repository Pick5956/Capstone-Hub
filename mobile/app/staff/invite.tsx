import { useEffect, useMemo, useState } from 'react';
import { Share } from 'react-native';

import { getRoles } from '@/src/api/auth';
import { createInvitation } from '@/src/api/restaurant';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import type { Role } from '@/src/types/restaurant';

const webUrl = (process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://dishy.pro').replace(/\/$/, '');

export default function InviteStaffScreen() {
  const { activeMembership } = useAuth(); const restaurantId = activeMembership?.restaurant_id;
  const [roles, setRoles] = useState<Role[]>([]); const [roleId, setRoleId] = useState(0); const [email, setEmail] = useState(''); const [days, setDays] = useState(0);
  const [link, setLink] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { getRoles().then((response) => { const available = (response.data || []).filter((role) => role.name !== 'owner'); setRoles(available); setRoleId(available.find((role) => role.name === 'waiter')?.ID || available[0]?.ID || 0); }).catch((err) => setError(err instanceof Error ? err.message : 'โหลดบทบาทไม่สำเร็จ')); }, []);
  const roleOptions = useMemo(() => roles.map((role) => ({ label: role.display_name || role.name, value: role.ID })), [roles]);
  async function create() { if (!restaurantId || !roleId) return; setSaving(true); setError(null); try { const invitation = await createInvitation(restaurantId, { role_id: roleId, email: email.trim() || undefined, expires_in_days: days }); setLink(`${webUrl}/invitations/${invitation.token}`); } catch (err) { setError(err instanceof Error ? err.message : 'สร้างคำเชิญไม่สำเร็จ'); } finally { setSaving(false); } }
  return <AppScreen title="เชิญพนักงาน" subtitle="สร้างลิงก์ให้พนักงานเปิดและยืนยันจากมือถือของตน" topLevel={false}>{error ? <Feedback title="สร้างคำเชิญไม่ได้" detail={error} tone="danger" /> : null}{link ? <Surface><SectionHeader title="ลิงก์พร้อมใช้งาน" detail={link} /><Button label="แชร์ลิงก์เชิญ" onPress={() => Share.share({ title: 'คำเชิญเข้าร่วม Restaurant Hub', message: link })} /><Button variant="secondary" label="สร้างลิงก์ใหม่" onPress={() => setLink('')} /></Surface> : <Surface><SectionHeader title="ข้อมูลคำเชิญ" /><TextField label="อีเมล (ไม่บังคับ)" value={email} onChangeText={setEmail} keyboardType="email-address" /><ChipGroup label="บทบาท" value={roleId} onChange={setRoleId} options={roleOptions} /><ChipGroup label="อายุลิงก์" value={days} onChange={setDays} options={[{ label: 'ไม่หมดอายุ', value: 0 }, { label: '1 วัน', value: 1 }, { label: '7 วัน', value: 7 }, { label: '30 วัน', value: 30 }]} /><Button label="สร้างลิงก์เชิญ" onPress={create} loading={saving} /></Surface>}</AppScreen>;
}
