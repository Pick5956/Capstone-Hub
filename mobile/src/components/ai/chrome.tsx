import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { useReducedMotion } from '@/src/components/motion';

import { ai } from './theme';

// Small chrome shared by the assistant screen: the 32px glass circles in the
// top-right cluster (the web's rounded-full border bg-white/80 backdrop-blur
// buttons), their gradient badge, and the bottom sheet the insights and the
// chat list slide up in.

export function GlassButton({
  icon,
  label,
  onPress,
  badge,
  active,
  size = 32,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  badge?: number;
  active?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} ${badge}` : label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: active ? '#fdba74' : ai.hairline,
        backgroundColor: 'rgba(255,255,255,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: pressed ? 0.12 : 0.06,
        shadowRadius: pressed ? 4 : 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
        transform: [{ translateY: pressed ? -1 : 0 }],
      })}
    >
      <AppIcon name={icon} size={size * 0.47} color={active ? ai.deep : ai.muted} />
      {badge ? (
        <LinearGradient
          colors={[ai.orange, ai.amber]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            height: 16,
            minWidth: 16,
            paddingHorizontal: 4,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: ai.canvas,
          }}
        >
          <Text style={{ fontSize: 9, lineHeight: 12, fontWeight: '700', color: '#ffffff' }}>{badge > 9 ? '9+' : badge}</Text>
        </LinearGradient>
      ) : null}
    </Pressable>
  );
}

/**
 * A sheet that slides up from the bottom over a scrim. `height` is a fraction
 * of the window ("half" for the insights, 1 for the chat list and settings).
 */
export function BottomSheet({
  open,
  onClose,
  heightFraction = 0.62,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  heightFraction?: number;
  children: ReactNode;
  label: string;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const full = heightFraction >= 1;
  const sheetHeight = full ? windowHeight : Math.round(windowHeight * heightFraction);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reducedMotion ? 0 : open ? 300 : 220,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [open, progress, reducedMotion]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] });

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.3)', opacity: progress }}>
          <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          style={{
            height: sheetHeight,
            backgroundColor: full ? ai.canvas : ai.surface,
            borderTopLeftRadius: full ? 0 : 22,
            borderTopRightRadius: full ? 0 : 22,
            paddingTop: full ? insets.top : 8,
            paddingBottom: insets.bottom,
            transform: [{ translateY }],
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: -10 },
            elevation: 16,
          }}
        >
          {!full ? <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#e5e7eb', marginBottom: 6 }} /> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
