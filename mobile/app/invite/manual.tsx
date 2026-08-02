import { router } from 'expo-router';
import { useState } from 'react';

import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, Surface, TextField } from '@/src/components/ui';
import { invitationTokenFrom } from '@/src/lib/staff-workflow';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';

export default function ManualInviteScreen() {
  const { copy } = useDisplayPreferences();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const token = invitationTokenFrom(value);
    if (!token) {
      setError(copy(
        'ลิงก์หรือ token คำเชิญไม่ถูกต้อง',
        'The invitation link or token is invalid',
      ));
      return;
    }
    setError(null);
    router.push({ pathname: '/invite/[token]', params: { token } } as never);
  }

  return (
    <AuthScreen
      title={copy('รับคำเชิญเข้าร่วมร้าน', 'Join a restaurant')}
      subtitle={copy(
        'วางลิงก์ Dishy ที่เจ้าของร้านหรือผู้จัดการส่งให้',
        'Paste the Dishy link sent by the restaurant owner or manager',
      )}
      showBack
    >
      <Surface>
        {error ? (
          <Feedback
            title={copy('ตรวจคำเชิญไม่ได้', 'Unable to check invitation')}
            detail={error}
            tone="danger"
          />
        ) : null}
        <TextField
          label={copy('ลิงก์หรือ token', 'Link or token')}
          value={value}
          onChangeText={setValue}
          placeholder="https://dishy.pro/invitations/..."
          multiline
        />
        <Button
          label={copy('ตรวจคำเชิญ', 'Check invitation')}
          onPress={submit}
        />
      </Surface>
    </AuthScreen>
  );
}
