import { router } from 'expo-router';
import { useState } from 'react';

import { requestPasswordReset } from '@/src/api/auth';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, Surface, TextField } from '@/src/components/ui';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState(false);
  async function submit() { if (!email.trim()) return; setSaving(true); setError(null); try { await requestPasswordReset(email.trim()); setSent(true); } catch (err) { setError(err instanceof Error ? err.message : 'ส่งคำขอไม่สำเร็จ'); } finally { setSaving(false); } }
  return <AuthScreen title="ลืมรหัสผ่าน" subtitle="ระบบจะส่งวิธีตั้งรหัสผ่านใหม่ไปยังอีเมลของคุณ" showBack><Surface>{error ? <Feedback title="ส่งคำขอไม่ได้" detail={error} tone="danger" /> : null}{sent ? <><Feedback title="ตรวจสอบอีเมลของคุณ" detail="ถ้าอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้" tone="success" /><Button label="กลับไปเข้าสู่ระบบ" onPress={() => router.replace('/login')} /></> : <><TextField label="อีเมล" value={email} onChangeText={setEmail} keyboardType="email-address" /><Button label="ส่งลิงก์ตั้งรหัสผ่าน" onPress={submit} loading={saving} /></>}</Surface></AuthScreen>;
}
