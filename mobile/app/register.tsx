import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';

import { register } from '@/src/api/auth';
import { FormField } from '@/src/components/form-controls';
import { colors, layout, typeScale } from '@/src/theme';

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await register({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nickname: nickname.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างบัญชีไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={layout.scrollContainer}>
        <View style={layout.headerRow}>
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>กลับ</Text>
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text selectable style={typeScale.kicker}>ACCOUNT</Text>
            <Text selectable style={typeScale.hero}>สร้างบัญชี</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              พนักงานที่ได้รับลิงก์เชิญต้องมีบัญชีก่อนรับคำเชิญ
            </Text>
          </View>
        </View>

        <View style={layout.panel}>
          <FormField label="ชื่อ" value={firstName} onChangeText={setFirstName} placeholder="ชื่อจริง" />
          <FormField label="นามสกุล" value={lastName} onChangeText={setLastName} placeholder="นามสกุล" />
          <FormField label="ชื่อเล่น" value={nickname} onChangeText={setNickname} placeholder="ชื่อที่ใช้ในร้าน" />
          <FormField label="อีเมล" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <FormField label="เบอร์โทร" value={phone} onChangeText={setPhone} placeholder="08x-xxx-xxxx" keyboardType="phone-pad" />
          <FormField label="รหัสผ่าน" value={password} onChangeText={setPassword} placeholder="อย่างน้อย 6 ตัวอักษร" secureTextEntry />
          {error ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{error}</Text> : null}
          <Pressable disabled={submitting} onPress={submit} style={[layout.primaryButton, submitting && { opacity: 0.7 }]}>
            <Text style={layout.primaryButtonText}>{submitting ? 'กำลังสร้างบัญชี' : 'สร้างบัญชี'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
