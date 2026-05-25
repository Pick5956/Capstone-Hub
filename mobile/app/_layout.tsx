import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider } from '@/src/providers/auth-provider';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="restaurants" />
        <Stack.Screen name="home" />
        <Stack.Screen name="tables" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="menu" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="kitchen" />
      </Stack>
    </AuthProvider>
  );
}
