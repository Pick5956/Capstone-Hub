import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FormField } from '@/src/components/form-controls';
import { MobileScreen } from '@/src/components/mobile-screen';
import { colors, layout, typeScale } from '@/src/theme';

function extractToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] || trimmed;
}

export default function ManualInviteScreen() {
  const [tokenOrLink, setTokenOrLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const token = extractToken(tokenOrLink);
    if (!token) {
      setError('ใส่ลิงก์หรือ token คำเชิญก่อน');
      return;
    }
    router.push({ pathname: '/invite/[token]', params: { token } } as never);
  }

  return (
    <MobileScreen kicker="INVITE" title="รับคำเชิญพนักงาน" subtitle="วางลิงก์จากเจ้าของร้าน">
      <View style={layout.panel}>
        <FormField
          label="ลิงก์หรือ token"
          value={tokenOrLink}
          onChangeText={setTokenOrLink}
          placeholder="https://dishy.pro/invitations/..."
        />
        {error ? <Text selectable style={[typeScale.caption, { color: colors.danger }]}>{error}</Text> : null}
        <Pressable onPress={submit} style={layout.primaryButton}>
          <Text style={layout.primaryButtonText}>ตรวจคำเชิญ</Text>
        </Pressable>
      </View>
    </MobileScreen>
  );
}
