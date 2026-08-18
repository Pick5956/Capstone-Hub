import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppIcon } from '@/src/components/app-icon';

const PRODUCT_MOTION_EASING = Easing.bezier(0.22, 1, 0.36, 1);

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

export function MotionReveal({
  children,
  delay = 0,
  distance = 8,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      delay,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.82, 1],
          }),
          transform: [{
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [distance, 0],
            }),
          }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function AnimatedCollapse({
  expanded,
  children,
  style,
}: {
  expanded: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const height = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const measuredHeightRef = useRef(0);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentHeight <= 0) return;

    const targetHeight = expanded ? contentHeight : 0;
    height.stopAnimation();
    progress.stopAnimation();
    if (reduced) {
      height.setValue(targetHeight);
      progress.setValue(expanded ? 1 : 0);
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(height, {
        toValue: targetHeight,
        duration: expanded ? 240 : 180,
        easing: PRODUCT_MOTION_EASING,
        useNativeDriver: false,
      }),
      Animated.timing(progress, {
        toValue: expanded ? 1 : 0,
        duration: expanded ? 220 : 160,
        easing: PRODUCT_MOTION_EASING,
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [contentHeight, expanded, height, progress, reduced]);

  return (
    <Animated.View
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      pointerEvents={expanded ? 'auto' : 'none'}
      style={[
        style,
        {
          height: contentHeight > 0 ? height : expanded ? undefined : 0,
          overflow: 'hidden',
          opacity: progress,
          transform: [{
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-4, 0],
            }),
          }],
        },
      ]}
    >
      <View
        collapsable={false}
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight <= 0 || nextHeight === measuredHeightRef.current) return;
          const firstMeasurement = measuredHeightRef.current === 0;
          measuredHeightRef.current = nextHeight;
          if (firstMeasurement) {
            height.setValue(expanded ? nextHeight : 0);
            progress.setValue(expanded ? 1 : 0);
          }
          setContentHeight(nextHeight);
        }}
        style={{ width: '100%' }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

export function AnimatedDisclosureIcon({
  expanded,
  color,
  size = 17,
}: {
  expanded: boolean;
  color: string;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (reduced) {
      progress.setValue(expanded ? 1 : 0);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 220 : 160,
      easing: PRODUCT_MOTION_EASING,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, progress, reduced]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        transform: [{
          rotate: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '180deg'],
          }),
        }],
      }}
    >
      <AppIcon color={color} name="chevron-down" size={size} />
    </Animated.View>
  );
}

export function MotionCrossfade({
  active,
  inactiveContent,
  activeContent,
  minHeight = 52,
  style,
}: {
  active: boolean;
  inactiveContent: React.ReactNode;
  activeContent: React.ReactNode;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const containerHeight = useRef(new Animated.Value(minHeight)).current;
  const [inactiveHeight, setInactiveHeight] = useState(minHeight);
  const [activeHeight, setActiveHeight] = useState(minHeight);
  const targetHeight = Math.max(minHeight, active ? activeHeight : inactiveHeight);

  useEffect(() => {
    progress.stopAnimation();
    containerHeight.stopAnimation();
    if (reduced) {
      progress.setValue(active ? 1 : 0);
      containerHeight.setValue(targetHeight);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(progress, {
        toValue: active ? 1 : 0,
        duration: 180,
        easing: PRODUCT_MOTION_EASING,
        useNativeDriver: false,
      }),
      Animated.timing(containerHeight, {
        toValue: targetHeight,
        duration: 180,
        easing: PRODUCT_MOTION_EASING,
        useNativeDriver: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [active, containerHeight, progress, reduced, targetHeight]);

  const layerStyle = {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    left: 0,
    minHeight,
  };

  return (
    <Animated.View style={[{ height: containerHeight, overflow: 'hidden' }, style]}>
      <Animated.View
        accessibilityElementsHidden={active}
        importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}
        onLayout={(event) => {
          const nextHeight = Math.max(minHeight, Math.ceil(event.nativeEvent.layout.height));
          setInactiveHeight((current) => current === nextHeight ? current : nextHeight);
        }}
        pointerEvents={active ? 'none' : 'auto'}
        style={{
          ...layerStyle,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
          }],
        }}
      >
        {inactiveContent}
      </Animated.View>
      <Animated.View
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
        onLayout={(event) => {
          const nextHeight = Math.max(minHeight, Math.ceil(event.nativeEvent.layout.height));
          setActiveHeight((current) => current === nextHeight ? current : nextHeight);
        }}
        pointerEvents={active ? 'auto' : 'none'}
        style={{
          ...layerStyle,
          opacity: progress,
          transform: [{
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [3, 0] }),
          }],
        }}
      >
        {activeContent}
      </Animated.View>
    </Animated.View>
  );
}
