import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { getRoles } from '@/src/api/auth';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import {
  Button,
  Divider,
  EmptyState,
  Feedback,
  SectionHeader,
  Surface,
} from '@/src/components/ui';
import { parsePermissions } from '@/src/lib/permissions';
import {
  allowedRoleOptions,
  canManageTeam,
  roleLabel,
} from '@/src/lib/staff-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing, typeScale } from '@/src/theme';
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
            'ต้องเป็นเจ้าของร้านหรือผู้จัดการที่มีสิทธิ์ manage_staff',
            'You must be an owner or manager with the manage_staff permission.',
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
      <Surface>
        <SectionHeader
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
        {roles.map((role, index) => (
          <View key={role.ID}>
            {index ? <Divider /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({
                pathname: '/staff/role' as never,
                params: { id: String(role.ID) },
              } as never)}
              style={({ pressed }) => ({
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text selectable style={typeScale.cardTitle}>{roleLabel(role, language)}</Text>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                  {role.permissions === '["*"]'
                    ? copy('ทุกสิทธิ์', 'All permissions')
                    : copy(
                      `${parsePermissions(role.permissions).length.toLocaleString('th-TH')} สิทธิ์`,
                      `${parsePermissions(role.permissions).length.toLocaleString('en-US')} permissions`,
                    )}
                  {role.is_system
                    ? copy(' · บทบาทมาตรฐาน', ' · Standard role')
                    : copy(' · บทบาทร้าน', ' · Restaurant role')}
                </Text>
              </View>
              <Text style={{ color: palette.muted, fontSize: 20 }}>›</Text>
            </Pressable>
          </View>
        ))}
        {!roles.length && !loading ? (
          <EmptyState
            title={copy('ยังไม่มีบทบาทที่จัดการได้', 'No manageable roles yet')}
            detail={copy(
              'เพิ่มบทบาทใหม่สำหรับงานของร้านนี้',
              'Add a new role for this restaurant.',
            )}
          />
        ) : null}
      </Surface>
    </AppScreen>
  );
}
