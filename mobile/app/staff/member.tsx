import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { getRoles } from '@/src/api/auth';
import {
  listMembers,
  updateMemberPermissions,
  updateMemberRole,
  updateMemberStatus,
} from '@/src/api/restaurant';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import {
  Button,
  ChipGroup,
  EmptyState,
  Feedback,
  SectionHeader,
  Surface,
} from '@/src/components/ui';
import { allPermissions, parsePermissions, permissionGroupsFor } from '@/src/lib/permissions';
import {
  allowedRoleOptions,
  canManageTarget,
  canManageTeam,
  roleLabel,
  userDisplayName,
} from '@/src/lib/staff-workflow';
import { parsePositiveRouteId } from '@/src/lib/route-id';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Membership, MembershipStatus, Role } from '@/src/types/restaurant';

export default function StaffMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routeId = parsePositiveRouteId(id);
  const memberId = routeId.kind === 'valid' ? routeId.id : null;
  const { activeMembership, user } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const restaurantId = activeMembership?.restaurant_id;
  const actorRole = activeMembership?.role?.name;
  const allowed = canManageTeam(activeMembership);
  const [member, setMember] = useState<Membership | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState(0);
  const [status, setStatus] = useState<MembershipStatus>('active');
  const [useRolePermissions, setUseRolePermissions] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<MembershipStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId || !allowed || memberId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMember(null);
    setError(null);
    Promise.all([listMembers(restaurantId), getRoles()])
      .then(([memberResponse, roleResponse]) => {
        const next = memberResponse.members.find((item) => item.ID === memberId) || null;
        setMember(next);
        setRoles(allowedRoleOptions(actorRole, roleResponse.data || []));
        setRoleId(next?.role_id || 0);
        setStatus(next?.status || 'active');
        setUseRolePermissions(next?.permissions_override == null);
        setPermissions(parsePermissions(next?.permissions_override ?? next?.role?.permissions));
      })
      .catch((err) => {
        setError(err instanceof Error
          ? err.message
          : copy('โหลดข้อมูลพนักงานไม่สำเร็จ', 'Unable to load staff details'));
      })
      .finally(() => setLoading(false));
  }, [actorRole, allowed, copy, memberId, restaurantId]);

  const manageable = Boolean(
    allowed
    && member
    && canManageTarget(actorRole, member.role?.name, member.user_id === user?.ID),
  );
  const roleOptions = useMemo(
    () => roles.map((role) => ({ label: roleLabel(role, language), value: role.ID })),
    [language, roles],
  );
  const permissionGroups = useMemo(() => permissionGroupsFor(language), [language]);

  function changeRole(nextRoleId: number) {
    setRoleId(nextRoleId);
    if (useRolePermissions) {
      setPermissions(parsePermissions(roles.find((role) => role.ID === nextRoleId)?.permissions));
    }
  }

  function toggle(key: string) {
    setPermissions((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  }

  async function save() {
    if (!restaurantId || memberId === null || !member || !manageable) return;
    const riskyStatusChange = status !== member.status && status !== 'active';
    if (riskyStatusChange && confirmStatus !== status) {
      setConfirmStatus(status);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      let updated = member;
      if (roleId !== updated.role_id) {
        updated = (await updateMemberRole(restaurantId, updated.ID, roleId)).member;
        setMember(updated);
      }
      if (status !== updated.status) {
        updated = (await updateMemberStatus(restaurantId, updated.ID, status)).member;
        setMember(updated);
      }
      const editablePermissions = permissions.filter((permission) => (
        (allPermissions as readonly string[]).includes(permission)
      ));
      updated = (
        await updateMemberPermissions(
          restaurantId,
          updated.ID,
          useRolePermissions ? null : editablePermissions,
        )
      ).member;
      setMember(updated);
      setRoleId(updated.role_id);
      setStatus(updated.status);
      setUseRolePermissions(updated.permissions_override == null);
      setPermissions(parsePermissions(updated.permissions_override ?? updated.role?.permissions));
      setConfirmStatus(null);
      setMessage(copy('บันทึกข้อมูลพนักงานแล้ว', 'Staff details saved'));
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('บันทึกพนักงานไม่สำเร็จ', 'Unable to save staff details'));
    } finally {
      setSaving(false);
    }
  }

  if (routeId.kind !== 'valid') {
    return (
      <AppScreen title={copy('ข้อมูลพนักงาน', 'Staff details')} topLevel={false}>
        <EmptyState
          title={copy('ไม่พบพนักงาน', 'Staff member not found')}
          detail={copy(
            'ลิงก์พนักงานนี้ไม่ถูกต้อง กรุณากลับไปเลือกรายการจากหน้าทีมงาน',
            'This staff link is invalid. Go back and choose a member from the team list.',
          )}
          action={(
            <Button
              variant="secondary"
              label={copy('ย้อนกลับ', 'Go back')}
              onPress={() => router.back()}
            />
          )}
        />
      </AppScreen>
    );
  }

  if (!allowed) {
    return (
      <AppScreen title={copy('ข้อมูลพนักงาน', 'Staff details')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์จัดการทีม', 'No team management access')}
          detail={copy(
            'ต้องเป็นเจ้าของร้านหรือผู้จัดการที่มีสิทธิ์ manage_staff',
            'You must be an owner or manager with the manage_staff permission.',
          )}
        />
      </AppScreen>
    );
  }

  if (!loading && !error && (!member || !manageable)) {
    return (
      <AppScreen title={copy('ข้อมูลพนักงาน', 'Staff details')} topLevel={false}>
        <EmptyState
          title={member
            ? copy('จัดการสมาชิกคนนี้ไม่ได้', 'This member cannot be managed')
            : copy('ไม่พบพนักงาน', 'Staff member not found')}
          detail={member
            ? copy(
              'ระบบไม่อนุญาตให้แก้ไขตนเอง เจ้าของร้าน หรือผู้จัดการในระดับเดียวกัน',
              'You cannot edit yourself, an owner, or a manager at the same level.',
            )
            : copy(
              'พนักงานอาจถูกนำออกหรือไม่ได้อยู่ในร้านนี้',
              'This staff member may have been removed or is not in this restaurant.',
            )}
          action={(
            <Button
              variant="secondary"
              label={copy('ย้อนกลับ', 'Go back')}
              onPress={() => router.back()}
            />
          )}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={member
        ? userDisplayName(member.user, language)
        : copy('ข้อมูลพนักงาน', 'Staff details')}
      subtitle={member?.user?.email || copy('กำลังโหลดข้อมูล', 'Loading details')}
      topLevel={false}
    >
      {error ? (
        <Feedback
          title={copy('ทำรายการไม่ได้', 'Unable to complete action')}
          detail={error}
          tone="danger"
        />
      ) : null}
      {message ? <Feedback title={message} tone="success" /> : null}
      {confirmStatus ? (
        <Feedback
          title={confirmStatus === 'removed'
            ? copy('ยืนยันนำพนักงานออกจากร้าน', 'Confirm removing staff')
            : copy('ยืนยันระงับการใช้งาน', 'Confirm suspension')}
          detail={confirmStatus === 'removed'
            ? copy(
              'พนักงานจะเข้าใช้งานร้านนี้ไม่ได้จนกว่าจะได้รับคำเชิญใหม่',
              'This staff member cannot access the restaurant until invited again.',
            )
            : copy(
              'พนักงานจะเข้าใช้งานร้านนี้ไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง',
              'This staff member cannot access the restaurant until reactivated.',
            )}
          tone={confirmStatus === 'removed' ? 'danger' : 'warning'}
        />
      ) : null}

      {member ? (
        <>
          <Surface>
            <SectionHeader title={copy('บทบาทและสถานะ', 'Role & status')} />
            <ChipGroup
              label={copy('บทบาท', 'Role')}
              value={roleId}
              onChange={changeRole}
              options={roleOptions}
            />
            <ChipGroup
              label={copy('สถานะ', 'Status')}
              value={status}
              onChange={(value) => {
                setStatus(value);
                setConfirmStatus(null);
              }}
              options={[
                { label: copy('เปิดใช้งาน', 'Active'), value: 'active' },
                { label: copy('ระงับ', 'Suspended'), value: 'suspended' },
                { label: copy('นำออกจากร้าน', 'Remove from restaurant'), value: 'removed' },
              ]}
            />
          </Surface>

          <Surface>
            <SectionHeader
              title={copy('สิทธิ์การใช้งาน', 'Permissions')}
              detail={useRolePermissions
                ? copy(
                  `ใช้สิทธิ์เริ่มต้นจากบทบาท ${roleLabel(roles.find((role) => role.ID === roleId), language)}`,
                  `Using defaults from the ${roleLabel(roles.find((role) => role.ID === roleId), language)} role`,
                )
                : copy(
                  `กำหนดเอง ${permissions.length.toLocaleString('th-TH')} สิทธิ์`,
                  `${permissions.length.toLocaleString('en-US')} custom permissions`,
                )}
            />
            <ChipGroup
              value={useRolePermissions ? 'role' : 'custom'}
              onChange={(value) => {
                const useRole = value === 'role';
                setUseRolePermissions(useRole);
                if (!useRole) {
                  setPermissions(parsePermissions(
                    roles.find((role) => role.ID === roleId)?.permissions,
                  ));
                }
              }}
              options={[
                { label: copy('ตามบทบาท', 'Use role defaults'), value: 'role' },
                { label: copy('กำหนดเอง', 'Customize'), value: 'custom' },
              ]}
            />
            {!useRolePermissions ? permissionGroups.map((group) => (
              <View key={group.title} style={{ gap: spacing.sm }}>
                <Text style={typeScale.cardTitle}>{group.title}</Text>
                {group.rows.map((row) => {
                  const active = permissions.includes(row.key);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}
                      key={row.key}
                      onPress={() => toggle(row.key)}
                      style={({ pressed }) => ({
                        minHeight: 48,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        borderWidth: 1,
                        borderColor: active ? palette.primary : palette.borderStrong,
                        borderRadius: radius.md,
                        backgroundColor: active ? palette.primary : palette.surface,
                        paddingHorizontal: spacing.md,
                        opacity: pressed ? 0.76 : 1,
                      })}
                    >
                      <Text style={{
                        flex: 1,
                        color: active ? palette.primaryText : palette.text,
                        fontSize: 14,
                        fontWeight: '600',
                      }}>
                        {row.label}
                      </Text>
                      <Text style={{ color: active ? palette.primaryText : palette.muted }}>
                        {active ? '✓' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )) : null}
          </Surface>

          <Surface>
            {confirmStatus ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  variant="secondary"
                  label={copy('ยกเลิก', 'Cancel')}
                  onPress={() => {
                    setStatus(member.status);
                    setConfirmStatus(null);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  variant={confirmStatus === 'removed' ? 'danger' : 'primary'}
                  label={copy('ยืนยันบันทึก', 'Confirm save')}
                  onPress={save}
                  loading={saving}
                  style={{ flex: 1 }}
                />
              </View>
            ) : (
              <Button
                label={copy('บันทึกข้อมูลพนักงาน', 'Save staff details')}
                onPress={save}
                loading={saving}
              />
            )}
          </Surface>
        </>
      ) : null}
    </AppScreen>
  );
}
