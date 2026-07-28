import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/src/providers/auth-provider';
import {
  DisplayPreferencesProvider,
  useDisplayPreferences,
} from '@/src/providers/display-preferences-provider';
import { colors } from '@/src/theme';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

const topLevelScreenOptions = {
  animation: 'none' as const,
  gestureEnabled: false,
};

SplashScreen.preventAutoHideAsync();

function AppNavigator() {
  const { ready } = useDisplayPreferences();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  }

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="restaurants" />
        <Stack.Screen name="create-restaurant" />
        <Stack.Screen name="invite/manual" />
        <Stack.Screen name="invite/[token]" />
        <Stack.Screen name="home" options={topLevelScreenOptions} />
        <Stack.Screen name="more" options={topLevelScreenOptions} />
        <Stack.Screen name="tables" options={topLevelScreenOptions} />
        <Stack.Screen name="table-management" />
        <Stack.Screen name="table-management/table" />
        <Stack.Screen name="table-management/zones" />
        <Stack.Screen name="table-management/tags" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="menu" />
        <Stack.Screen name="orders" options={topLevelScreenOptions} />
        <Stack.Screen name="kitchen" options={topLevelScreenOptions} />
        <Stack.Screen name="staff" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="inventory" />
        <Stack.Screen name="reports" />
        <Stack.Screen name="ai-assistant" />
      </Stack>
    </AuthProvider>
  );
}

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="dark" backgroundColor={colors.surface} />
      <SafeAreaProvider>
        <DisplayPreferencesProvider>
          <AppNavigator />
        </DisplayPreferencesProvider>
      </SafeAreaProvider>
    </View>
  );
}
