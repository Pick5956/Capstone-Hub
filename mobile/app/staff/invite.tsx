import { useEffect, useMemo, useState } from 'react';
import { Share } from 'react-native';

import { getRoles } from '@/src/api/auth';
import { createInvitation } from '@/src/api/restaurant';
import { AppScreen } from '@/src/components/app-shell';
import {
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
  canManageTeam,
  DEFAULT_INVITATION_EXPIRY_DAYS,
  invitationExpiryLabel,
  INVITATION_EXPIRY_DAY_OPTIONS,
  roleLabel,
} from '@/src/lib/staff-workflow';
import { invitationUrl } from '@/src/lib/public-web-url';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import type { Role } from '@/src/types/restaurant';

export default function InviteStaffScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const restaurantId = activeMembership?.restaurant_id;
  const actorRole = activeMembership?.role?.name;
  const allowed = canManageTeam(activeMembership);
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
        const available = allowedRoleOptions(actorRole, response.data || []);
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
  }, [actorRole, allowed, copy, restaurantId]);

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
            'ต้องเป็นเจ้าของร้านหรือผู้จัดการที่มีสิทธิ์ manage_staff',
            'You must be an owner or manager with the manage_staff permission.',
          )}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title={copy('เชิญพนักงาน', 'Invite staff')}
      subtitle={copy(
        'ผู้รับตรวจรายละเอียด เข้าสู่ระบบ และยืนยันเข้าร่วมร้านจากลิงก์เดียว',
        'Recipients can review, sign in, and confirm joining from one link.',
      )}
      topLevel={false}
    >
      {error ? (
        <Feedback
          title={copy('สร้างคำเชิญไม่ได้', 'Unable to create invitation')}
          detail={error}
          tone="danger"
        />
      ) : null}
      {link ? (
        <Surface>
          <SectionHeader
            title={copy('ลิงก์พร้อมใช้งาน', 'Invitation link ready')}
            detail={copy(
              'ลิงก์นี้มีสิทธิ์เข้าร่วมร้านตามบทบาทที่เลือก ควรส่งให้ผู้รับโดยตรง',
              'This link grants the selected role. Send it directly to the intended recipient.',
            )}
          />
          <Button
            label={copy('แชร์ลิงก์เชิญ', 'Share invitation link')}
            onPress={() => Share.share({ title: shareTitle, message: shareMessage || link })}
          />
          <Button
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
            detail={copy(
              'ผู้จัดการจะเชิญได้เฉพาะบทบาทระดับปฏิบัติการตามลำดับสิทธิ์',
              'Managers can invite operational roles within their permission hierarchy.',
            )}
          />
          <TextField
            label={copy('อีเมลผู้รับ (ไม่บังคับ)', 'Recipient email (optional)')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="staff@example.com"
          />
          {roleOptions.length ? (
            <ChipGroup
              label={copy('บทบาท', 'Role')}
              value={roleId}
              onChange={setRoleId}
              options={roleOptions}
            />
          ) : !loadingRoles ? (
            <EmptyState
              title={copy('ไม่มีบทบาทที่เชิญได้', 'No roles available')}
              detail={copy(
                'เพิ่มบทบาทสำหรับร้านก่อนสร้างคำเชิญ',
                'Add a restaurant role before creating an invitation.',
              )}
            />
          ) : null}
          <ChipGroup
            label={copy('อายุลิงก์', 'Link lifetime')}
            value={days}
            onChange={setDays}
            options={INVITATION_EXPIRY_DAY_OPTIONS.map((value) => ({
              label: invitationExpiryLabel(value, language),
              value,
            }))}
          />
          <Button
            label={copy('สร้างลิงก์เชิญ', 'Create invitation link')}
            onPress={create}
            loading={saving || loadingRoles}
            disabled={!roleId}
          />
        </Surface>
      )}
    </AppScreen>
  );
}
