import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { getRoles } from '@/src/api/auth';
import { AppScreen } from '@/src/components/app-shell';
import {
  Button,
  EdgeRow,
  EdgeSection,
  EdgeSectionHeader,
  EmptyState,
  Feedback,
} from '@/src/components/ui';
import { parsePermissions } from '@/src/lib/permissions';
import {
  allowedRoleOptions,
  canManageTeam,
  roleLabel,
} from '@/src/lib/staff-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { spacing } from '@/src/theme';
import type { Role } from '@/src/types/restaurant';

export default function RolesScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const actorRole = activeMembership?.role?.name;
  const allowed = canManageTeam(activeMembership);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getRoles();
      setRoles(allowedRoleOptions(actorRole, response.data || []));
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('โหลดบทบาทไม่สำเร็จ', 'Unable to load roles'));
    } finally {
      setLoading(false);
    }
  }, [actorRole, allowed, copy]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (!allowed) {
    return (
      <AppScreen title={copy('บทบาทและสิทธิ์', 'Roles & permissions')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์จัดการบทบาท', 'No role management access')}
          detail={copy(
            'ต้องเป็นเจ้าของร้านหรือผู้จัดการที่ได้รับสิทธิ์จัดการทีม',
            'You must be an owner or manager with team-management access.',
          )}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('บทบาทและสิทธิ์', 'Roles & permissions')}
      subtitle={copy(
        'กำหนดสิทธิ์เริ่มต้นและบทบาทที่ใช้กับทีมในร้านนี้',
        'Set default permissions and roles for this restaurant team.',
      )}
      topLevel={false}
      action={(
        <Button
          compact
          icon="add-outline"
          label={copy('เพิ่มบทบาท', 'Add role')}
          onPress={() => router.push('/staff/role' as never)}
        />
      )}
    >
      {error ? (
        <Feedback
          title={copy('โหลดบทบาทไม่ได้', 'Unable to load roles')}
          detail={error}
          tone="danger"
        />
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <EdgeSectionHeader
          title={copy('บทบาทที่จัดการได้', 'Roles you can manage')}
          detail={actorRole === 'manager'
            ? copy(
              'ผู้จัดการแก้ไขได้เฉพาะบทบาทระดับปฏิบัติการ',
              'Managers can edit operational roles only.',
            )
            : copy(
              'เจ้าของร้านแก้ไขทุกบทบาทได้ ยกเว้นบทบาทเจ้าของร้าน',
              'Owners can edit every role except the owner role.',
            )}
        />
        {roles.length ? (
          <EdgeSection>
            {roles.map((role) => {
              const permissionCount = parsePermissions(role.permissions).length;
              const detail = `${role.permissions === '["*"]'
                ? copy('ทุกสิทธิ์', 'All permissions')
                : copy(
                  `${permissionCount.toLocaleString('th-TH')} สิทธิ์`,
                  `${permissionCount.toLocaleString('en-US')} permissions`,
                )}${role.is_system
                ? copy(' · บทบาทมาตรฐาน', ' · Standard role')
                : copy(' · บทบาทร้าน', ' · Restaurant role')}`;

              return (
                <EdgeRow
                  detail={detail}
                  icon="shield-checkmark-outline"
                  key={role.ID}
                  onPress={() => router.push({
                    pathname: '/staff/role' as never,
                    params: { id: String(role.ID) },
                  } as never)}
                  title={roleLabel(role, language)}
                />
              );
            })}
          </EdgeSection>
        ) : !loading ? (
          <EdgeSection style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState
              title={copy('ยังไม่มีบทบาทที่จัดการได้', 'No manageable roles yet')}
              detail={copy(
                'เพิ่มบทบาทใหม่สำหรับงานของร้านนี้',
                'Add a new role for this restaurant.',
              )}
            />
          </EdgeSection>
        ) : null}
      </View>
    </AppScreen>
  );
}
