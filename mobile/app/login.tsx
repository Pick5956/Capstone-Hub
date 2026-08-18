import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthScreen } from '@/src/components/auth-screen';
import { AppText as Text } from '@/src/components/app-text';
import { Button, Feedback, TextField } from '@/src/components/ui';
import { invitationTokenFrom } from '@/src/lib/staff-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing } from '@/src/theme';

export default function LoginScreen() {
  const { inviteToken: rawInviteToken } = useLocalSearchParams<{ inviteToken?: string }>();
  const inviteToken = invitationTokenFrom(rawInviteToken || '');
  const { signIn, signInWithGoogle, user, status } = useAuth();
  const { copy } = useDisplayPreferences();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailMissing, setEmailMissing] = useState(false);
  const [passwordMissing, setPasswordMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  if (user) {
    return inviteToken
      ? <Redirect href={{ pathname: '/invite/[token]', params: { token: inviteToken } }} />
      : <Redirect href="/" />;
  }

  async function submit() {
    const nextEmailMissing = !email.trim();
    const nextPasswordMissing = !password;
    setEmailMissing(nextEmailMissing);
    setPasswordMissing(nextPasswordMissing);
    if (nextEmailMissing || nextPasswordMissing) {
      setError(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      if (inviteToken) {
        router.replace({ pathname: '/invite/[token]', params: { token: inviteToken } } as never);
      }
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('เข้าสู่ระบบไม่สำเร็จ', 'Could not sign in'));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitGoogle() {
    setGoogleSubmitting(true);
    setError(null);
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn && inviteToken) {
        router.replace({ pathname: '/invite/[token]', params: { token: inviteToken } } as never);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        message === 'invalid google credentials'
          ? copy(
            'Google ยืนยันบัญชีนี้กับระบบไม่ได้ กรุณาตรวจการตั้งค่า OAuth',
            'Google could not verify this account. Check the OAuth configuration.',
          )
          : message || copy(
            'เข้าสู่ระบบด้วย Google ไม่สำเร็จ',
            'Could not sign in with Google',
          ),
      );
    } finally {
      setGoogleSubmitting(false);
    }
  }

  const busy = submitting || googleSubmitting || status === 'loading';

  if (status === 'recoverable-error') {
    return <Redirect href="/" />;
  }

  return (
    <AuthScreen
      title={copy('เข้าสู่ระบบ', 'Sign in')}
      subtitle={inviteToken
        ? copy(
          'เข้าสู่ระบบเพื่อเปิดคำเชิญนี้',
          'Sign in to open this invitation.',
        )
        : undefined}
    >
      <View style={{ gap: spacing.xl }}>
        {error ? (
          <Feedback
            title={copy('เข้าสู่ระบบไม่ได้', 'Unable to sign in')}
            detail={error}
            tone="danger"
          />
        ) : null}

        <Button
          icon="logo-google"
          variant="secondary"
          label={copy('ดำเนินการต่อด้วย Google', 'Continue with Google')}
          onPress={submitGoogle}
          loading={googleSubmitting}
          disabled={busy && !googleSubmitting}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ height: 1, flex: 1, backgroundColor: palette.border }} />
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>
            {copy('หรือใช้อีเมล', 'or use email')}
          </Text>
          <View style={{ height: 1, flex: 1, backgroundColor: palette.border }} />
        </View>

        <TextField
          icon="mail-outline"
          label={copy('อีเมล', 'Email')}
          autoComplete="email"
          textContentType="emailAddress"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setEmailMissing(false);
          }}
          keyboardType="email-address"
          placeholder="you@example.com"
          error={emailMissing ? copy('กรอกอีเมล', 'Enter your email') : null}
        />
        <TextField
          icon="lock-closed-outline"
          label={copy('รหัสผ่าน', 'Password')}
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordMissing(false);
          }}
          secureTextEntry
          revealLabel={copy('แสดง', 'Show')}
          hideLabel={copy('ซ่อน', 'Hide')}
          error={passwordMissing ? copy('กรอกรหัสผ่าน', 'Enter your password') : null}
        />

        <Pressable
          accessibilityRole="link"
          disabled={busy}
          onPress={() => router.push('/forgot-password' as never)}
          style={({ pressed }) => ({
            minHeight: 44,
            alignSelf: 'flex-end',
            justifyContent: 'center',
            marginTop: -spacing.md,
            opacity: busy ? 0.42 : pressed ? 0.58 : 1,
          })}
        >
          <Text style={{ color: palette.textStrong, fontSize: 13, fontWeight: '700' }}>
            {copy('ลืมรหัสผ่าน?', 'Forgot password?')}
          </Text>
        </Pressable>

        <Button
          icon="arrow-forward"
          label={copy('เข้าสู่ระบบ', 'Sign in')}
          onPress={submit}
          loading={submitting || status === 'loading'}
          disabled={googleSubmitting}
        />

        <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {copy('ยังไม่มีบัญชี?', 'New to Dishy?')}
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(inviteToken
              ? { pathname: '/register', params: { inviteToken } } as never
              : '/register' as never)}
            disabled={busy}
            hitSlop={10}
            style={({ pressed }) => ({
              minHeight: 44,
              minWidth: 44,
              justifyContent: 'center',
              opacity: busy ? 0.42 : pressed ? 0.58 : 1,
            })}
          >
            <Text style={{ color: palette.textStrong, fontSize: 13, fontWeight: '800' }}>
              {copy('สร้างบัญชี', 'Create account')}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthScreen>
  );
}
