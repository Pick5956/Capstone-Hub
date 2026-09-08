import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/src/components/motion';

// The assistant's face: a port of the web's SiriOrb (six spinning conic
// gradients) to what React Native can draw — two rotating linear gradients
// clipped to a circle, a counter-rotating inner layer, and a highlight. The
// colours are the web's oklch stops rounded to sRGB.
const RING_A = ['#f19a63', '#f4cc74', '#ee7a6e', '#f4cc74', '#f19a63'] as const;
const RING_B = ['#ee7a6e', '#f19a63', '#f4cc74', '#f19a63', '#ee7a6e'] as const;

export function AIOrb({
  size,
  speed = 8,
  style,
}: {
  size: number;
  /** Seconds per turn; the web uses 20 on the page and 8 in the floating chat. */
  speed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      spin.setValue(0.15);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: speed * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, speed, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateBack = spin.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const outer = size * 1.5;
  const inner = size * 0.8;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: '#fbf3e8',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Animated.View style={{ position: 'absolute', width: outer, height: outer, transform: [{ rotate }] }}>
        <LinearGradient
          colors={RING_A}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: outer / 2 }}
        />
      </Animated.View>
      <Animated.View
        style={{ position: 'absolute', width: inner, height: inner, opacity: 0.85, transform: [{ rotate: rotateBack }] }}
      >
        <LinearGradient
          colors={RING_B}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1, borderRadius: inner / 2 }}
        />
      </Animated.View>
      <LinearGradient
        colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.8, y: 0.9 }}
        style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2 }}
      />
    </View>
  );
}
