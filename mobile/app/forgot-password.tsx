import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { requestPasswordReset } from '@/src/api/auth';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, TextField } from '@/src/components/ui';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { spacing } from '@/src/theme';

export default function ForgotPasswordScreen() {
  const { copy } = useDisplayPreferences();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!email.trim()) {
      setError(copy('กรอกอีเมล', 'Enter your email'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('ส่งคำขอไม่สำเร็จ', 'Could not send the request'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthScreen
      title={copy('ลืมรหัสผ่าน', 'Forgot password')}
      subtitle={copy(
        'กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่',
        'Enter your email to receive a reset link.',
      )}
      showBack
    >
      <View style={{ gap: spacing.xl }}>
        {error ? (
          <Feedback
            title={copy('ส่งคำขอไม่ได้', 'Could not send request')}
            detail={error}
            tone="danger"
          />
        ) : null}
        {sent ? (
          <>
            <Feedback
              title={copy('ตรวจสอบอีเมล', 'Check your email')}
              detail={copy(
                'หากอีเมลนี้มีบัญชี คุณจะได้รับลิงก์ตั้งรหัสผ่านใหม่',
                'If an account uses this email, you will receive a reset link.',
              )}
              tone="success"
            />
            <Button
              icon="arrow-back"
              label={copy('กลับไปเข้าสู่ระบบ', 'Back to sign in')}
              onPress={() => router.replace('/login')}
            />
          </>
        ) : (
          <>
            <TextField
              icon="mail-outline"
              label={copy('อีเมล', 'Email')}
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setError(null);
              }}
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Button
              icon="paper-plane-outline"
              label={copy('ส่งลิงก์', 'Send reset link')}
              onPress={submit}
              loading={saving}
            />
          </>
        )}
      </View>
    </AuthScreen>
  );
}
