import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Share, useWindowDimensions, View } from 'react-native';

import {
  listAuditLogs,
  listMembers,
  listPendingInvitations,
  revokeInvitation,
} from '@/src/api/restaurant';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppRefreshControl, AppScreen } from '@/src/components/app-shell';
import {
  Button,
  Divider,
  EdgeSection,
  EdgeSectionHeader,
  EmptyState,
  Feedback,
  StatusBadge,
} from '@/src/components/ui';
import {
  auditAttribution,
  auditMessage,
  canAccessTeam,
  canGrantRole,
  canManageInvitations,
  canManageMembers,
  canManageRoles,
  canManageTarget,
  canViewTeamAudit,
  isInvitationUsableAt,
  roleLabel,
  staffCountSubtitle,
  staffStatusLabel,
  teamActivityCopy,
  userDisplayName,
} from '@/src/lib/staff-workflow';
import { invitationUrl } from '@/src/lib/public-web-url';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, radius, spacing, typeScale } from '@/src/theme';
import type {
  AdminInvitation,
  Membership,
  RestaurantAuditLog,
} from '@/src/types/restaurant';

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
  const { width } = useWindowDimensions();
  const { activeMembership, user } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const restaurantId = activeMembership?.restaurant_id;
  const actorRole = activeMembership?.role?.name;
  const allowed = canAccessTeam(activeMembership);
  const canInvite = canManageInvitations(activeMembership);
  const canEditStatuses = canManageMembers(activeMembership);
  const canEditRoles = canManageRoles(activeMembership);
  const canViewAudit = canViewTeamAudit(activeMembership);
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<RestaurantAuditLog[]>([]);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadedRestaurantId, setLoadedRestaurantId] = useState<number | null>(null);
  const [loadingMoreAudit, setLoadingMoreAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const activityCopy = teamActivityCopy(language);
  const hasLoadedTeam = restaurantId != null && loadedRestaurantId === restaurantId;
  const initialLoading = loading && !hasLoadedTeam;

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
        canInvite ? listPendingInvitations(restaurantId) : Promise.resolve({ invitations: [] }),
        canViewAudit
          ? listAuditLogs(restaurantId, auditPageSize, 0)
          : Promise.resolve({ logs: [], has_more: false, next_offset: 0 }),
      ]);
      setMembers(memberResponse.members || []);
      setInvitations(invitationResponse.invitations || []);
      setAuditLogs(auditResponse.logs || []);
      setAuditHasMore(Boolean(auditResponse.has_more));
      setAuditOffset(auditResponse.next_offset || auditResponse.logs.length);
      setLoadedRestaurantId(restaurantId);
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('โหลดข้อมูลทีมงานไม่สำเร็จ', 'Unable to load team data'));
    } finally {
      setLoading(false);
    }
  }, [allowed, canInvite, canViewAudit, copy, restaurantId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  async function loadMoreAudit() {
    if (!restaurantId || !canViewAudit || loadingMoreAudit || !auditHasMore) return;
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
    if (!restaurantId || !canInvite) return;
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
    const link = invitationUrl(invitation.token);
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
      <AppScreen title={copy('พนักงานและสิทธิ์', 'Staff & permissions')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์จัดการทีม', 'No team management access')}
          detail={copy(
            'ต้องได้รับสิทธิ์อย่างน้อยหนึ่งด้านในการดูแลทีมงาน',
            'You need at least one team administration permission.',
          )}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('พนักงานและสิทธิ์', 'Staff & permissions')}
      subtitle={hasLoadedTeam
        ? staffCountSubtitle(members.length, invitations.length, canInvite, false, language)
        : undefined}
      topLevel={false}
      refreshControl={<AppRefreshControl onRefresh={load} />}
      action={canInvite ? (
        <Button
          compact
          icon="person-add-outline"
          label={tabletWorkspace ? copy('เชิญพนักงาน', 'Invite staff') : copy('เชิญ', 'Invite')}
          onPress={() => router.push('/staff/invite' as never)}
        />
      ) : undefined}
    >
      {error ? (
        <Feedback
          title={copy('ทำรายการไม่ได้', 'Unable to complete action')}
          detail={error}
          tone="danger"
        />
      ) : null}

      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 1.35 : undefined, gap: spacing.lg }}>
          <View style={{ gap: spacing.sm }}>
            <EdgeSectionHeader
              title={copy('สมาชิก', 'Members')}
              action={canEditRoles ? (
                <Button
                  compact
                  variant="secondary"
                  icon="key-outline"
                  label={copy('บทบาท', 'Roles')}
                  onPress={() => router.push('/staff/roles' as never)}
                />
              ) : undefined}
            />
            {initialLoading || hasLoadedTeam ? <EdgeSection>
            {initialLoading ? (
              <View
                accessible
                accessibilityLabel={copy('กำลังโหลดทีมงาน', 'Loading team')}
                accessibilityLiveRegion="polite"
                style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg }}
              >
                <ActivityIndicator color={palette.accent} size="small" />
                <Text style={[typeScale.caption, { color: palette.muted }]}>
                  {copy('กำลังโหลดทีมงาน', 'Loading team')}
                </Text>
              </View>
            ) : null}
            {hasLoadedTeam ? members.map((member, index) => {
              const canEditAccess = canEditRoles && member.role
                ? canGrantRole(activeMembership, member.role)
                : false;
              const hasTargetAction = canEditStatuses || canEditAccess;
              const manageable = hasTargetAction && canManageTarget(
                actorRole,
                member.role?.name,
                member.user_id === user?.ID,
                hasTargetAction,
              );
              const displayName = memberName(member, language);
              const displayRole = roleLabel(member.role, language);
              const displayStatus = staffStatusLabel(member.status, language);
              const accessibilityLabel = `${displayName}, ${displayRole}, ${displayStatus}`;
              const rowContent = (
                <>
                  <View style={{
                    width: 36,
                    height: 36,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 18,
                    backgroundColor: palette.surfaceStrong,
                  }}>
                    <Text style={{ color: palette.text, fontWeight: '800' }}>
                      {displayName.slice(0, 1)}
                    </Text>
                  </View>
                  <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text selectable numberOfLines={1} style={[typeScale.cardTitle, { minWidth: 0, flex: 1 }]}>
                        {displayName}
                      </Text>
                      <StatusBadge
                        label={displayStatus}
                        tone={member.status === 'active'
                          ? 'success'
                          : member.status === 'suspended' ? 'warning' : 'neutral'}
                      />
                    </View>
                    <Text
                      selectable
                      numberOfLines={1}
                      style={[typeScale.caption, { color: palette.muted }]}
                    >
                      {member.user?.email || '-'} · {displayRole}
                    </Text>
                  </View>
                  {manageable ? (
                    <AppIcon color={palette.muted} name="chevron-forward" size={18} />
                  ) : null}
                </>
              );
              const rowStyle = {
                minHeight: 64,
                flexDirection: 'row' as const,
                alignItems: 'center' as const,
                gap: spacing.sm,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
              };

              return (
                <View key={member.ID}>
                  {index ? <Divider /> : null}
                  {manageable ? (
                    <Pressable
                      accessibilityHint={copy('เปิดรายละเอียดพนักงาน', 'Open staff details')}
                      accessibilityLabel={accessibilityLabel}
                      accessibilityRole="button"
                      onPress={() => router.push({
                        pathname: '/staff/member' as never,
                        params: { id: String(member.ID) },
                      } as never)}
                      style={({ pressed }) => ({
                        ...rowStyle,
                        backgroundColor: pressed ? palette.surfaceStrong : palette.surface,
                        opacity: pressed ? 0.78 : 1,
                      })}
                    >
                      {rowContent}
                    </Pressable>
                  ) : (
                    <View
                      accessible
                      accessibilityLabel={`${accessibilityLabel}, ${copy('ดูข้อมูลเท่านั้น', 'View only')}`}
                      accessibilityRole="text"
                      style={rowStyle}
                    >
                      {rowContent}
                    </View>
                  )}
                </View>
              );
            }) : null}
            {hasLoadedTeam && !members.length ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState
              title={copy('ยังไม่มีสมาชิกในทีม', 'No team members yet')}
              detail={canInvite
                ? copy('แตะปุ่มเชิญเพื่อเพิ่มพนักงาน', 'Tap Invite to add staff.')
                : undefined}
            />
          </View>
            ) : null}
            </EdgeSection> : null}
          </View>

          {canInvite && hasLoadedTeam && invitations.length ? (
            <View style={{ gap: spacing.sm }}>
          <EdgeSectionHeader
            title={copy('คำเชิญที่รอรับ', 'Pending invitations')}
          />
          <EdgeSection>
          {invitations.map((invitation, index) => {
            const usable = isInvitationUsableAt(invitation);
            return (
              <View key={invitation.ID}>
                {index ? <Divider /> : null}
                <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                    <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
                      <Text selectable numberOfLines={1} style={typeScale.cardTitle}>
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
                    {usable && confirmRevokeId !== invitation.ID ? (
                      <Button
                        compact
                        variant="secondary"
                        icon="share-social-outline"
                        label={copy('แชร์ลิงก์', 'Share link')}
                        onPress={() => share(invitation)}
                        style={{ flexGrow: 1, flexBasis: tabletWorkspace ? 120 : 132 }}
                      />
                    ) : null}
                    {confirmRevokeId === invitation.ID ? (
                      <Button
                        compact
                        variant="secondary"
                        icon="close-outline"
                        label={copy('เก็บลิงก์ไว้', 'Keep link')}
                        onPress={() => setConfirmRevokeId(null)}
                        style={{ flexGrow: 1, flexBasis: tabletWorkspace ? 120 : 132 }}
                      />
                    ) : null}
                    <Button
                      compact
                      variant={confirmRevokeId === invitation.ID ? 'danger' : 'ghost'}
                      icon={confirmRevokeId === invitation.ID ? 'trash-outline' : 'close-circle-outline'}
                      label={confirmRevokeId === invitation.ID
                        ? copy('ยืนยันยกเลิก', 'Confirm revoke')
                        : copy('ยกเลิกลิงก์', 'Revoke link')}
                      onPress={() => revoke(invitation)}
                      style={{ flexGrow: 1, flexBasis: tabletWorkspace ? 120 : 132 }}
                    />
                  </View>
                </View>
              </View>
            );
          })}
          </EdgeSection>
            </View>
          ) : null}

        </View>

        {canViewAudit && hasLoadedTeam ? <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 0.9 : undefined }}>
          <View style={{ gap: spacing.sm }}>
        <EdgeSectionHeader
          title={activityCopy.sectionTitle}
        />
        <EdgeSection>
        {auditLogs.map((log, index) => (
          <View key={log.ID}>
            {index ? <Divider /> : null}
            <View style={{ gap: 3, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
              <Text selectable style={typeScale.cardTitle}>
                {auditMessage(log, language)}
              </Text>
              <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                {auditAttribution(log, language)} · {formatDateTime(log.CreatedAt, language)}
              </Text>
            </View>
          </View>
        ))}
        {!auditLogs.length ? (
          <View style={{ minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
            <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.surfaceStrong }}>
              <AppIcon color={palette.accent} name="time-outline" size={20} />
            </View>
            <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
              <Text selectable style={typeScale.cardTitle}>{activityCopy.emptyTitle}</Text>
              <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                {activityCopy.emptyDetail}
              </Text>
            </View>
          </View>
        ) : null}
        {auditHasMore ? (
          <>
            {auditLogs.length ? <Divider /> : null}
            <View style={{ padding: spacing.lg }}>
              <Button
                variant="secondary"
                icon="time-outline"
                label={copy('ดูเหตุการณ์ก่อนหน้า', 'View earlier activity')}
                onPress={loadMoreAudit}
                loading={loadingMoreAudit}
              />
            </View>
          </>
        ) : null}
        </EdgeSection>
          </View>
        </View> : null}
      </View>
    </AppScreen>
  );
}
