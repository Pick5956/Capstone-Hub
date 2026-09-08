import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { useReducedMotion } from '@/src/components/motion';

import { ai } from './theme';

// Small chrome shared by the assistant screen: the round buttons in the top
// row, their gradient badge, and the bottom sheet the insights and the chat
// list slide up in.
//
// On iOS 26 the buttons are real Liquid Glass, the system material Apple's own
// apps use — it refracts and reacts to what scrolls under it. Everywhere else
// (older iOS, every Android) the same button falls back to the frosted white
// circle the web page uses, which is why this is one component and not two:
// the screen never asks which platform it is on.
export const LIQUID_GLASS = isLiquidGlassAvailable();

/**
 * A panel in the same material as the buttons: real glass on iOS 26, the
 * frosted white surface everywhere else. `style` is the shape both share;
 * `fallbackStyle` is the border and fill only the non-glass version needs.
 */
export function GlassSurface({
  style,
  fallbackStyle,
  children,
  effect = 'regular',
}: {
  style: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** "clear" blurs what is behind without frosting it pale. */
  effect?: 'regular' | 'clear';
}) {
  if (LIQUID_GLASS) {
    return (
      <GlassView glassEffectStyle={effect} colorScheme="light" style={style}>
        {children}
      </GlassView>
    );
  }
  return <View style={[style, fallbackStyle]}>{children}</View>;
}

