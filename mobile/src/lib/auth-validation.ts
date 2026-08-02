export type LocalPasswordValidation =
  | { valid: true; error: null }
  | { valid: false; error: 'too_short' | 'too_long' };

export type RegistrationValidation =
  | { valid: true; error: null }
  | {
      valid: false;
      error: 'missing_required' | 'password_mismatch' | 'too_short' | 'too_long';
    };

export interface RegistrationValidationInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function localPasswordByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export function validateLocalPassword(password: string): LocalPasswordValidation {
  const bytes = localPasswordByteLength(password);
  if (bytes < 8) return { valid: false, error: 'too_short' };
  if (bytes > 72) return { valid: false, error: 'too_long' };
  return { valid: true, error: null };
}

export function validateRegistrationInput({
  firstName,
  lastName,
  email,
  password,
  confirmPassword,
}: RegistrationValidationInput): RegistrationValidation {
  if (
    !firstName.trim()
    || !lastName.trim()
    || !email.trim()
    || !password
    || !confirmPassword
  ) {
    return { valid: false, error: 'missing_required' };
  }
  if (password !== confirmPassword) {
    return { valid: false, error: 'password_mismatch' };
  }
  return validateLocalPassword(password);
}
