import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInUp, FadeOut, LinearTransition } from 'react-native-reanimated';

type MotionPressableProps = Omit<PressableProps, 'style'> & {
  delay?: number;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
};

export function MotionView({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeInUp.duration(220).delay(delay)}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(180)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

export function MotionPressable({ children, delay = 0, style, ...props }: MotionPressableProps) {
  void delay;
  return (
    <Pressable
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && { opacity: 0.82, transform: [{ scale: 0.985 }] },
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}