export function GlassButton({
  icon,
  label,
  onPress,
  badge,
  dot,
  active,
  size = 46,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  badge?: number;
  /** A small unread mark, when a count would be noise. */
  dot?: boolean;
  active?: boolean;
  size?: number;
}) {
  const icon_ = <AppIcon name={icon} size={size * 0.46} color={active ? ai.deep : ai.ink} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} ${badge}` : label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        transform: [{ translateY: pressed ? -1 : 0 }],
        opacity: pressed && LIQUID_GLASS ? 0.85 : 1,
        // Whatever is behind the header is blurred, so the button needs its own
        // edge to read as an object rather than part of the haze.
        shadowColor: '#3d2b1f',
        shadowOpacity: 0.24,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 3 },
      })}
    >
      {LIQUID_GLASS ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          // The screen is light-only, so the glass must not follow a dark system theme.
          colorScheme="light"
          // A fixed lift, never a state colour: changing this at runtime leaves the
          // native view wearing the old one.
          tintColor="rgba(255,255,255,0.42)"
          style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
        >
          {icon_}
        </GlassView>
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: active ? '#fdba74' : ai.hairline,
            backgroundColor: 'rgba(255,255,255,0.85)',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            elevation: 1,
          }}
        >
          {icon_}
        </View>
      )}
      {dot && !badge ? (
        <View
          style={{
            position: 'absolute',
            top: 1,
            right: 1,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: ai.orange,
            borderWidth: 2,
            borderColor: ai.canvas,
          }}
        />
      ) : null}
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


export type GlassMenuItem = {
  key: string;
  icon: AppIconName;
  label: string;
  detail?: string;
  /** An unread mark on the row, matching the one on the button that opened it. */
  dot?: boolean;
  onPress: () => void;
};

/**
 * The menu a button opens: it springs out of the corner it was summoned from
 * and settles, the way iOS 26 menus do. Rendered inline rather than in a modal
 * so it shares the screen's own glass and never flashes a second window.
 */
export function GlassMenu({
  open,
  onClose,
  items,
  from,
  style,
}: {
  open: boolean;
  onClose: () => void;
  items: GlassMenuItem[];
  /** Which corner it grows out of. */
  from: 'top-right' | 'bottom-left';
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    const animation = open
      ? Animated.spring(progress, {
          toValue: 1,
          useNativeDriver: true,
          damping: reducedMotion ? 40 : 13,
          stiffness: reducedMotion ? 400 : 190,
          mass: 0.85,
        })
      : Animated.timing(progress, {
          toValue: 0,
          duration: reducedMotion ? 0 : 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        });
    animation.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, progress, reducedMotion]);

  if (!mounted) return null;

  const grow = from === 'top-right' ? 1 : -1;
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.04, 1] });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ปิดเมนู"
        onPress={onClose}
        style={{ position: 'absolute', top: -1000, right: -1000, bottom: -1000, left: -1000, zIndex: 8 }}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            zIndex: 9,
            // Grows out of the button's own corner, not out of its middle.
            transformOrigin: from === 'top-right' ? 'top right' : 'bottom left',
            transform: [{ scale }],
          },
          style,
        ]}
      >
        <GlassSurface
          style={{ borderRadius: 22, paddingVertical: 6, minWidth: 232, overflow: 'hidden' }}
          fallbackStyle={{
            backgroundColor: 'rgba(255,255,255,0.97)',
            borderWidth: 1,
            borderColor: ai.hairline,
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {items.map((item, index) => {
            const at = Math.min(0.08 * index, 0.32);
            const rowIn = progress.interpolate({ inputRange: [at, Math.min(at + 0.42, 1), 1], outputRange: [0, 1, 1] });
            return (
            <Animated.View key={item.key} style={{ opacity: rowIn, transform: [{ translateY: rowIn.interpolate({ inputRange: [0, 1], outputRange: [grow * -12, 0] }) }] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => { onClose(); item.onPress(); }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 48,
                paddingHorizontal: 16,
                backgroundColor: pressed ? 'rgba(249,115,22,0.12)' : 'transparent',
              })}
            >
              <AppIcon name={item.icon} size={20} color={ai.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: ai.ink }}>{item.label}</Text>
                {item.detail ? <Text style={{ fontSize: 12, color: ai.faded }}>{item.detail}</Text> : null}
              </View>
              {item.dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ai.orange }} /> : null}
            </Pressable>
            </Animated.View>
            );
          })}
        </GlassSurface>
      </Animated.View>
    </>
  );
}

/** The same material as a capsule, for the suggested-question chips. */
export function GlassPill({
  label,
  onPress,
  stretch,
}: {
  label: string;
  onPress: () => void;
  /** Fill the cell it sits in, so a set of them lines up as a grid. */
  stretch?: boolean;
}) {
  const text = (
    <Text style={{ fontSize: 13.5, fontWeight: '500', color: ai.body, textAlign: 'center' }}>{label}</Text>
  );
  const box = {
    minHeight: 44,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  };
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, width: stretch ? '100%' : undefined })}
    >
      {LIQUID_GLASS ? (
        <GlassView glassEffectStyle="regular" isInteractive colorScheme="light" style={box}>
          {text}
        </GlassView>
      ) : (
        <View style={{ ...box, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'rgba(255,255,255,0.7)' }}>{text}</View>
      )}
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
  showClose,
  background,
}: {
  open: boolean;
  onClose: () => void;
  heightFraction?: number;
  children: ReactNode;
  label: string;
  /** A glass close button in the top-right corner. */
  showClose?: boolean;
  /** The sheet's own colour, so the safe area at the top matches its content. */
  background?: string;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const full = heightFraction >= 1;
  const sheetHeight = full ? windowHeight : Math.round(windowHeight * heightFraction);

  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      drag.setValue(0);
      setShown(true);
    }
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reducedMotion ? 0 : open ? 300 : 240,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !open) {
        setShown(false);
        drag.setValue(0);
      }
    });
  }, [drag, open, progress, reducedMotion]);

  // Pull the sheet down to put it away, the gesture every iOS sheet has. Only
  // the strip along the top listens, so a list inside still scrolls normally.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 3 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => drag.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_event, gesture) => {
        const dismiss = gesture.dy > 90 || gesture.vy > 0.8;
        if (dismiss) {
          Animated.timing(drag, { toValue: sheetHeight, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false })
            // The close animation resets the drag once it is off screen; doing it
            // here would show the sheet again for a frame on its way out.
            .start(() => onCloseRef.current());
          return;
        }
        Animated.spring(drag, { toValue: 0, useNativeDriver: false, damping: 20, stiffness: 260 }).start();
      },
    }),
  ).current;
  // The responder is built once, so it reads the current handler through a ref.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const translateY = Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }), drag);

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.3)', opacity: progress }}>
          <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          style={{
            height: sheetHeight,
            backgroundColor: background ?? (full ? ai.canvas : ai.surface),
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
          {!full ? (
            <View {...pan.panHandlers} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 52, zIndex: 2 }} />
          ) : null}
          {showClose ? (
            <View style={{ position: 'absolute', top: 10, right: 14, zIndex: 3 }}>
              <GlassButton icon="close" label={label} onPress={onClose} size={40} />
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
