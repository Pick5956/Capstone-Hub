import { useEffect, useMemo, useState } from 'react';
import { Share, useWindowDimensions, View } from 'react-native';

import { getRoles } from '@/src/api/auth';
import { createInvitation } from '@/src/api/restaurant';
import { AppIcon } from '@/src/components/app-icon';
import { AppScreen } from '@/src/components/app-shell';
import {
  ActionDock,
  Button,
  ChipGroup,
  EmptyState,
  Feedback,
  SectionHeader,
  Surface,
  TextField,
} from '@/src/components/ui';
import {
  allowedRoleOptions,
  canGrantRole,
  canManageInvitations,
  DEFAULT_INVITATION_EXPIRY_DAYS,
  invitationExpiryLabel,
  INVITATION_EXPIRY_DAY_OPTIONS,
  roleLabel,
} from '@/src/lib/staff-workflow';
import { invitationUrl } from '@/src/lib/public-web-url';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing } from '@/src/theme';
import type { Role } from '@/src/types/restaurant';

export default function InviteStaffScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const restaurantId = activeMembership?.restaurant_id;
  const actorRole = activeMembership?.role?.name;
  const allowed = canManageInvitations(activeMembership);
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState(0);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(DEFAULT_INVITATION_EXPIRY_DAYS);
  const [link, setLink] = useState('');
  const [shareTitle, setShareTitle] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed || !restaurantId) {
      setLoadingRoles(false);
      return;
    }
    setLoadingRoles(true);
    getRoles()
      .then((response) => {
        const available = allowedRoleOptions(actorRole, response.data || [], allowed)
          .filter((role) => canGrantRole(activeMembership, role));
        setRoles(available);
        setRoleId(
          available.find((role) => role.name === 'waiter')?.ID
            || available[0]?.ID
            || 0,
        );
      })
      .catch((err) => {
        setError(err instanceof Error
          ? err.message
          : copy('โหลดบทบาทไม่สำเร็จ', 'Unable to load roles'));
      })
      .finally(() => setLoadingRoles(false));
  }, [activeMembership, actorRole, allowed, copy, restaurantId]);

  const roleOptions = useMemo(
    () => roles.map((role) => ({ label: roleLabel(role, language), value: role.ID })),
    [language, roles],
  );

  async function create() {
    if (!restaurantId || !roleId) {
      setError(copy(
        'เลือกรายการบทบาทก่อนสร้างคำเชิญ',
        'Select a role before creating an invitation.',
      ));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const invitation = await createInvitation(restaurantId, {
        role_id: roleId,
        email: email.trim().toLowerCase() || undefined,
        expires_in_days: days,
      });
      const invitationLink = invitationUrl(invitation.token);
      const restaurantName = activeMembership?.restaurant?.name
        || copy('ร้านอาหาร', 'Restaurant');
      const selectedRole = roles.find((role) => role.ID === roleId);
      setLink(invitationLink);
      setShareTitle(copy(
        `คำเชิญเข้าร่วมร้าน ${restaurantName} บน Dishy`,
        `Invitation to join ${restaurantName} on Dishy`,
      ));
      setShareMessage(
        copy(
          `คุณได้รับคำเชิญเข้าร่วมร้าน ${restaurantName} ในบทบาท ${roleLabel(selectedRole, language)}\n${invitationLink}`,
          `You have been invited to join ${restaurantName} as ${roleLabel(selectedRole, language)}.\n${invitationLink}`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('สร้างคำเชิญไม่สำเร็จ', 'Unable to create invitation'));
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <AppScreen title={copy('เชิญพนักงาน', 'Invite staff')} topLevel={false}>
        <EmptyState
          title={copy('ไม่มีสิทธิ์สร้างคำเชิญ', 'No invitation access')}
          detail={copy(
            'บัญชีนี้ไม่ได้รับสิทธิ์สร้างและจัดการคำเชิญ',
            'This account cannot create or manage invitations.',
          )}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('เชิญพนักงาน', 'Invite staff')}
      subtitle={copy('สร้างลิงก์ตามบทบาทและวันหมดอายุ', 'Create a role-based invitation link')}
      topLevel={false}
      footer={!tabletWorkspace && !link ? (
        <ActionDock>
          <Button icon="link-outline" label={copy('สร้างลิงก์เชิญ', 'Create invitation')} onPress={create} loading={saving || loadingRoles} disabled={!roleId} />
        </ActionDock>
      ) : undefined}
    >
      {error ? (
        <Feedback
          title={copy('สร้างคำเชิญไม่ได้', 'Unable to create invitation')}
          detail={error}
          tone="danger"
        />
      ) : null}
      {link ? (
        <Surface style={{ maxWidth: tabletWorkspace ? 620 : undefined, alignSelf: tabletWorkspace ? 'center' : undefined, width: '100%' }}>
          <SectionHeader
            title={copy('ลิงก์พร้อมใช้งาน', 'Invitation link ready')}
            detail={copy('ส่งให้ผู้รับโดยตรง ลิงก์นี้ให้สิทธิ์ตามบทบาทที่เลือก', 'Send this directly. It grants the selected role.')}
            action={<AppIcon color={palette.success} name="checkmark-circle" size={24} />}
          />
          <Button
            icon="share-social-outline"
            label={copy('แชร์ลิงก์เชิญ', 'Share invitation link')}
            onPress={() => Share.share({ title: shareTitle, message: shareMessage || link })}
          />
          <Button
            icon="add-outline"
            variant="secondary"
            label={copy('สร้างลิงก์ใหม่', 'Create another link')}
            onPress={() => {
              setLink('');
              setShareMessage('');
            }}
          />
        </Surface>
      ) : (
        <Surface>
          <SectionHeader
            title={copy('ข้อมูลคำเชิญ', 'Invitation details')}
            detail={copy('อีเมลไม่บังคับ ลิงก์ที่ผูกอีเมลจะใช้ได้เฉพาะบัญชีนั้น', 'Email is optional. Email-bound links work only for that account.')}
            action={<AppIcon color={palette.muted} name="person-add-outline" size={22} />}
          />
          <TextField
            label={copy('อีเมลผู้รับ (ไม่บังคับ)', 'Recipient email (optional)')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="staff@example.com"
          />
          <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
            <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: 1 }}>
          {roleOptions.length ? (
              <ChipGroup label={copy('บทบาท', 'Role')} value={roleId} onChange={setRoleId} options={roleOptions} />
          ) : !loadingRoles ? (
            <EmptyState
              title={copy('ไม่มีบทบาทที่เชิญได้', 'No roles available')}
              detail={copy(
                'บัญชีนี้มอบได้เฉพาะบทบาทที่มีสิทธิ์ไม่เกินขอบเขตของตนเอง',
                'You can invite only to roles within your own permission scope.',
              )}
            />
          ) : null}
            </View>
            <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: 1 }}>
              <ChipGroup label={copy('อายุลิงก์', 'Link lifetime')} value={days} onChange={setDays} options={INVITATION_EXPIRY_DAY_OPTIONS.map((value) => ({ label: invitationExpiryLabel(value, language), value }))} />
            </View>
          </View>
          {tabletWorkspace ? <Button icon="link-outline" label={copy('สร้างลิงก์เชิญ', 'Create invitation')} onPress={create} loading={saving || loadingRoles} disabled={!roleId} /> : null}
        </Surface>
      )}
    </AppScreen>
  );
}
