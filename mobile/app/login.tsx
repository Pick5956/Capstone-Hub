import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, Surface, TextField } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { spacing } from '@/src/theme';

export default function LoginScreen() {
  const { signIn, user, status } = useAuth(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  if (user) return <Redirect href="/" />;
  async function submit() { if (!email.trim() || !password) { setError('กรอกอีเมลและรหัสผ่านให้ครบ'); return; } setSubmitting(true); setError(null); try { await signIn(email.trim(), password); } catch (err) { setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ'); } finally { setSubmitting(false); } }
  return <AuthScreen title="เข้าใช้งานร้าน" subtitle="ใช้บัญชีเดียวกับเว็บ ระบบจะโหลดร้านและสิทธิ์ของคุณโดยอัตโนมัติ"><Surface>{error ? <Feedback title="เข้าสู่ระบบไม่ได้" detail={error} tone="danger" /> : null}<TextField label="อีเมล" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" /><TextField label="รหัสผ่าน" value={password} onChangeText={setPassword} secureTextEntry /><Button label="เข้าสู่ระบบ" onPress={submit} loading={submitting || status === 'loading'} /><Button variant="ghost" label="ลืมรหัสผ่าน" onPress={() => router.push('/forgot-password' as never)} /><Button variant="secondary" label="สร้างบัญชีใหม่" onPress={() => router.push('/register' as never)} /></Surface></AuthScreen>;
}
