import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import {
  createRole,
  deleteRole,
  getRoles,
  updateRole,
  updateRolePermissions,
} from '@/src/api/auth';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import {
  ActionDock,
  Button,
  EmptyState,
  Feedback,
  SectionHeader,
  Surface,
  TextField,
} from '@/src/components/ui';
import { allPermissions, parsePermissions, permissionGroupsFor } from '@/src/lib/permissions';
import {
  allowedRoleOptions,
  canManageTeam,
  roleLabel,
} from '@/src/lib/staff-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';
import type { Role } from '@/src/types/restaurant';

export default function RoleEditorScreen() {
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const roleId = Number(id || 0);
  const editing = roleId > 0;
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const actorRole = activeMembership?.role?.name;
  const allowed = canManageTeam(activeMembership);
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedPermissionGroup, setExpandedPermissionGroup] = useState(0);

  useEffect(() => {
    if (!editing || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getRoles()
      .then((response) => {
        const editableRoles = allowedRoleOptions(actorRole, response.data || []);
        const next = editableRoles.find((item) => item.ID === roleId) || null;
        setRole(next);
        setName(next?.display_name || next?.name || '');
        setPermissions(parsePermissions(next?.permissions));
      })
      .catch((err) => {
        setError(err instanceof Error
          ? err.message
          : copy('โหลดบทบาทไม่สำเร็จ', 'Unable to load role'));
      })
      .finally(() => setLoading(false));
  }, [actorRole, allowed, copy, editing, roleId]);
  const permissionGroups = permissionGroupsFor(language);

  function toggle(key: string) {
    setPermissions((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  }

  async function save() {
    if (!allowed || (editing && !role)) return;
    if (!name.trim()) {
      setError(copy('กรอกชื่อบทบาทก่อน', 'Enter a role name first.'));
      return;
    }
    setSaving(true);
    setError(null);
    const editablePermissions = permissions.filter((permission) => (
      (allPermissions as readonly string[]).includes(permission)
    ));
    try {
      if (editing) {
        if (!role?.is_system) {
          await updateRole(roleId, { display_name: name.trim() });
        }
        await updateRolePermissions(roleId, editablePermissions);
      } else {
        await createRole({ display_name: name.trim(), permissions: editablePermissions });
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('บันทึกบทบาทไม่สำเร็จ', 'Unable to save role'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!role || !editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteRole(roleId);
      router.back();
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('ลบบทบาทไม่สำเร็จ', 'Unable to delete role'));
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <AppScreen
        title={editing
          ? copy('แก้ไขบทบาท', 'Edit role')
          : copy('เพิ่มบทบาท', 'Add role')}
        topLevel={false}
      >
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

  if (editing && !loading && !role) {
    return (
      <AppScreen title={copy('แก้ไขบทบาท', 'Edit role')} topLevel={false}>
        <EmptyState
          title={copy('จัดการบทบาทนี้ไม่ได้', 'This role cannot be managed')}
          detail={copy(
            'บทบาทนี้อยู่นอกลำดับสิทธิ์ของคุณหรือถูกนำออกจากร้านแล้ว',
            'This role is outside your permission hierarchy or was removed.',
          )}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={editing
        ? copy('แก้ไขบทบาท', 'Edit role')
        : copy('เพิ่มบทบาท', 'Add role')}
      subtitle={copy(
        'กำหนดงานที่บทบาทนี้ทำได้ในร้าน',
        'Choose what this role can do in the restaurant.',
      )}
      topLevel={false}
      footer={!tabletWorkspace ? (
        <ActionDock>
          <Button
            icon="checkmark"
            label={editing ? copy('บันทึกบทบาท', 'Save role') : copy('เพิ่มบทบาท', 'Add role')}
            onPress={save}
            loading={saving}
          />
        </ActionDock>
      ) : undefined}
    >
      {error ? (
        <Feedback
          title={copy('ทำรายการไม่ได้', 'Unable to complete action')}
          detail={error}
          tone="danger"
        />
      ) : null}
      {confirmDelete ? (
        <Feedback
          title={copy('ยืนยันลบบทบาทนี้', 'Confirm role deletion')}
          detail={role?.is_system
            ? copy(
              'บทบาทมาตรฐานจะถูกซ่อนจากร้านนี้ ลบได้เมื่อไม่มีพนักงานหรือคำเชิญที่ใช้บทบาทนี้',
              'This standard role will be hidden for this restaurant. It can only be removed when no staff or invitations use it.',
            )
            : copy(
              'ลบได้เมื่อไม่มีพนักงานหรือคำเชิญที่ใช้บทบาทนี้',
              'A role can only be deleted when no staff or invitations use it.',
            )}
          tone="danger"
        />
      ) : null}

      <Surface>
        <SectionHeader
          title={copy('ชื่อบทบาท', 'Role name')}
          detail={role?.is_system
            ? copy(
              'บทบาทมาตรฐานเปลี่ยนชื่อไม่ได้ แต่ปรับสิทธิ์สำหรับร้านนี้ได้',
              'Standard roles cannot be renamed, but their permissions can be customized for this restaurant.',
            )
            : undefined}
        />
        {role?.is_system ? (
          <Text selectable style={typeScale.cardTitle}>{roleLabel(role, language)}</Text>
        ) : (
          <TextField
            label={copy('ชื่อที่แสดง', 'Display name')}
            value={name}
            onChangeText={setName}
            placeholder={copy('เช่น หัวหน้ากะ', 'e.g. Shift lead')}
          />
        )}
      </Surface>

      <Surface>
        <SectionHeader
          title={copy('สิทธิ์เริ่มต้น', 'Default permissions')}
          detail={copy(
            `${permissions.length.toLocaleString('th-TH')} สิทธิ์ที่เลือก`,
            `${permissions.length.toLocaleString('en-US')} permissions selected`,
          )}
        />
        <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', flexWrap: tabletWorkspace ? 'wrap' : 'nowrap', gap: spacing.md }}>
        {permissionGroups.map((group, groupIndex) => {
          const expanded = tabletWorkspace || expandedPermissionGroup === groupIndex;
          const selectedCount = group.rows.filter((row) => permissions.includes(row.key)).length;
          return (
          <View key={group.title} style={{ minWidth: 0, flexGrow: 1, flexBasis: tabletWorkspace ? '46%' : '100%', borderTopWidth: 1, borderTopColor: palette.border }}>
            <Pressable
              accessible={!tabletWorkspace}
              accessibilityRole={tabletWorkspace ? undefined : 'button'}
              accessibilityState={tabletWorkspace ? undefined : { expanded }}
              disabled={tabletWorkspace}
              onPress={() => setExpandedPermissionGroup((current) => current === groupIndex ? -1 : groupIndex)}
              style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, opacity: pressed ? 0.72 : 1 })}
            >
              <Text style={[typeScale.cardTitle, { flex: 1 }]}>{group.title}</Text>
              <Text style={[typeScale.caption, { color: palette.muted }]}>{selectedCount}/{group.rows.length}</Text>
              {!tabletWorkspace ? <AppIcon color={palette.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={17} /> : null}
            </Pressable>
            {expanded ? group.rows.map((row) => {
              const active = permissions.includes(row.key);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  key={row.key}
                  onPress={() => toggle(row.key)}
                  style={({ pressed }) => ({
                    minHeight: 50,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: palette.border,
                    backgroundColor: pressed ? palette.surfaceSubtle : palette.surface,
                    paddingVertical: spacing.sm,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text style={{
                    flex: 1,
                    color: palette.text,
                    fontSize: 14,
                    fontWeight: '600',
                  }}>
                    {row.label}
                  </Text>
                  <AppIcon color={active ? palette.accent : palette.muted} name={active ? 'checkbox' : 'square-outline'} size={22} />
                </Pressable>
              );
            }) : null}
          </View>
          );
        })}
        </View>
      </Surface>

      {tabletWorkspace || editing ? <Surface>
        {tabletWorkspace ? <Button
          icon="checkmark"
          label={editing
            ? copy('บันทึกบทบาท', 'Save role')
            : copy('เพิ่มบทบาท', 'Add role')}
          onPress={save}
          loading={saving}
        /> : null}
        {editing ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {confirmDelete ? (
              <Button
                variant="secondary"
                label={copy('เก็บบทบาทไว้', 'Keep role')}
                onPress={() => setConfirmDelete(false)}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button
              variant={confirmDelete ? 'danger' : 'secondary'}
              icon="trash-outline"
              label={confirmDelete
                ? copy('ยืนยันลบบทบาท', 'Confirm delete')
                : copy('ลบบทบาท', 'Delete role')}
              onPress={remove}
              loading={saving}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
      </Surface> : null}
    </AppScreen>
  );
}
