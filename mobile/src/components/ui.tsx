import { ActivityIndicator, Pressable, Text, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native';

import { palette, radius, spacing, statusTone, typeScale } from '@/src/theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  compact,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const backgroundColor = variant === 'primary' ? palette.primary : variant === 'danger' ? palette.danger : palette.surface;
  const color = variant === 'primary' || variant === 'danger' ? palette.primaryText : variant === 'ghost' ? palette.muted : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: compact ? 40 : 48,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor: variant === 'primary' ? palette.primary : variant === 'danger' ? palette.danger : palette.borderStrong,
          borderRadius: radius.md,
          backgroundColor,
          paddingHorizontal: compact ? spacing.md : spacing.lg,
          opacity: disabled || loading ? 0.5 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={color} size="small" /> : null}
      <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Surface({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          gap: spacing.lg,
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
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 4, ...style }}>
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
  secureTextEntry,
  multiline,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  multiline?: boolean;
  error?: string | null;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      <TextInput
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        secureTextEntry={secureTextEntry}
        style={{
          minHeight: multiline ? 96 : 50,
          borderWidth: 1,
          borderColor: error ? palette.danger : palette.borderStrong,
          borderRadius: radius.md,
          backgroundColor: palette.surface,
          color: palette.textStrong,
          fontSize: 16,
          paddingHorizontal: spacing.md,
          paddingTop: multiline ? spacing.md : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
        value={value}
      />
      {error ? <Text selectable style={[typeScale.caption, { color: palette.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function ChipGroup<T extends string | number>({ label, value, options, onChange }: { label?: string; value: T; options: Array<{ label: string; value: T }>; onChange: (value: T) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {label ? <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={String(option.value)}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => ({
                minHeight: 40,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: selected ? palette.primary : palette.borderStrong,
                borderRadius: radius.md,
                backgroundColor: selected ? palette.primary : palette.surface,
                paddingHorizontal: spacing.md,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: selected ? palette.primaryText : palette.text, fontSize: 13, fontWeight: '700' }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
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
