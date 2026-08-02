import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { register } from '@/src/api/auth';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, Surface, TextField } from '@/src/components/ui';
import {
  validateRegistrationInput,
  type RegistrationValidation,
} from '@/src/lib/auth-validation';
import {
  registerAndSignIn,
  registrationFallbackLoginRoute,
  registrationInviteRoute,
} from '@/src/lib/registration-flow';
import { invitationTokenFrom } from '@/src/lib/staff-workflow';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';

type RegistrationError = Exclude<RegistrationValidation, { valid: true }>['error'];

interface RegistrationFeedback {
  title: string;
  detail: string;
  tone: 'danger' | 'warning';
  field?: 'confirmPassword';
}

type Copy = (thai: string, english: string) => string;

function validationMessage(error: RegistrationError, copy: Copy): string {
  if (error === 'missing_required') {
    return copy(
      'กรอกชื่อ นามสกุล อีเมล รหัสผ่าน และยืนยันรหัสผ่านให้ครบ',
      'Enter your first name, last name, email, password, and password confirmation',
    );
  }
  if (error === 'password_mismatch') {
    return copy(
      'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน',
      'The passwords do not match',
    );
  }
  if (error === 'too_short') {
    return copy(
      'รหัสผ่านต้องมีอย่างน้อย 8 ไบต์',
      'Your password must be at least 8 bytes',
    );
  }
  return copy(
    'รหัสผ่านต้องไม่เกิน 72 ไบต์',
    'Your password must be no more than 72 bytes',
  );
}

function failureMessage(error: unknown, copy: Copy): string {
  return error instanceof Error && error.message
    ? error.message
    : copy(
      'สร้างบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง',
      'Could not create your account. Please try again.',
    );
}

export default function RegisterScreen() {
  const { inviteToken: rawInviteToken } = useLocalSearchParams<{ inviteToken?: string }>();
  const inviteToken = invitationTokenFrom(rawInviteToken || '');
  const { signIn } = useAuth();
  const { copy } = useDisplayPreferences();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState<RegistrationFeedback | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function goToLogin() {
    router.replace(registrationFallbackLoginRoute(inviteToken) as never);
  }

  function updatePassword(value: string) {
    setPassword(value);
    if (feedback?.field === 'confirmPassword') {
      setFeedback(null);
    }
  }

  function updateConfirmPassword(value: string) {
    setConfirmPassword(value);
    if (feedback?.field === 'confirmPassword') {
      setFeedback(null);
    }
  }

  async function submit() {
    const validation = validateRegistrationInput({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
    });
    if (!validation.valid) {
      setFeedback({
        title: copy('ตรวจสอบข้อมูลอีกครั้ง', 'Check your information'),
        detail: validationMessage(validation.error, copy),
        tone: 'danger',
        field: validation.error === 'password_mismatch' ? 'confirmPassword' : undefined,
      });
      return;
    }

    const registrationInput = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      nickname: nickname.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
    };

    setSubmitting(true);
    setFeedback(null);
    const result = await registerAndSignIn(registrationInput, {
      registerAccount: register,
      signIn,
    });
    setSubmitting(false);

    if (result.status === 'signed_in') {
      const invitationRoute = registrationInviteRoute(inviteToken);
      if (invitationRoute) {
        router.replace(invitationRoute as never);
      }
      return;
    }

    if (result.status === 'register_failed') {
      setFeedback({
        title: copy('สร้างบัญชีไม่ได้', 'Unable to create account'),
        detail: failureMessage(result.error, copy),
        tone: 'danger',
      });
      return;
    }

    setAccountCreated(true);
    setFeedback({
      title: copy('สร้างบัญชีแล้ว', 'Account created'),
      detail: copy(
        'ระบบเข้าสู่ระบบอัตโนมัติไม่ได้ บัญชีนี้พร้อมใช้งานแล้ว กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่านเดิม โดยไม่ต้องสมัครซ้ำ',
        'Automatic sign-in was unsuccessful, but your account is ready. Sign in with the same email and password—there is no need to register again.',
      ),
      tone: 'warning',
    });
  }

  return (
    <AuthScreen
      title={copy('สร้างบัญชี', 'Create an account')}
      subtitle={inviteToken
        ? copy(
          'สมัครและเข้าสู่ระบบ จากนั้น Dishy จะพากลับไปยืนยันคำเชิญนี้',
          'Create an account and sign in, then Dishy will bring you back to accept this invitation.',
        )
        : copy(
          'สมัครเสร็จแล้วระบบจะเข้าสู่ระบบให้ทันที เพื่อเลือกร้านหรือสร้างร้านใหม่',
          'After registration, you will be signed in immediately to choose or create a restaurant.',
        )}
      showBack
    >
      <Surface>
        {feedback && !feedback.field ? (
          <Feedback title={feedback.title} detail={feedback.detail} tone={feedback.tone} />
        ) : null}

        {accountCreated ? (
          <Button
            label={copy('ไปหน้าเข้าสู่ระบบ', 'Go to sign in')}
            onPress={goToLogin}
          />
        ) : (
          <>
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
              label={copy('ชื่อเล่นในร้าน', 'Restaurant nickname')}
              value={nickname}
              onChangeText={setNickname}
            />
            <TextField
              label={copy('อีเมล', 'Email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <TextField
              label={copy('เบอร์โทร', 'Phone number')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <TextField
              label={copy('รหัสผ่าน (8–72 ไบต์)', 'Password (8–72 bytes)')}
              value={password}
              onChangeText={updatePassword}
              secureTextEntry
            />
            <TextField
              label={copy('ยืนยันรหัสผ่าน', 'Confirm password')}
              value={confirmPassword}
              onChangeText={updateConfirmPassword}
              secureTextEntry
              error={feedback?.field === 'confirmPassword' ? feedback.detail : null}
            />
            <Button
              label={copy('สร้างบัญชีและเข้าสู่ระบบ', 'Create account and sign in')}
              onPress={submit}
              loading={submitting}
            />
          </>
        )}
      </Surface>
    </AuthScreen>
  );
}
