import { Platform } from 'react-native';
import type { OneTapResponse } from 'react-native-nitro-google-signin';

import {
  acquireGoogleIdToken,
  type GoogleSignInAdapter,
} from '@/src/lib/google-sign-in-flow';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

let configured = false;

function isGoogleClientId(value: string | undefined) {
  return Boolean(value?.endsWith('.apps.googleusercontent.com'));
}

function requireGoogleClientConfiguration() {
  if (!isGoogleClientId(webClientId)) {
    throw new Error('ยังไม่ได้ตั้งค่า Google Login สำหรับแอปมือถือ');
  }
  if (Platform.OS === 'ios' && !isGoogleClientId(iosClientId)) {
    throw new Error('ยังไม่ได้ตั้งค่า Google Login สำหรับ iOS');
  }

  return {
    webClientId: webClientId as string,
    iosClientId,
  };
}

function nativeModuleUnavailableMessage() {
  return 'Google Login ใช้ได้ผ่าน Development Build เท่านั้น ไม่รองรับ Expo Go';
}

export async function requestGoogleIdToken(): Promise<string | null> {
  const clientConfiguration = requireGoogleClientConfiguration();

  let google: typeof import('react-native-nitro-google-signin');
  try {
    google = await import('react-native-nitro-google-signin');
  } catch {
    throw new Error(nativeModuleUnavailableMessage());
  }

  if (!configured) {
    try {
      google.GoogleOneTapSignIn.configure({
        webClientId: clientConfiguration.webClientId,
        iosClientId: clientConfiguration.iosClientId || undefined,
      });
      configured = true;
    } catch {
      throw new Error(nativeModuleUnavailableMessage());
    }
  }

  const adapter: GoogleSignInAdapter = {
    checkPlayServices: () => google.GoogleOneTapSignIn.checkPlayServices(),
    signIn: () => google.GoogleOneTapSignIn.signIn(),
    createAccount: () => google.GoogleOneTapSignIn.createAccount(),
    presentExplicitSignIn: () => google.GoogleOneTapSignIn.presentExplicitSignIn(),
    isSuccessResponse(response): response is { data: { idToken: string | null } } {
      return google.isSuccessResponse(response as OneTapResponse);
    },
    isNoSavedCredentialFoundResponse: (response) =>
      google.isNoSavedCredentialFoundResponse(response as OneTapResponse),
    isCancelledResponse: (response) =>
      google.isCancelledResponse(response as OneTapResponse),
  };

  try {
    return await acquireGoogleIdToken(adapter);
  } catch (error) {
    if (google.isErrorWithCode(error)) {
      switch (error.code) {
        case google.statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          throw new Error('อุปกรณ์นี้ต้องอัปเดต Google Play Services ก่อนเข้าสู่ระบบ');
        case google.statusCodes.DEVELOPER_ERROR:
          throw new Error('Google Login ยังตั้งค่า Android package หรือ SHA-1 ไม่ครบ');
        case google.statusCodes.IN_PROGRESS:
          throw new Error('กำลังเปิด Google Login อยู่ กรุณารอสักครู่');
        case google.statusCodes.SIGN_IN_CANCELLED:
          return null;
        default:
          throw new Error('เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
      }
    }
    if (error instanceof Error && error.message === 'Google did not return an ID token') {
      throw new Error('Google ไม่ได้ส่งข้อมูลยืนยันตัวตนกลับมา');
    }
    throw new Error('เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
  }
}

export async function clearGoogleSignInSession() {
  try {
    const google = await import('react-native-nitro-google-signin');
    await google.GoogleOneTapSignIn.signOut();
  } catch {
    // App-session logout must still succeed in Expo Go or when native Google
    // configuration has changed since the user signed in.
  }
}
