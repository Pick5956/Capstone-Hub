import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Share, Text, View } from 'react-native';

import { listMembers, listPendingInvitations, revokeInvitation } from '@/src/api/restaurant';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Divider, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { palette, spacing, typeScale } from '@/src/theme';
import type { Invitation, Membership } from '@/src/types/restaurant';

const webUrl = (process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://dishy.pro').replace(/\/$/, '');

export default function StaffScreen() {
  const { activeMembership } = useAuth(); const restaurantId = activeMembership?.restaurant_id;
  const [members, setMembers] = useState<Membership[]>([]); const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const load = useCallback(async () => { if (!restaurantId) return; setLoading(true); setError(null); try { const [memberResponse, invitationResponse] = await Promise.all([listMembers(restaurantId), listPendingInvitations(restaurantId)]); setMembers(memberResponse.members || []); setInvitations(invitationResponse.invitations || []); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดทีมงานไม่สำเร็จ'); } finally { setLoading(false); } }, [restaurantId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function revoke(invitation: Invitation) { if (!restaurantId) return; if (confirmRevokeId !== invitation.ID) { setConfirmRevokeId(invitation.ID); return; } try { await revokeInvitation(restaurantId, invitation.ID); setConfirmRevokeId(null); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'ยกเลิกคำเชิญไม่สำเร็จ'); } }
  async function share(invitation: Invitation) { await Share.share({ title: 'คำเชิญเข้าร่วม Restaurant Hub', message: `${webUrl}/invitations/${invitation.token}` }); }
  return (
    <AppScreen title="พนักงานและสิทธิ์" subtitle={`${members.length} คน · ${invitations.length} คำเชิญที่รอใช้งาน`} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} action={<Button compact label="เชิญพนักงาน" onPress={() => router.push('/staff/invite' as never)} />}>
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title="ทีมงาน" detail="แตะชื่อเพื่อเปลี่ยนบทบาท สถานะ และสิทธิ์เฉพาะคน" action={<Button compact variant="secondary" label="บทบาท" onPress={() => router.push('/staff/roles' as never)} />} />
        {members.map((member, index) => <View key={member.ID}>{index ? <Divider /> : null}<Pressable onPress={() => router.push({ pathname: '/staff/member' as never, params: { id: String(member.ID) } } as never)} style={({ pressed }) => ({ minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: pressed ? 0.72 : 1 })}><View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: palette.surfaceStrong }}><Text style={{ color: palette.text, fontWeight: '800' }}>{(member.user?.nickname || member.user?.first_name || 'U').slice(0, 1)}</Text></View><View style={{ minWidth: 0, flex: 1, gap: 2 }}><Text selectable numberOfLines={1} style={typeScale.cardTitle}>{member.user?.nickname || `${member.user?.first_name || ''} ${member.user?.last_name || ''}`.trim() || member.user?.email || `ผู้ใช้ #${member.user_id}`}</Text><Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{member.user?.email || '-'} · {member.role?.display_name || member.role?.name || 'พนักงาน'}</Text></View><StatusBadge label={member.status === 'active' ? 'ใช้งาน' : member.status === 'suspended' ? 'พักสิทธิ์' : 'นำออก'} tone={member.status === 'active' ? 'success' : member.status === 'suspended' ? 'warning' : 'neutral'} /><Text style={{ color: palette.muted, fontSize: 20 }}>›</Text></Pressable></View>)}
        {!members.length && !loading ? <EmptyState title="ยังไม่มีพนักงาน" detail="สร้างลิงก์เชิญเพื่อเพิ่มทีมงานเข้าร้าน" /> : null}
      </Surface>
      {invitations.length ? <Surface><SectionHeader title="คำเชิญที่ยังใช้ได้" />{invitations.map((invitation, index) => <View key={invitation.ID}>{index ? <Divider /> : null}<View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><View style={{ flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{invitation.email || 'ลิงก์เชิญทั่วไป'}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{invitation.role?.display_name || invitation.role?.name || 'พนักงาน'}</Text></View><Button compact variant="secondary" label="แชร์" onPress={() => share(invitation)} /></View><View style={{ flexDirection: 'row', gap: spacing.sm }}>{confirmRevokeId === invitation.ID ? <Button compact variant="secondary" label="ยกเลิก" onPress={() => setConfirmRevokeId(null)} style={{ flex: 1 }} /> : null}<Button compact variant={confirmRevokeId === invitation.ID ? 'danger' : 'ghost'} label={confirmRevokeId === invitation.ID ? 'ยืนยันยกเลิกลิงก์' : 'ยกเลิกลิงก์'} onPress={() => revoke(invitation)} style={{ flex: 1 }} /></View></View></View>)}</Surface> : null}
    </AppScreen>
  );
}
