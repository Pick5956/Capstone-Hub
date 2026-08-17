import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { getRoles } from '@/src/api/auth';
import { AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import {
  Button,
  Divider,
  EdgeRow,
  EdgeSection,
  EmptyState,
  Feedback,
} from '@/src/components/ui';
import {
  allowedRoleOptions,
  canGrantRole,
  canManageRoles,
  roleLabel,
  roleListMeta,
} from '@/src/lib/staff-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';
import type { Role } from '@/src/types/restaurant';

export default function RolesScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const actorRole = activeMembership?.role?.name;
  const allowed = canManageRoles(activeMembership);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const splitRoleMetadata = width >= breakpoints.tablet;

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getRoles();
      setRoles(
        allowedRoleOptions(actorRole, response.data || [], allowed)
          .filter((role) => canGrantRole(activeMembership, role)),
      );
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('โหลดบทบาทไม่สำเร็จ', 'Unable to load roles'));
    } finally {
      setLoading(false);
    }
  }, [activeMembership, actorRole, allowed, copy]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (!allowed) {
    return (
      <AppScreen title={copy('บทบาทและสิทธิ์', 'Roles & permissions')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์จัดการบทบาท', 'No role management access')}
          detail={copy(
            'บัญชีนี้ไม่ได้รับสิทธิ์จัดการบทบาทและสิทธิ์ของทีม',
            'This account cannot manage team roles and permissions.',
          )}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('บทบาทและสิทธิ์', 'Roles & permissions')}
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
      {roles.length ? (
        <EdgeSection>
          {roles.map((role, index) => {
            const title = roleLabel(role, language);
            const meta = roleListMeta(role, language);
            return (
              <View key={role.ID}>
                {index ? <Divider /> : null}
                <EdgeRow
                  accessibilityLabel={`${title}, ${meta.typeLabel}, ${meta.permissionLabel}`}
                  detail={splitRoleMetadata
                    ? meta.typeLabel
                    : `${meta.typeLabel} · ${meta.permissionLabel}`}
                  icon="shield-checkmark-outline"
                  onPress={() => router.push({
                    pathname: '/staff/role' as never,
                    params: { id: String(role.ID) },
                  } as never)}
                  title={title}
                  trailing={splitRoleMetadata ? (
                    <Text
                      numberOfLines={1}
                      selectable
                      style={[typeScale.caption, { color: palette.muted, fontVariant: ['tabular-nums'] }]}
                    >
                      {meta.permissionLabel}
                    </Text>
                  ) : undefined}
                />
              </View>
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
    </AppScreen>
  );
}
