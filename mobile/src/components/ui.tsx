import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, type KeyboardTypeOptions, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { useTabSwipeExclusionHandlers } from '@/src/components/tab-swipe-context';
import { palette, radius, spacing, statusTone, typeScale } from '@/src/theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  compact,
  icon,
  leading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  icon?: AppIconName;
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const backgroundColor = variant === 'primary' ? palette.primary : variant === 'danger' ? palette.danger : variant === 'ghost' ? 'transparent' : palette.surface;
  const color = variant === 'primary' || variant === 'danger' ? palette.primaryText : variant === 'ghost' ? palette.muted : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: compact ? 44 : 52,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor: variant === 'primary' ? palette.primary : variant === 'danger' ? palette.danger : palette.borderStrong,
          borderRadius: radius.md,
          backgroundColor,
          paddingHorizontal: compact ? spacing.md : spacing.lg,
          opacity: disabled || loading ? 0.48 : pressed ? 0.78 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={color} size="small" />
        : leading || (icon ? <AppIcon color={color} name={icon} size={19} /> : null)}
      <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Surface({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          gap: spacing.md,
          padding: spacing.lg,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: radius.md,
          backgroundColor: palette.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text selectable style={typeScale.title}>{title}</Text>
        {detail ? <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{detail}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  const style = statusTone(tone);
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 5, ...style }}>
      <View style={{ width: 6, height: 6, borderRadius: radius.full, backgroundColor: style.color }} />
      <Text selectable style={{ color: style.color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoComplete,
  textContentType,
  secureTextEntry,
  revealLabel,
  hideLabel,
  icon,
  multiline,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  secureTextEntry?: boolean;
  revealLabel?: string;
  hideLabel?: string;
  icon?: AppIconName;
  multiline?: boolean;
  error?: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const canReveal = Boolean(secureTextEntry && revealLabel && hideLabel);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <View style={{ justifyContent: multiline ? 'flex-start' : 'center' }}>
        {icon ? (
          <View
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              left: spacing.md,
              top: multiline ? 16 : 18,
              zIndex: 1,
            }}
          >
            <AppIcon
              color={error ? palette.danger : focused ? palette.textStrong : palette.muted}
              name={icon}
              size={19}
            />
          </View>
        ) : null}
        <TextInput
          accessibilityHint={error || placeholder}
          accessibilityLabel={label}
          autoComplete={autoComplete}
          autoCapitalize={keyboardType === 'email-address' || secureTextEntry ? 'none' : 'sentences'}
          autoCorrect={keyboardType !== 'email-address' && !secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          onChangeText={onChangeText}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={palette.placeholder}
          secureTextEntry={Boolean(secureTextEntry && !revealed)}
          textContentType={textContentType}
          style={{
            minHeight: multiline ? 104 : 54,
            borderWidth: 1,
            borderColor: error ? palette.danger : focused ? palette.textStrong : palette.border,
            borderRadius: radius.md,
            backgroundColor: focused ? palette.surface : palette.surfaceSubtle,
            color: palette.textStrong,
            fontSize: 16,
            paddingLeft: icon ? 44 : spacing.md,
            paddingRight: canReveal ? 52 : spacing.md,
            paddingTop: multiline ? spacing.md : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
          value={value}
        />
        {canReveal ? (
          <Pressable accessibilityLabel={revealed ? hideLabel : revealLabel} accessibilityRole="button" hitSlop={2} onPress={() => setRevealed((current) => !current)} style={({ pressed }) => ({ position: 'absolute', top: 5, right: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: pressed ? palette.surfaceStrong : 'transparent', opacity: pressed ? 0.74 : 1 })}>
            <AppIcon color={palette.muted} name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text selectable style={[typeScale.caption, { color: palette.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  clearLabel = 'Clear search',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  clearLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: spacing.md, zIndex: 1, pointerEvents: 'none' }}>
        <AppIcon color={focused ? palette.textStrong : palette.muted} name="search-outline" size={19} />
      </View>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        returnKeyType="search"
        style={{
          minHeight: 52,
          borderWidth: 1,
          borderColor: focused ? palette.textStrong : palette.border,
          borderRadius: radius.md,
          backgroundColor: focused ? palette.surface : palette.surfaceSubtle,
          color: palette.textStrong,
          fontSize: 16,
          paddingLeft: 44,
          paddingRight: value ? 52 : spacing.md,
        }}
        value={value}
      />
      {value ? (
        <Pressable
          accessibilityLabel={clearLabel}
          accessibilityRole="button"
          hitSlop={2}
          onPress={() => onChangeText('')}
          style={({ pressed }) => ({
            position: 'absolute',
            right: 4,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <AppIcon color={palette.muted} name="close-circle" size={19} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function ChipGroup<T extends string | number>({ label, value, options, onChange, scrollable = false }: { label?: string; value: T; options: Array<{ label: string; value: T }>; onChange: (value: T) => void; scrollable?: boolean }) {
  const tabSwipeExclusionHandlers = useTabSwipeExclusionHandlers();
  const controls = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        key={String(option.value)}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => ({
          minHeight: 44,
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: selected ? palette.primary : palette.borderStrong,
          borderRadius: radius.md,
          backgroundColor: selected ? palette.primary : palette.surface,
          paddingHorizontal: spacing.md,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Text style={{ color: selected ? palette.primaryText : palette.text, fontSize: 13, fontWeight: '700' }}>{option.label}</Text>
      </Pressable>
    );
  });

  return (
    <View style={{ gap: spacing.sm }}>
      {label ? <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{label}</Text> : null}
      {scrollable ? (
        <ScrollView
          {...tabSwipeExclusionHandlers}
          horizontal
          contentContainerStyle={{ gap: spacing.sm }}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
        >
          {controls}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{controls}</View>
      )}
    </View>
  );
}

export function Feedback({ title, detail, tone = 'neutral' }: { title: string; detail?: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  const style = statusTone(tone);
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={{ gap: spacing.xs, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, ...style }}>
      <Text selectable style={{ color: style.color, fontSize: 14, fontWeight: '700' }}>{title}</Text>
      {detail ? <Text selectable style={{ color: style.color, fontSize: 13, lineHeight: 19 }}>{detail}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <View style={{ minHeight: 96, alignItems: 'flex-start', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
      <Text selectable style={typeScale.cardTitle}>{title}</Text>
      {detail ? <Text selectable style={[typeScale.body, { color: palette.muted }]}>{detail}</Text> : null}
      {action ? <View style={{ marginTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: palette.border }} />;
}

export function ActionDock({
  label,
  value,
  children,
}: {
  label?: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      {label || value ? (
        <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
          {label ? <Text style={[typeScale.caption, { color: palette.muted }]}>{label}</Text> : null}
          {value ? <Text numberOfLines={1} style={[typeScale.number, { fontSize: 20 }]}>{value}</Text> : null}
        </View>
      ) : null}
      <View style={{ flex: label || value ? 1.35 : 1 }}>{children}</View>
    </View>
  );
}
