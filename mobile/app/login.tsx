import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ApiError, apiUrl } from '@/src/api/client';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, inputStyles, layout, typeScale } from '@/src/theme';

interface DebugLine {
  id: number;
  text: string;
}

export default function LoginScreen() {
  const { signIn, user, status } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [debugLines, setDebugLines] = useState<DebugLine[]>([]);

  function addDebug(text: string) {
    setDebugLines((current) => [
      { id: Date.now() + Math.random(), text: `${new Date().toLocaleTimeString()} ${text}` },
      ...current,
    ].slice(0, 8));
  }

  async function testApi() {
    addDebug(`GET ${apiUrl}/health`);
    try {
      const response = await fetch(`${apiUrl}/health`);
      const body = await response.text();
      addDebug(`health ${response.status}: ${body || '(empty)'}`);
    } catch (err) {
      addDebug(`health network error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  useEffect(() => {
    addDebug(`API URL: ${apiUrl}`);
    testApi();
  }, []);

  if (user) {
    return <Redirect href="/" />;
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    addDebug(`POST ${apiUrl}/api/login email=${email.trim() || '(empty)'}`);
    try {
      await signIn(email.trim(), password);
      addDebug('login success');
    } catch (err) {
      if (err instanceof ApiError) {
        addDebug(`login ${err.status}: ${err.message}`);
        if (err.details) addDebug(`body: ${err.details}`);
      } else {
        addDebug(`login error: ${err instanceof Error ? err.message : String(err)}`);
      }
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={layout.scrollContainer}>
        <View style={{ gap: 8 }}>
          <Text selectable style={typeScale.kicker}>RESTAURANT HUB</Text>
          <Text selectable style={typeScale.hero}>เข้าใช้งานร้าน</Text>
          <Text selectable style={[typeScale.body, { color: colors.muted }]}>
            ใช้บัญชีเดียวกับเว็บ ระบบจะเชื่อมร้านและสิทธิ์จาก backend เดิม
          </Text>
        </View>

        <View style={layout.panel}>
          <View style={inputStyles.fieldGroup}>
            <Text selectable style={inputStyles.label}>อีเมล</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.placeholder}
              style={inputStyles.input}
              value={email}
            />
          </View>

          <View style={inputStyles.fieldGroup}>
            <Text selectable style={inputStyles.label}>รหัสผ่าน</Text>
            <TextInput
              onChangeText={setPassword}
              placeholder="รหัสผ่าน"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              style={inputStyles.input}
              value={password}
            />
          </View>

          {error ? (
            <Text selectable style={[typeScale.caption, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}

          <Pressable
            disabled={submitting || status === 'loading'}
            onPress={submit}
            style={({ pressed }) => [
              layout.primaryButton,
              (pressed || submitting) && { opacity: 0.78 },
            ]}
          >
            <Text style={layout.primaryButtonText}>{submitting ? 'กำลังเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}</Text>
          </Pressable>
        </View>

        <View style={layout.panel}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text selectable style={typeScale.cardTitle}>Debug login</Text>
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                Shows API URL, health check, login status, and response body.
              </Text>
            </View>
            <Pressable onPress={testApi} style={layout.secondaryButton}>
              <Text style={layout.secondaryButtonText}>Test API</Text>
            </Pressable>
          </View>

          <View style={{ gap: 6 }}>
            {debugLines.length === 0 ? (
              <Text selectable style={[typeScale.caption, { color: colors.muted }]}>No logs yet.</Text>
            ) : (
              debugLines.map((line) => (
                <Text key={line.id} selectable style={[typeScale.caption, { color: colors.muted }]}>
                  {line.text}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
