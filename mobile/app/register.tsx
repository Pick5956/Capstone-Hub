import { router } from 'expo-router';
import { useState } from 'react';

import { register } from '@/src/api/auth';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, Surface, TextField } from '@/src/components/ui';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [nickname, setNickname] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  async function submit() { if (!firstName.trim() || !lastName.trim() || !email.trim() || password.length < 6) { setError('กรอกชื่อ นามสกุล อีเมล และรหัสผ่านอย่างน้อย 6 ตัวอักษร'); return; } setSubmitting(true); setError(null); try { await register({ first_name: firstName.trim(), last_name: lastName.trim(), nickname: nickname.trim(), email: email.trim(), phone: phone.trim(), password }); router.replace('/login'); } catch (err) { setError(err instanceof Error ? err.message : 'สร้างบัญชีไม่สำเร็จ'); } finally { setSubmitting(false); } }
  return <AuthScreen title="สร้างบัญชี" subtitle="พนักงานที่ได้รับลิงก์เชิญต้องสร้างบัญชีก่อนรับคำเชิญ" showBack><Surface>{error ? <Feedback title="สร้างบัญชีไม่ได้" detail={error} tone="danger" /> : null}<TextField label="ชื่อ" value={firstName} onChangeText={setFirstName} /><TextField label="นามสกุล" value={lastName} onChangeText={setLastName} /><TextField label="ชื่อเล่นในร้าน" value={nickname} onChangeText={setNickname} /><TextField label="อีเมล" value={email} onChangeText={setEmail} keyboardType="email-address" /><TextField label="เบอร์โทร" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><TextField label="รหัสผ่าน" value={password} onChangeText={setPassword} secureTextEntry /><Button label="สร้างบัญชี" onPress={submit} loading={submitting} /></Surface></AuthScreen>;
}
