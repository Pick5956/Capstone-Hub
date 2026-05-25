import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider } from '@/src/providers/auth-provider';
import { colors } from '@/src/theme';

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
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <StatusBar style="dark" backgroundColor={colors.canvas} />
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="restaurants" />
          <Stack.Screen name="create-restaurant" />
          <Stack.Screen name="invite/manual" />
          <Stack.Screen name="invite/[token]" />
          <Stack.Screen name="home" />
          <Stack.Screen name="tables" />
          <Stack.Screen name="table-management" />
          <Stack.Screen name="table-management/table" />
          <Stack.Screen name="table-management/zones" />
          <Stack.Screen name="table-management/tags" />
          <Stack.Screen name="order/[id]" />
          <Stack.Screen name="menu" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="kitchen" />
          <Stack.Screen name="staff" />
          <Stack.Screen name="settings" />
        </Stack>
      </AuthProvider>
    </View>
  );
}
