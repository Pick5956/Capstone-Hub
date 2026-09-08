import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, FeGaussianBlur, Filter, G, RadialGradient, Stop } from 'react-native-svg';

import { useReducedMotion } from '@/src/components/motion';

// The assistant's face: a port of the web's SiriOrb (spinning conic gradients
// under a blur) to what React Native can draw. Soft colour blobs are blurred
// with an SVG filter and spun in two counter-rotating layers inside a clipped
// circle, so the colours slide past each other the way the web orb's do. The
// colours are the web's oklch stops rounded to sRGB.
const ORANGE = '#f19a63';
const YELLOW = '#f4cc74';
const CORAL = '#ee7a6e';
const PEACH = '#ffd9b0';
const GROUND = '#fbf3e8';

const AnimatedView = Animated.View;

function Blobs({ size, blur, blobs, uid }: { size: number; blur: number; uid: string; blobs: { x: number; y: number; r: number; colour: string }[] }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <Filter id={`blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation={blur} />
        </Filter>
      </Defs>
      <G filter={`url(#blur-${uid})`}>
        {blobs.map((blob, index) => (
          <Circle key={index} cx={blob.x * size} cy={blob.y * size} r={blob.r * size} fill={blob.colour} />
        ))}
      </G>
    </Svg>
  );
}

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
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current;

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
  // Small orbs (the 30px avatar) need less blur or they turn to mush.
  const blur = size < 50 ? size * 0.07 : size * 0.1;

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
          backgroundColor: GROUND,
        },
        style,
      ]}
    >
      <AnimatedView style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: [{ rotate }] }}>
        <Blobs
          size={size}
          blur={blur}
          uid={`a${uid}`}
          blobs={[
            { x: 0.32, y: 0.36, r: 0.42, colour: ORANGE },
            { x: 0.72, y: 0.4, r: 0.36, colour: YELLOW },
            { x: 0.52, y: 0.78, r: 0.4, colour: CORAL },
          ]}
        />
      </AnimatedView>
      <AnimatedView style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, opacity: 0.8, transform: [{ rotate: rotateBack }] }}>
        <Blobs
          size={size}
          blur={blur}
          uid={`b${uid}`}
          blobs={[
            { x: 0.62, y: 0.28, r: 0.28, colour: PEACH },
            { x: 0.28, y: 0.66, r: 0.3, colour: CORAL },
            { x: 0.7, y: 0.7, r: 0.24, colour: YELLOW },
          ]}
        />
      </AnimatedView>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <RadialGradient id={`shine-${uid}`} cx="34%" cy="28%" r="60%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.8} />
            <Stop offset="0.45" stopColor="#ffffff" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`rim-${uid}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0.82" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0.55} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#shine-${uid})`} />
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#rim-${uid})`} />
      </Svg>
    </View>
  );
}
