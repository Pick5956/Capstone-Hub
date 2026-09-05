import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing } from '@/src/theme';

// A port of the web's toast (frontend/src/components/shared/FeedbackProvider.tsx).
// Every measurement below is that component's: rounded-xl, py-2 pl-4 pr-2,
// min-h-11, gap-2, a 13px semibold title over a 12px muted message, a 28px
// dismiss button, 3.6s on screen and at most four stacked.
//
// Two deliberate departures:
//   - It sits at the TOP. The web anchors to the bottom, but the app's bottom
//     edge is already spoken for by the tab dock and the action docks that sit
//     above it, so a toast there lands on top of the very button that triggered
//     it. The enter animation flips with it - the web slides up away from the
//     bottom edge, this slides down away from the top one.
//   - Colours come from the app's palette, not the web's literal grays. The web
//     card is neutral because the web surface is neutral; this app's surface is
//     warm (#FFFCF8 over a #FED7AA border), and a gray card dropped into it
//     would read as a foreign element rather than the same component.
// The tone rule is the web's own and is kept exactly: the card stays neutral
// and only the title takes the hue.

type ToastTone = 'success' | 'error' | 'warning' | 'info';

type ToastInput = {
  title: string;
  message?: string;
  tone?: ToastTone;
  duration?: number;
};

type Toast = ToastInput & { id: number; tone: ToastTone };

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;
const DEFAULT_DURATION = 3600;
// The web's rounded-xl. The shared radius scale stops at md (6), so this one
// stays local rather than widening a token every other surface reads.
const CARD_RADIUS = 12;

const toneTitleColor: Record<ToastTone, string> = {
  success: palette.textStrong,
  info: palette.textStrong,
  warning: palette.warning,
  error: palette.danger,
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { copy } = useDisplayPreferences();
  const enter = useRef(new Animated.Value(0)).current;
  const urgent = toast.tone === 'error' || toast.tone === 'warning';

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 190,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}
      accessibilityRole={urgent ? 'alert' : undefined}
      style={{
        opacity: enter,
        transform: [{
          translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }),
        }],
        maxWidth: '100%',
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingLeft: spacing.lg,
        paddingRight: spacing.sm,
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: CARD_RADIUS,
        backgroundColor: palette.surface,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 12,
      }}
    >
      <View style={{ minWidth: 0, flex: 1 }}>
        <Text style={{ color: toneTitleColor[toast.tone], fontSize: 13, fontWeight: '600', lineHeight: 20 }}>
          {toast.title}
        </Text>
        {toast.message ? (
          <Text style={{ marginTop: 2, color: palette.muted, fontSize: 12, lineHeight: 20 }}>
            {toast.message}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel={copy('ปิดแจ้งเตือน', 'Dismiss notification')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDismiss}
        style={({ pressed }) => ({
          width: 28,
          height: 28,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.md,
          backgroundColor: pressed ? palette.surfaceSubtle : 'transparent',
        })}
      >
        <AppIcon color={palette.muted} name="close" size={16} />
      </Pressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    const toast: Toast = { ...input, id, tone: input.tone ?? 'success' };
    setToasts((current) => {
      const next = [...current, toast];
      // Anything trimmed here never gets dismissed by its own timer, so clear
      // it now instead of leaving a callback pointing at a vanished toast.
      next.slice(0, Math.max(0, next.length - MAX_VISIBLE)).forEach((dropped) => {
        const timer = timersRef.current.get(dropped.id);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(dropped.id);
        }
      });
      return next.slice(-MAX_VISIBLE);
    });
    timersRef.current.set(id, setTimeout(() => dismissToast(id), input.duration ?? DEFAULT_DURATION));
  }, [dismissToast]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {toasts.length ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: insets.top + spacing.lg,
              left: 0,
              right: 0,
              alignItems: 'center',
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
            }}
          >
            {/* Newest nearest the edge it entered from, as the web does with
                flex-col-reverse against the bottom. */}
            {[...toasts].reverse().map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
            ))}
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return value;
}
