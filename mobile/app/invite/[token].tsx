import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { acceptInvitation, getInvitationByToken } from '@/src/api/restaurant';
import { AppText as Text } from '@/src/components/app-text';
import { AuthScreen } from '@/src/components/auth-screen';
import {
  Button,
  Feedback,
  SectionHeader,
  StatusBadge,
  Surface,
} from '@/src/components/ui';
import {
  invitationEmailMismatch,
  invitationTokenFrom,
  roleLabel,
  userDisplayName,
} from '@/src/lib/staff-workflow';
import { getDefaultWorkspaceRoute } from '@/src/lib/work-mode';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing, typeScale } from '@/src/theme';
import type { Invitation } from '@/src/types/restaurant';

type Copy = (thai: string, english: string) => string;

function invitationStatusLabel(
  invitation: Invitation,
  usable: boolean,
  copy: Copy,
) {
  if (usable) return copy('พร้อมรับคำเชิญ', 'Ready to accept');
  if (invitation.status === 'accepted') {
    return copy('รับคำเชิญแล้ว', 'Invitation accepted');
  }
  if (invitation.status === 'revoked') {
    return copy('ยกเลิกแล้ว', 'Invitation revoked');
  }
  if (invitation.status === 'expired') {
    return copy('หมดอายุแล้ว', 'Invitation expired');
  }
  return copy('ใช้งานไม่ได้', 'Unavailable');
}

