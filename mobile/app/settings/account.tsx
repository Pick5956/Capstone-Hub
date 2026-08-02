import { useEffect, useState } from 'react';

import { updateProfile } from '@/src/api/auth';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Feedback, SectionHeader, Surface, TextField } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';

export default function AccountSettingsScreen() {
  const { user, refreshProfile } = useAuth();
  const { copy } = useDisplayPreferences();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(user?.first_name || '');
    setLastName(user?.last_name || '');
    setNickname(user?.nickname || '');
    setPhone(user?.phone || '');
  }, [user]);

  async function save() {
    if (!firstName.trim() || !lastName.trim()) {
      setError(copy(
        'กรอกชื่อและนามสกุลให้ครบ',
        'Enter both your first and last name',
      ));
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nickname: nickname.trim(),
        phone: phone.trim(),
      });
      await refreshProfile();
      setMessage(copy('บันทึกข้อมูลบัญชีแล้ว', 'Account information saved'));
    } catch (err) {
      setError(err instanceof Error
        ? err.message
        : copy('บันทึกบัญชีไม่สำเร็จ', 'Could not save account information'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen
      title={copy('บัญชีของฉัน', 'My account')}
      subtitle={user?.email || copy('ข้อมูลผู้ใช้งาน', 'User information')}
      topLevel={false}
    >
      {error ? (
        <Feedback
          title={copy('บันทึกไม่ได้', 'Unable to save')}
          detail={error}
          tone="danger"
        />
      ) : null}
      {message ? <Feedback title={message} tone="success" /> : null}
      <Surface>
        <SectionHeader title={copy('ข้อมูลส่วนตัว', 'Personal information')} />
        <TextField
          label={copy('ชื่อ', 'First name')}
          value={firstName}
          onChangeText={setFirstName}
        />
        <TextField
          label={copy('นามสกุล', 'Last name')}
          value={lastName}
          onChangeText={setLastName}
        />
        <TextField
          label={copy('ชื่อเล่น', 'Nickname')}
          value={nickname}
          onChangeText={setNickname}
        />
        <TextField
          label={copy('เบอร์โทร', 'Phone number')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Button
          label={copy('บันทึกข้อมูลบัญชี', 'Save account information')}
          onPress={save}
          loading={saving}
        />
      </Surface>
      <Surface>
        <SectionHeader
          title={copy('วิธีเข้าสู่ระบบ', 'Sign-in method')}
          detail={user?.auth_provider === 'google'
            ? copy('บัญชีนี้เชื่อมกับ Google', 'This account is connected to Google')
            : copy('บัญชีนี้ใช้รหัสผ่าน', 'This account uses a password')}
        />
      </Surface>
    </AppScreen>
  );
}
