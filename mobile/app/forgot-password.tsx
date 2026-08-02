import { router } from 'expo-router';
import { useState } from 'react';

import { requestPasswordReset } from '@/src/api/auth';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, Surface, TextField } from '@/src/components/ui';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';

export default function ForgotPasswordScreen() {
  const { copy } = useDisplayPreferences();
  const [email, setEmail] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState(false);
  async function submit() { if (!email.trim()) return; setSaving(true); setError(null); try { await requestPasswordReset(email.trim()); setSent(true); } catch (err) { setError(err instanceof Error ? err.message : copy('ส่งคำขอไม่สำเร็จ', 'Could not send the request')); } finally { setSaving(false); } }
  return <AuthScreen title={copy('ลืมรหัสผ่าน', 'Forgot password')} subtitle={copy('ระบบจะส่งวิธีตั้งรหัสผ่านใหม่ไปยังอีเมลของคุณ', 'We will email you instructions for setting a new password.')} showBack><Surface>{error ? <Feedback title={copy('ส่งคำขอไม่ได้', 'Could not send request')} detail={error} tone="danger" /> : null}{sent ? <><Feedback title={copy('ตรวจสอบอีเมลของคุณ', 'Check your email')} detail={copy('ถ้าอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้', 'If an account uses this email, we will send a password reset link.')} tone="success" /><Button label={copy('กลับไปเข้าสู่ระบบ', 'Back to sign in')} onPress={() => router.replace('/login')} /></> : <><TextField label={copy('อีเมล', 'Email')} value={email} onChangeText={setEmail} keyboardType="email-address" /><Button label={copy('ส่งลิงก์ตั้งรหัสผ่าน', 'Send reset link')} onPress={submit} loading={saving} /></>}</Surface></AuthScreen>;
}
