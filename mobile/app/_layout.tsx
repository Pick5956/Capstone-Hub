import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/src/providers/auth-provider';
import {
  DisplayPreferencesProvider,
  useDisplayPreferences,
} from '@/src/providers/display-preferences-provider';
import { APP_FONT_FAMILIES } from '@/src/lib/app-font';
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

const bundledFonts = {
  ...Ionicons.font,
  [APP_FONT_FAMILIES.regular]: require('../assets/fonts/Kanit-Regular.ttf'),
  [APP_FONT_FAMILIES.medium]: require('../assets/fonts/Kanit-Medium.ttf'),
  [APP_FONT_FAMILIES.semiBold]: require('../assets/fonts/Kanit-SemiBold.ttf'),
  [APP_FONT_FAMILIES.bold]: require('../assets/fonts/Kanit-Bold.ttf'),
  [APP_FONT_FAMILIES.extraBold]: require('../assets/fonts/Kanit-ExtraBold.ttf'),
};

function AppNavigator() {
  const { ready } = useDisplayPreferences();
  const [fontsLoaded, fontError] = useFonts(bundledFonts);

  useEffect(() => {
    if (ready && (fontsLoaded || fontError)) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded, ready]);

  if (!ready || (!fontsLoaded && !fontError)) {
    return <View style={{ flex: 1, backgroundColor: colors.surface }} />;
  }

  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
          presentation: 'card',
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="restaurants" />
        <Stack.Screen name="create-restaurant" />
        <Stack.Screen name="invite/manual" />
        <Stack.Screen name="invite/[token]" />
        <Stack.Screen name="(primary)" options={topLevelScreenOptions} />
        <Stack.Screen name="reservations" />
        <Stack.Screen name="table-reservation" />
        <Stack.Screen name="table-management" />
        <Stack.Screen name="table-management/table" />
        <Stack.Screen name="table-management/zones" />
        <Stack.Screen name="table-management/tags" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="order/new" />
        <Stack.Screen name="menu" />
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
