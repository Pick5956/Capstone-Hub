import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { acceptInvitation, getInvitationByToken } from '@/src/api/restaurant';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import type { Invitation } from '@/src/types/restaurant';

export default function InviteTokenScreen() {
  const { token } = useLocalSearchParams<{ token: string }>(); const { refreshMemberships, setActiveRestaurantFromMembership, user } = useAuth(); const [invitation, setInvitation] = useState<Invitation | null>(null); const [usable, setUsable] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!token) return; setError(null); try { const response = await getInvitationByToken(token); setInvitation(response.invitation); setUsable(response.usable); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดคำเชิญไม่สำเร็จ'); } finally { setLoading(false); } }, [token]);
  useEffect(() => { load(); }, [load]);
  if (!token) return <Redirect href="/restaurants" />;
  async function accept() { if (!user) { router.push('/login'); return; } setLoading(true); setError(null); try { const response = await acceptInvitation(token); await refreshMemberships(); await setActiveRestaurantFromMembership(response.membership); router.replace('/home'); } catch (err) { setError(err instanceof Error ? err.message : 'รับคำเชิญไม่สำเร็จ'); setLoading(false); } }
  return <AuthScreen title="คำเชิญเข้าร้าน" subtitle={invitation?.restaurant?.name || invitation?.email || 'กำลังตรวจคำเชิญ'} showBack>{error ? <Feedback title="ตรวจคำเชิญไม่ได้" detail={error} tone="danger" /> : null}{invitation ? <Surface><SectionHeader title={invitation.restaurant?.name || `ร้าน #${invitation.restaurant_id}`} detail={`บทบาท: ${invitation.role?.display_name || invitation.role?.name || 'พนักงาน'}`} action={<StatusBadge label={usable ? 'พร้อมรับคำเชิญ' : invitation.status} tone={usable ? 'success' : 'danger'} />} />{!user ? <Feedback title="ต้องเข้าสู่ระบบก่อน" detail="ถ้ายังไม่มีบัญชี ให้สร้างบัญชีด้วยอีเมลเดียวกับคำเชิญ" tone="info" /> : null}<Button label={user ? 'รับคำเชิญและเข้าร้าน' : 'เข้าสู่ระบบเพื่อรับคำเชิญ'} onPress={accept} loading={loading} disabled={!usable} />{!user ? <Button variant="secondary" label="สร้างบัญชีใหม่" onPress={() => router.push('/register' as never)} /> : null}</Surface> : null}</AuthScreen>;
}
