import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, FeGaussianBlur, Filter, G, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReducedMotion } from '@/src/components/motion';

// The assistant's face — the web's SiriOrb, rebuilt with what React Native can
// draw. The web stacks six conic gradients spinning at different rates under a
// blur; here three layers of soft colour blobs spin at 1x, 2x (reversed) and 3x
// over a saturated base, blurred just enough to melt into each other. Same
// three colours as the web (its oklch stops converted to sRGB), same crisp
// circular edge — no white highlight, which is what made this look like a
// plastic ball rather than a swirl.
const BASE = '#FF8F52'; // oklch(78% 0.17 45) — orange
const AMBER = '#FABB41'; // oklch(83% 0.15 80)
const CORAL = '#FF6F69'; // oklch(72% 0.18 25)
const GROUND = '#FEF3E7'; // oklch(97% 0.02 70)

// Positions are in the layer's own 100x100 space, so one set of numbers works
// at every orb size.
type Blob = { x: number; y: number; r: number; colour: string };

const LAYERS: { blobs: Blob[]; speed: number; reverse: boolean; opacity: number }[] = [
  {
    speed: 1,
    reverse: false,
    opacity: 1,
    blobs: [
      { x: 30, y: 32, r: 55, colour: BASE },
      { x: 74, y: 66, r: 50, colour: CORAL },
      { x: 68, y: 24, r: 42, colour: AMBER },
    ],
  },
  {
    speed: 2,
    reverse: true,
    opacity: 0.75,
    blobs: [
      { x: 30, y: 74, r: 48, colour: AMBER },
      { x: 22, y: 28, r: 40, colour: CORAL },
      { x: 76, y: 50, r: 44, colour: BASE },
    ],
  },
  {
    speed: 3,
    reverse: false,
    opacity: 0.5,
    blobs: [
      { x: 50, y: 20, r: 36, colour: CORAL },
      { x: 50, y: 82, r: 36, colour: AMBER },
    ],
  },
];

function BlobLayer({ blobs, blur, uid }: { blobs: Blob[]; blur: number; uid: string }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <Defs>
        <Filter id={`f${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <FeGaussianBlur stdDeviation={blur} />
        </Filter>
        {blobs.map((blob, index) => (
          <RadialGradient key={index} id={`g${uid}${index}`} cx={blob.x} cy={blob.y} r={blob.r} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={blob.colour} stopOpacity={1} />
            <Stop offset="0.62" stopColor={blob.colour} stopOpacity={0.92} />
            <Stop offset="1" stopColor={blob.colour} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {/* Drawn wider than the circle so the blur's own soft edge falls outside it. */}
      <G filter={`url(#f${uid})`}>
        {blobs.map((_, index) => (
          <Rect key={index} x={-25} y={-25} width={150} height={150} fill={`url(#g${uid}${index})`} />
        ))}
      </G>
    </Svg>
  );
}

export function AIOrb({
  size,
  speed = 20,
  style,
}: {
  size: number;
  /** Seconds for the slowest layer to turn once; the web uses 20, or 8 in the floating chat. */
  speed?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        // Reduced motion keeps it alive but slower, as the web does.
        duration: (reducedMotion ? speed * 1.6 : speed) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, speed, spin]);

  const blur = size < 50 ? 1 : 2;
  // Half speed, so the bright side wanders rather than chases the colour layers.
  const coreDrift = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

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
          backgroundColor: BASE,
        },
        style,
      ]}
    >
      {LAYERS.map((layer, index) => {
        const turns = 360 * layer.speed;
        const rotate = spin.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${layer.reverse ? -turns : turns}deg`],
        });
        return (
          <Animated.View
            key={index}
            style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, opacity: layer.opacity, transform: [{ rotate }] }}
          >
            <BlobLayer blobs={layer.blobs} blur={blur} uid={`${uid}${index}`} />
          </Animated.View>
        );
      })}
      {/* The bright core. The web gets it from a second layer that blurs and
          lifts everything under it; here it is drawn directly, drifting slowly so
          the light moves the way the web's does. */}
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: [{ rotate: coreDrift }] }}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={`core${uid}`} cx={44} cy={40} r={58} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFE712" stopOpacity={0.95} />
              <Stop offset="0.55" stopColor="#FFDA1F" stopOpacity={0.84} />
              <Stop offset="0.85" stopColor="#FFB347" stopOpacity={0.29} />
              <Stop offset="1" stopColor="#FFB347" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={-25} y={-25} width={150} height={150} fill={`url(#core${uid})`} />
        </Svg>
      </Animated.View>

      {/* The web's inset background shadow: the rim settles into the page instead
          of ending on a hard ring. */}
      <Svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <RadialGradient id={`rim${uid}`} cx={50} cy={50} r={50} gradientUnits="userSpaceOnUse">
            <Stop offset="0.9" stopColor={GROUND} stopOpacity={0} />
            <Stop offset="1" stopColor={GROUND} stopOpacity={0.35} />
          </RadialGradient>
          {/* Away from the light, the far side of the glass darkens. */}
          <RadialGradient id={`shade${uid}`} cx={72} cy={76} r={46} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#B03A1A" stopOpacity={0.3} />
            <Stop offset="1" stopColor="#B03A1A" stopOpacity={0} />
          </RadialGradient>
          {/* The lit edge: bright where the light enters, a fainter bounce opposite. */}
          <LinearGradient id={`edge${uid}`} x1={18} y1={10} x2={82} y2={92} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
            <Stop offset="0.35" stopColor="#ffffff" stopOpacity={0.15} />
            <Stop offset="0.62" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0.35} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#shade${uid})`} />
        <Rect x={0} y={0} width={100} height={100} fill={`url(#rim${uid})`} />
        <Circle cx={50} cy={50} r={49} fill="none" stroke={`url(#edge${uid})`} strokeWidth={1.6} />
      </Svg>
    </View>
  );
}
