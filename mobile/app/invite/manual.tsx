import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, Surface, TextField } from '@/src/components/ui';

function tokenFrom(value: string) { const parts = value.trim().split('/').filter(Boolean); return parts.at(-1) || ''; }
export default function ManualInviteScreen() {
  const [value, setValue] = useState(''); const [error, setError] = useState<string | null>(null);
  function submit() { const token = tokenFrom(value); if (!token) { setError('วางลิงก์หรือ token คำเชิญก่อน'); return; } router.push({ pathname: '/invite/[token]', params: { token } } as never); }
  return <AuthScreen title="รับคำเชิญพนักงาน" subtitle="วางลิงก์ที่เจ้าของร้านหรือผู้จัดการส่งให้" showBack><Surface>{error ? <Feedback title="ตรวจคำเชิญไม่ได้" detail={error} tone="danger" /> : null}<TextField label="ลิงก์หรือ token" value={value} onChangeText={setValue} placeholder="https://dishy.pro/invitations/..." multiline /><Button label="ตรวจคำเชิญ" onPress={submit} /></Surface></AuthScreen>;
}
