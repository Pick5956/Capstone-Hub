import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthScreen } from '@/src/components/auth-screen';
import { AppText as Text } from '@/src/components/app-text';
import { Button, Feedback, Surface, TextField } from '@/src/components/ui';
import { invitationTokenFrom } from '@/src/lib/staff-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing } from '@/src/theme';

export default function LoginScreen() {
  const { inviteToken: rawInviteToken } = useLocalSearchParams<{ inviteToken?: string }>();
  const inviteToken = invitationTokenFrom(rawInviteToken || '');
  const { signIn, signInWithGoogle, user, status } = useAuth();
  const { copy } = useDisplayPreferences();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  if (user) {
    return inviteToken
      ? <Redirect href={{ pathname: '/invite/[token]', params: { token: inviteToken } }} />
      : <Redirect href="/" />;
  }

  async function submit() {
    if (!email.trim() || !password) {
      setError(copy('กรอกอีเมลและรหัสผ่านให้ครบ', 'Enter both your email and password'));
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
      title={copy('เข้าใช้งานร้าน', 'Sign in to your restaurant')}
      subtitle={inviteToken
        ? copy(
          'เข้าสู่ระบบแล้ว Dishy จะพากลับไปยืนยันคำเชิญนี้',
          'After you sign in, Dishy will bring you back to accept this invitation.',
        )
        : copy(
          'ใช้บัญชีเดียวกับเว็บ ระบบจะโหลดร้านและสิทธิ์ของคุณโดยอัตโนมัติ',
          'Use the same account as the web app. Your restaurants and permissions will load automatically.',
        )}
    >
      <Surface>
        {error ? (
          <Feedback
            title={copy('เข้าสู่ระบบไม่ได้', 'Unable to sign in')}
            detail={error}
            tone="danger"
          />
        ) : null}

        <TextField
          label={copy('อีเมล', 'Email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <TextField
          label={copy('รหัสผ่าน', 'Password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Button
          label={copy('เข้าสู่ระบบ', 'Sign in')}
          onPress={submit}
          loading={submitting || status === 'loading'}
          disabled={googleSubmitting}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ height: 1, flex: 1, backgroundColor: palette.border }} />
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {copy('หรือ', 'or')}
          </Text>
          <View style={{ height: 1, flex: 1, backgroundColor: palette.border }} />
        </View>

        <Button
          variant="secondary"
          label={copy('เข้าสู่ระบบด้วย Google', 'Sign in with Google')}
          onPress={submitGoogle}
          loading={googleSubmitting}
          disabled={busy && !googleSubmitting}
          leading={
            <View
              style={{
                width: 22,
                height: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: palette.borderStrong,
                borderRadius: radius.sm,
                backgroundColor: palette.surface,
              }}
            >
              <Text style={{ color: palette.textStrong, fontSize: 13, fontWeight: '800' }}>
                G
              </Text>
            </View>
          }
        />

        <Button
          variant="ghost"
          label={copy('ลืมรหัสผ่าน', 'Forgot password')}
          onPress={() => router.push('/forgot-password' as never)}
          disabled={busy}
        />
        <Button
          variant="secondary"
          label={copy('สร้างบัญชีใหม่', 'Create an account')}
          onPress={() => router.push(inviteToken
            ? { pathname: '/register', params: { inviteToken } } as never
            : '/register' as never)}
          disabled={busy}
        />
      </Surface>
    </AuthScreen>
  );
}
