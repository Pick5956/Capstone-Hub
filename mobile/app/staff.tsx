import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Share, View } from 'react-native';

import {
  listAuditLogs,
  listMembers,
  listPendingInvitations,
  revokeInvitation,
} from '@/src/api/restaurant';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import {
  Button,
  Divider,
  EmptyState,
  Feedback,
  SectionHeader,
  StatusBadge,
  Surface,
} from '@/src/components/ui';
import {
  auditAttribution,
  auditMessage,
  canManageTarget,
  canManageTeam,
  isInvitationUsableAt,
  roleLabel,
  staffStatusLabel,
  userDisplayName,
} from '@/src/lib/staff-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing, typeScale } from '@/src/theme';
import type {
  AdminInvitation,
  Membership,
  RestaurantAuditLog,
} from '@/src/types/restaurant';

const webUrl = (process.env.EXPO_PUBLIC_WEB_URL?.trim() || 'https://app.example.com').replace(/\/$/, '');
const auditPageSize = 10;

function formatDateTime(value: string | undefined, language: 'th' | 'en') {
  if (!value) return language === 'th' ? 'ไม่ระบุเวลา' : 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return language === 'th' ? 'ไม่ระบุเวลา' : 'Time unavailable';
  }
  return date.toLocaleString(language === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function memberName(member: Membership, language: 'th' | 'en') {
  return userDisplayName(member.user, language);
}

export default function StaffScreen() {
  const { activeMembership, user } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const restaurantId = activeMembership?.restaurant_id;
  const actorRole = activeMembership?.role?.name;
  const allowed = canManageTeam(activeMembership);
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<RestaurantAuditLog[]>([]);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMoreAudit, setLoadingMoreAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [memberResponse, invitationResponse, auditResponse] = await Promise.all([
        listMembers(restaurantId),
        listPendingInvitations(restaurantId),
        listAuditLogs(restaurantId, auditPageSize, 0),
      ]);
      setMembers(memberResponse.members || []);
      setInvitations(invitationResponse.invitations || []);
      setAuditLogs(auditResponse.logs || []);
      setAuditHasMore(Boolean(auditResponse.has_more));
      setAuditOffset(auditResponse.next_offset || auditResponse.logs.length);
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('โหลดข้อมูลทีมงานไม่สำเร็จ', 'Unable to load team data'));
    } finally {
      setLoading(false);
    }
  }, [allowed, copy, restaurantId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  async function loadMoreAudit() {
    if (!restaurantId || loadingMoreAudit || !auditHasMore) return;
    setLoadingMoreAudit(true);
    setError(null);
    try {
      const response = await listAuditLogs(restaurantId, auditPageSize, auditOffset);
      setAuditLogs((current) => [...current, ...(response.logs || [])]);
      setAuditHasMore(Boolean(response.has_more));
      setAuditOffset(response.next_offset || auditOffset + response.logs.length);
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('โหลดประวัติทีมงานไม่สำเร็จ', 'Unable to load team history'));
    } finally {
      setLoadingMoreAudit(false);
    }
  }

  async function revoke(invitation: AdminInvitation) {
    if (!restaurantId) return;
    if (confirmRevokeId !== invitation.ID) {
      setConfirmRevokeId(invitation.ID);
      return;
    }
    try {
      await revokeInvitation(restaurantId, invitation.ID);
      setConfirmRevokeId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('ยกเลิกคำเชิญไม่สำเร็จ', 'Unable to revoke invitation'));
    }
  }

  async function share(invitation: AdminInvitation) {
    if (!isInvitationUsableAt(invitation)) return;
    const restaurantName = activeMembership?.restaurant?.name
      || copy('ร้านอาหาร', 'Restaurant');
    const link = `${webUrl}/invitations/${invitation.token}`;
    await Share.share({
      title: copy(
        `คำเชิญเข้าร่วมร้าน ${restaurantName} บน Dishy`,
        `Invitation to join ${restaurantName} on Dishy`,
      ),
      message: copy(
        `คุณได้รับคำเชิญเข้าร่วมร้าน ${restaurantName} ในบทบาท ${roleLabel(invitation.role, language)}\n${link}`,
        `You have been invited to join ${restaurantName} as ${roleLabel(invitation.role, language)}.\n${link}`,
      ),
    });
  }

  if (!allowed) {
    return (
      <AppScreen title={copy('พนักงานและสิทธิ์', 'Staff & permissions')} topLevel>
        <EmptyState
          title={copy('ไม่มีสิทธิ์จัดการทีม', 'No team management access')}
          detail={copy(
            'หน้านี้สำหรับเจ้าของร้านหรือผู้จัดการที่มีสิทธิ์ manage_staff',
            'This page is for owners or managers with the manage_staff permission.',
          )}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('พนักงานและสิทธิ์', 'Staff & permissions')}
      subtitle={copy(
        `${members.length.toLocaleString('th-TH')} คน · ${invitations.length.toLocaleString('th-TH')} คำเชิญที่รอใช้งาน`,
        `${members.length.toLocaleString('en-US')} staff · ${invitations.length.toLocaleString('en-US')} pending invitations`,
      )}
      topLevel
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      action={(
        <Button
          compact
          label={copy('เชิญพนักงาน', 'Invite staff')}
          onPress={() => router.push('/staff/invite' as never)}
        />
      )}
    >
      {error ? (
        <Feedback
          title={copy('ทำรายการไม่ได้', 'Unable to complete action')}
          detail={error}
          tone="danger"
        />
      ) : null}

      <Surface>
        <SectionHeader
          title={copy('ทีมงาน', 'Team')}
          detail={copy(
            'เจ้าของร้านจัดการทุกบทบาทได้ ส่วนผู้จัดการจัดการได้เฉพาะทีมระดับปฏิบัติการ',
            'Owners can manage all roles. Managers can manage operational roles only.',
          )}
          action={(
            <Button
              compact
              variant="secondary"
              label={copy('บทบาท', 'Roles')}
              onPress={() => router.push('/staff/roles' as never)}
            />
          )}
        />
        {members.map((member, index) => {
          const manageable = canManageTarget(
            actorRole,
            member.role?.name,
            member.user_id === user?.ID,
          );
          return (
            <View key={member.ID}>
              {index ? <Divider /> : null}
              <Pressable
                accessibilityRole={manageable ? 'button' : undefined}
                accessibilityState={{ disabled: !manageable }}
                disabled={!manageable}
                onPress={() => router.push({
                  pathname: '/staff/member' as never,
                  params: { id: String(member.ID) },
                } as never)}
                style={({ pressed }) => ({
                  minHeight: 70,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  opacity: pressed ? 0.72 : manageable ? 1 : 0.7,
                })}
              >
                <View style={{
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 20,
                  backgroundColor: palette.surfaceStrong,
                }}>
                  <Text style={{ color: palette.text, fontWeight: '800' }}>
                    {memberName(member, language).slice(0, 1)}
                  </Text>
                </View>
                <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
                  <Text selectable numberOfLines={1} style={typeScale.cardTitle}>
                    {memberName(member, language)}
                  </Text>
                  <Text
                    selectable
                    numberOfLines={1}
                    style={[typeScale.caption, { color: palette.muted }]}
                  >
                    {member.user?.email || '-'} · {roleLabel(member.role, language)}
                    {!manageable ? copy(' · ดูข้อมูลเท่านั้น', ' · View only') : ''}
                  </Text>
                </View>
                <StatusBadge
                  label={staffStatusLabel(member.status, language)}
                  tone={member.status === 'active'
                    ? 'success'
                    : member.status === 'suspended' ? 'warning' : 'neutral'}
                />
                {manageable ? <Text style={{ color: palette.muted, fontSize: 20 }}>›</Text> : null}
              </Pressable>
            </View>
          );
        })}
        {!members.length && !loading ? (
          <EmptyState
            title={copy('ยังไม่มีพนักงาน', 'No staff yet')}
            detail={copy(
              'สร้างลิงก์เชิญเพื่อเพิ่มทีมงานเข้าร้าน',
              'Create an invitation link to add staff to this restaurant.',
            )}
          />
        ) : null}
      </Surface>

      {invitations.length ? (
        <Surface>
          <SectionHeader
            title={copy('คำเชิญที่รอดำเนินการ', 'Pending invitations')}
            detail={copy(
              'แชร์ลิงก์ให้ผู้รับตรวจรายละเอียดและเข้าสู่ระบบก่อนเข้าร่วมร้าน',
              'Share the link so the recipient can review it and sign in before joining.',
            )}
          />
          {invitations.map((invitation, index) => {
            const usable = isInvitationUsableAt(invitation);
            return (
              <View key={invitation.ID}>
                {index ? <Divider /> : null}
                <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text selectable style={typeScale.cardTitle}>
                        {invitation.email || copy('ลิงก์เชิญทั่วไป', 'General invitation link')}
                      </Text>
                      <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                        {roleLabel(invitation.role, language)} · {invitation.expires_at
                          ? copy(
                            `หมดอายุ ${formatDateTime(invitation.expires_at, language)}`,
                            `Expires ${formatDateTime(invitation.expires_at, language)}`,
                          )
                          : copy('ไม่หมดอายุ', 'Never expires')}
                      </Text>
                    </View>
                    <StatusBadge
                      label={usable
                        ? copy('พร้อมแชร์', 'Ready to share')
                        : copy('หมดอายุแล้ว', 'Expired')}
                      tone={usable ? 'success' : 'warning'}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {usable ? (
                      <Button
                        compact
                        variant="secondary"
                        label={copy('แชร์ลิงก์', 'Share link')}
                        onPress={() => share(invitation)}
                        style={{ flexGrow: 1 }}
                      />
                    ) : null}
                    {confirmRevokeId === invitation.ID ? (
                      <Button
                        compact
                        variant="secondary"
                        label={copy('เก็บลิงก์ไว้', 'Keep link')}
                        onPress={() => setConfirmRevokeId(null)}
                        style={{ flexGrow: 1 }}
                      />
                    ) : null}
                    <Button
                      compact
                      variant={confirmRevokeId === invitation.ID ? 'danger' : 'ghost'}
                      label={confirmRevokeId === invitation.ID
                        ? copy('ยืนยันยกเลิกลิงก์', 'Confirm revoke')
                        : copy('ยกเลิกลิงก์', 'Revoke link')}
                      onPress={() => revoke(invitation)}
                      style={{ flexGrow: 1 }}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </Surface>
      ) : null}

      <Surface>
        <SectionHeader
          title={copy('ประวัติการจัดการทีม', 'Team activity')}
          detail={copy(
            'คำเชิญ การเปลี่ยนบทบาท สถานะ และสิทธิ์ล่าสุด',
            'Recent invitations, role, status, and permission changes.',
          )}
        />
        {auditLogs.map((log, index) => (
          <View key={log.ID}>
            {index ? <Divider /> : null}
            <View style={{ gap: 3, paddingVertical: spacing.sm }}>
              <Text selectable style={typeScale.cardTitle}>
                {auditMessage(log, language)}
              </Text>
              <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                {auditAttribution(log, language)} · {formatDateTime(log.CreatedAt, language)}
              </Text>
            </View>
          </View>
        ))}
        {!auditLogs.length && !loading ? (
          <EmptyState title={copy('ยังไม่มีประวัติการจัดการทีม', 'No team activity yet')} />
        ) : null}
        {auditHasMore ? (
          <Button
            variant="secondary"
            label={copy('ดูเหตุการณ์ก่อนหน้า', 'View earlier activity')}
            onPress={loadMoreAudit}
            loading={loadingMoreAudit}
          />
        ) : null}
      </Surface>
    </AppScreen>
  );
}
