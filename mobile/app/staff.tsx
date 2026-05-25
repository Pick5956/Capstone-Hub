import { Redirect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';

import { getRoles } from '@/src/api/auth';
import {
  createInvitation,
  listMembers,
  listPendingInvitations,
  revokeInvitation,
  updateMemberRole,
  updateMemberStatus,
} from '@/src/api/restaurant';
import { ChoiceRow, FormField, InlineActions } from '@/src/components/form-controls';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';
import type { Invitation, Membership, Role } from '@/src/types/restaurant';

export default function StaffScreen() {
  const { activeMembership, user } = useAuth();
  const restaurantId = activeMembership?.restaurant_id;
  const [members, setMembers] = useState<Membership[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const manageableRoles = useMemo(() => roles.filter((role) => role.name !== 'owner'), [roles]);
  const canManage = activeMembership ? can(activeMembership, 'manage_staff') || activeMembership.role?.name === 'owner' || activeMembership.role?.name === 'manager' : false;

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    try {
      const [memberResponse, roleResponse, invitationResponse] = await Promise.all([
        listMembers(restaurantId),
        getRoles(),
        listPendingInvitations(restaurantId),
      ]);
      setMembers(memberResponse.members);
      setRoles(roleResponse.data);
      setInvitations(invitationResponse.invitations);
      if (!roleId) {
        const waiter = roleResponse.data.find((role) => role.name === 'waiter');
        setRoleId(waiter?.ID || roleResponse.data.find((role) => role.name !== 'owner')?.ID || 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดพนักงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, roleId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return <Redirect href="/login" />;
  if (!activeMembership) return <Redirect href="/restaurants" />;

  async function invite() {
    if (!restaurantId || !roleId) return;
    setError(null);
    setMessage(null);
    try {
      const invitation = await createInvitation(restaurantId, {
        role_id: roleId,
        email: email.trim() || undefined,
        expires_in_days: 0,
      });
      setEmail('');
      setMessage(`ลิงก์เชิญ: https://dishy.pro/invitations/${invitation.token}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างคำเชิญไม่สำเร็จ');
    }
  }

  async function setStatus(member: Membership, status: Membership['status']) {
    if (!restaurantId) return;
    try {
      await updateMemberStatus(restaurantId, member.ID, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ปรับสถานะไม่สำเร็จ');
    }
  }

  async function setRole(member: Membership, nextRoleId: number) {
    if (!restaurantId) return;
    try {
      await updateMemberRole(restaurantId, member.ID, nextRoleId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปลี่ยนสิทธิ์ไม่สำเร็จ');
    }
  }

  return (
    <MobileScreen
      kicker="STAFF"
      title="พนักงาน"
      subtitle={`${members.length} คน · ${invitations.length} คำเชิญ`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {!canManage ? <StateMessage title="ไม่มีสิทธิ์จัดการพนักงาน" detail="ต้องเป็น owner หรือ manager" /> : null}

      {canManage ? (
        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>เชิญพนักงาน</Text>
          <FormField label="อีเมล (ไม่บังคับ)" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <ChoiceRow
            label="ตำแหน่ง"
            value={roleId}
            options={manageableRoles.map((role) => ({ label: role.name, value: role.ID }))}
            onChange={setRoleId}
          />
          <Pressable onPress={invite} style={layout.primaryButton}>
            <Text style={layout.primaryButtonText}>สร้างลิงก์เชิญ</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? <Text selectable style={[typeScale.caption, { color: colors.accent }]}>{message}</Text> : null}
      {error ? <StateMessage title="ทำรายการไม่สำเร็จ" detail={error} /> : null}

      <View style={{ gap: 10 }}>
        {members.map((member) => (
          <View key={member.ID} style={[layout.panel, { gap: 10 }]}>
            <Text selectable style={typeScale.cardTitle}>
              {member.user?.nickname || `${member.user?.first_name || ''} ${member.user?.last_name || ''}`.trim() || member.user?.email || `User #${member.user_id}`}
            </Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              {member.user?.email || '-'} · {member.role?.name || 'staff'} · {member.status}
            </Text>
            {canManage ? (
              <>
                <ChoiceRow
                  label="สิทธิ์"
                  value={member.role_id}
                  options={manageableRoles.map((role) => ({ label: role.name, value: role.ID }))}
                  onChange={(nextRoleId) => setRole(member, nextRoleId)}
                />
                <InlineActions>
                  <Pressable onPress={() => setStatus(member, 'active')} style={layout.secondaryButton}>
                    <Text style={layout.secondaryButtonText}>เปิดใช้งาน</Text>
                  </Pressable>
                  <Pressable onPress={() => setStatus(member, 'suspended')} style={layout.secondaryButton}>
                    <Text style={layout.secondaryButtonText}>พักสิทธิ์</Text>
                  </Pressable>
                </InlineActions>
              </>
            ) : null}
          </View>
        ))}
      </View>

      {canManage && invitations.length ? (
        <View style={{ gap: 10 }}>
          <Text selectable style={typeScale.title}>คำเชิญค้างอยู่</Text>
          {invitations.map((invitation) => (
            <View key={invitation.ID} style={layout.card}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text selectable style={typeScale.cardTitle}>{invitation.email || 'ลิงก์ทั่วไป'}</Text>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  {invitation.role?.name || `role #${invitation.role_id}`} · {invitation.status}
                </Text>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  https://dishy.pro/invitations/{invitation.token}
                </Text>
              </View>
              <Pressable
                onPress={() => Alert.alert('ยกเลิกคำเชิญ?', 'ลิงก์นี้จะใช้ไม่ได้ทันที', [
                  { text: 'ไม่' },
                  { text: 'ยกเลิก', style: 'destructive', onPress: async () => {
                    if (!restaurantId) return;
                    await revokeInvitation(restaurantId, invitation.ID);
                    await load();
                  } },
                ])}
                style={layout.secondaryButton}
              >
                <Text style={[layout.secondaryButtonText, { color: colors.danger }]}>ลบ</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </MobileScreen>
  );
}