function formatExpiry(
  value: string | null | undefined,
  language: 'th' | 'en',
  copy: Copy,
) {
  if (!value) return copy('ไม่หมดอายุ', 'No expiry');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy('ไม่ระบุ', 'Not specified');
  return date.toLocaleString(language === 'th' ? 'th-TH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function localizedRoleLabel(
  role: Invitation['role'],
  language: 'th' | 'en',
): string {
  if (language === 'th') return roleLabel(role);
  const roleName = role?.name;
  if (roleName === 'owner') return 'Owner';
  if (roleName === 'manager') return 'Manager';
  if (roleName === 'cashier') return 'Cashier';
  if (roleName === 'waiter') return 'Server';
  if (roleName === 'chef') return 'Kitchen';
  return role?.display_name?.trim() || roleName || 'Staff';
}

export default function InviteTokenScreen() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = useMemo(() => invitationTokenFrom(params.token || ''), [params.token]);
  const {
    refreshMemberships,
    setActiveRestaurantFromMembership,
    status,
    user,
  } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [usable, setUsable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acceptingRef = useRef(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError(copy('ลิงก์คำเชิญไม่ถูกต้อง', 'The invitation link is invalid'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getInvitationByToken(token);
      setInvitation(response.invitation);
      setUsable(response.usable);
    } catch (err) {
      setInvitation(null);
      setUsable(false);
      setError(err instanceof Error
        ? err.message
        : copy(
          'ไม่พบคำเชิญหรือคำเชิญถูกลบแล้ว',
          'The invitation was not found or has been deleted',
        ));
    } finally {
      setLoading(false);
    }
  }, [copy, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!params.token) return <Redirect href="/invite/manual" />;

  const emailMismatch = invitationEmailMismatch(invitation?.email, user?.email);

  async function accept() {
    if (!token || !usable || emailMismatch || acceptingRef.current) return;
    if (!user) {
      router.push({ pathname: '/login', params: { inviteToken: token } } as never);
      return;
    }

    acceptingRef.current = true;
    setAccepting(true);
    setError(null);
    try {
      const response = await acceptInvitation(token);
      await setActiveRestaurantFromMembership(response.membership);
      await refreshMemberships().catch(() => undefined);
      router.replace(getDefaultWorkspaceRoute(response.membership));
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy(
          'รับคำเชิญไม่สำเร็จ กรุณาตรวจบัญชีหรือขอลิงก์ใหม่',
          'Could not accept the invitation. Check your account or request a new link.',
        ));
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  }

  return (
    <AuthScreen
      title={copy('คำเชิญเข้าร่วมร้าน', 'Restaurant invitation')}
      subtitle={copy(
        'ตรวจรายละเอียดและบัญชีก่อนยืนยันเข้าร่วมทีมบน Dishy',
        'Review the details and account before joining this team on Dishy',
      )}
      showBack
    >
      {error ? (
        <Feedback
          title={copy('ตรวจคำเชิญไม่ได้', 'Unable to check invitation')}
          detail={error}
          tone="danger"
        />
      ) : null}
      {error && !invitation ? (
        <Button
          variant="secondary"
          label={copy('ลองอีกครั้ง', 'Try again')}
          onPress={load}
          loading={loading}
        />
      ) : null}

      {invitation ? (
        <Surface>
          <SectionHeader
            title={invitation.restaurant?.name || copy(
              `ร้าน #${invitation.restaurant_id}`,
              `Restaurant #${invitation.restaurant_id}`,
            )}
            detail={invitation.restaurant?.address
              || copy('ยังไม่ระบุที่อยู่', 'Address not provided')}
            action={(
              <StatusBadge
                label={invitationStatusLabel(invitation, usable, copy)}
                tone={usable ? 'success' : invitation.status === 'revoked' ? 'danger' : 'warning'}
              />
            )}
          />

          <View style={{ gap: spacing.md }}>
            {[
              {
                label: copy('บทบาท', 'Role'),
                value: localizedRoleLabel(invitation.role, language),
              },
              {
                label: copy('หมดอายุ', 'Expires'),
                value: formatExpiry(invitation.expires_at, language, copy),
              },
              {
                label: copy('อีเมลที่รับได้', 'Eligible email'),
                value: invitation.email
                  || copy('ทุกบัญชีที่มีลิงก์', 'Any account with this link'),
              },
            ].map((item) => (
              <View key={item.label} style={{ gap: 3 }}>
                <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                  {item.label}
                </Text>
                <Text selectable style={typeScale.cardTitle}>{item.value}</Text>
              </View>
            ))}
          </View>

          {user ? (
            <Feedback
              title={emailMismatch
                ? copy(
                  'บัญชีนี้ไม่ตรงกับอีเมลในคำเชิญ',
                  'This account does not match the invitation email',
                )
                : copy(
                  `พร้อมรับคำเชิญในชื่อ ${userDisplayName(user)}`,
                  `Ready to accept as ${userDisplayName(user)}`,
                )}
              detail={emailMismatch
                ? copy(
                  `กำลังใช้ ${user.email} กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับคำเชิญ`,
                  `You are signed in as ${user.email}. Sign in with the invited account.`,
                )
                : user.email}
              tone={emailMismatch ? 'danger' : 'success'}
            />
          ) : (
            <Feedback
              title={copy(
                'ต้องเข้าสู่ระบบก่อนรับคำเชิญ',
                'Sign in before accepting',
              )}
              detail={copy(
                'เข้าสู่ระบบด้วยอีเมล/รหัสผ่านหรือ Google แล้วระบบจะพากลับมาที่คำเชิญนี้',
                'Sign in with your email and password or Google, then Dishy will bring you back to this invitation.',
              )}
              tone="warning"
            />
          )}

          <Button
            label={accepting
              ? copy('กำลังรับคำเชิญ', 'Accepting invitation')
              : user
                ? copy('รับคำเชิญและเข้าร่วมร้าน', 'Accept and join restaurant')
                : copy('เข้าสู่ระบบเพื่อรับคำเชิญ', 'Sign in to accept')}
            onPress={accept}
            loading={accepting || status === 'loading'}
            disabled={!usable || emailMismatch}
          />
          {!user ? (
            <Button
              variant="secondary"
              label={copy('สร้างบัญชีใหม่', 'Create an account')}
              onPress={() => router.push({
                pathname: '/register',
                params: { inviteToken: token },
              } as never)}
            />
          ) : null}
        </Surface>
      ) : null}
    </AuthScreen>
  );
}
