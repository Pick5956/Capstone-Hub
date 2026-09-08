import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type KeyboardTypeOptions, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { useTabSwipeExclusionHandlers } from '@/src/components/tab-swipe-context';
import { breakpoints, controlShadow, palette, radius, spacing, statusTone, typeScale } from '@/src/theme';

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
          // A ghost button has no surface of its own, so a lift under it would
          // read as a floating rectangle with nothing in it.
          ...(variant === 'ghost' ? null : controlShadow),
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

/**
 * An action reduced to its icon, for the top-right of a screen header where a
 * labelled button would crowd out the title. `accessibilityLabel` is required
 * rather than optional: with the text gone it is the only name the control has.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled,
  variant = 'secondary',
}: {
  icon: AppIconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: isPrimary ? palette.primary : palette.borderStrong,
        borderRadius: radius.full,
        backgroundColor: isPrimary ? palette.primary : palette.surface,
        ...controlShadow,
        opacity: disabled ? 0.48 : pressed ? 0.78 : 1,
      })}
    >
      <AppIcon color={isPrimary ? palette.primaryText : palette.text} name={icon} size={20} />
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

export function EdgeSection({
  children,
  fullBleed = true,
  style,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const flushToPhoneEdge = fullBleed && width < breakpoints.tablet;

  return (
    <View
      style={[
        {
          marginHorizontal: flushToPhoneEdge ? -spacing.lg : 0,
          borderWidth: flushToPhoneEdge ? 0 : 1,
          borderColor: palette.border,
          borderRadius: flushToPhoneEdge ? 0 : radius.md,
          backgroundColor: palette.surface,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function EdgeSectionHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
      <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
        <Text
          accessibilityRole="header"
          selectable
          style={{ color: palette.muted, fontSize: 14, lineHeight: 20, fontWeight: '600' }}
        >
          {title}
        </Text>
        {detail ? (
          <Text selectable style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function EdgeRow({
  title,
  detail,
  icon,
  iconColor = palette.text,
  leading,
  trailing,
  showChevron,
  disabled,
  onPress,
  accessibilityLabel,
  titleStyle,
  style,
}: {
  title: string;
  detail?: string;
  icon?: AppIconName;
  iconColor?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  titleStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const hasLeading = Boolean(icon || leading);
  const row = (
    <>
      {hasLeading ? (
        <View style={{ minHeight: detail ? 48 : 36, width: 32, alignItems: 'center', justifyContent: 'center' }}>
          {leading || (icon ? <AppIcon color={iconColor} name={icon} size={25} /> : null)}
        </View>
      ) : null}
      <View style={{ minWidth: 0, flex: 1, justifyContent: 'center', gap: 1 }}>
        <Text
          numberOfLines={detail ? 2 : 1}
          selectable
          style={[
            { color: palette.textStrong, fontSize: 16, lineHeight: 22, fontWeight: '600' },
            titleStyle,
          ]}
        >
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={3} selectable style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>{trailing}</View> : null}
      {(showChevron ?? Boolean(onPress)) ? <AppIcon color={palette.placeholder} name="chevron-forward" size={20} /> : null}
    </>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          accessibilityLabel={accessibilityLabel || title}
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(disabled) }}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            {
              minHeight: detail ? 72 : 60,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: detail ? spacing.sm : spacing.xs,
              backgroundColor: pressed ? palette.surfaceStrong : palette.surface,
              opacity: disabled ? 0.48 : 1,
            },
            style,
          ]}
        >
          {row}
        </Pressable>
      ) : (
        <View
          style={[
            {
              minHeight: detail ? 72 : 60,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: detail ? spacing.sm : spacing.xs,
              backgroundColor: palette.surface,
              opacity: disabled ? 0.48 : 1,
            },
            style,
          ]}
        >
          {row}
        </View>
      )}
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
  maxLength,
  minHeight,
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
  /** Hard cap on typed characters. Mirror the backend `binding:"max=N"` for the
   *  field so the keyboard stops before the API rejects the request. */
  maxLength?: number;
  /** Starting height for a multiline field. The default reserves three lines,
   *  which is generous for a note that is usually a few words. */
  minHeight?: number;
  error?: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const canReveal = Boolean(secureTextEntry && revealLabel && hideLabel);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      {/* Shadow on the wrapper, not the input — see SearchField for why. */}
      <View style={{ justifyContent: multiline ? 'flex-start' : 'center', borderRadius: radius.md, ...controlShadow }}>
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
          maxLength={maxLength}
          multiline={multiline}
          onChangeText={onChangeText}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={palette.placeholder}
          secureTextEntry={Boolean(secureTextEntry && !revealed)}
          textContentType={textContentType}
          style={{
            minHeight: minHeight ?? (multiline ? 104 : 54),
            borderWidth: 1,
            borderColor: error ? palette.danger : focused ? palette.primary : palette.controlBorder,
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
  autoFocus,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  clearLabel?: string;
  /** For a field that appears on demand: without it the caller has to tap the
   *  magnifier and then the field it just summoned. */
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    // The lift sits on this wrapper, not on the TextInput: Android's ReactEditText
    // applies background, border and radius from the style but not box shadow, so
    // a shadow set on the input itself renders on iOS and silently vanishes on
    // Android. The radius here has to match the input so the glow follows its shape.
    <View style={{ justifyContent: 'center', borderRadius: radius.md, ...controlShadow }}>
      <View style={{ position: 'absolute', left: spacing.md, zIndex: 1, pointerEvents: 'none' }}>
        <AppIcon color={focused ? palette.textStrong : palette.muted} name="search-outline" size={19} />
      </View>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        returnKeyType="search"
        style={{
          minHeight: 52,
          borderWidth: 1,
          borderColor: focused ? palette.primary : palette.controlBorder,
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

/**
 * `fill` splits the row evenly between the chips instead of sizing each to its
 * own text, for the case where the group is the whole width of a screen and
 * content-sized chips would leave dead space to their right. It has no effect
 * with `scrollable`, where the row is wider than the viewport by design.
 */
export function ChipGroup<T extends string | number>({ label, value, options, onChange, scrollable = false, fill = false }: { label?: string; value: T; options: Array<{ label: string; value: T }>; onChange: (value: T) => void; scrollable?: boolean; fill?: boolean }) {
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
          alignItems: fill && !scrollable ? 'center' : undefined,
          flex: fill && !scrollable ? 1 : undefined,
          minWidth: fill && !scrollable ? 0 : undefined,
          borderWidth: 1,
          borderColor: selected ? palette.primary : palette.borderStrong,
          borderRadius: radius.md,
          backgroundColor: selected ? palette.primary : palette.surface,
          paddingHorizontal: spacing.md,
          ...controlShadow,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Text numberOfLines={fill && !scrollable ? 1 : undefined} style={{ color: selected ? palette.primaryText : palette.text, fontSize: 13, fontWeight: '700' }}>{option.label}</Text>
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
        <View style={{ flexDirection: 'row', flexWrap: fill ? 'nowrap' : 'wrap', gap: spacing.sm }}>{controls}</View>
      )}
    </View>
  );
}

/**
 * A dropdown built from a pressable field and a sheet of options.
 *
 * There is no native picker here on purpose: one would be a native dependency,
 * which costs a rebuild and locks the team's iOS members out of testing it in
 * Expo Go. It replaces a chip row where the list is long enough that the chips
 * scroll sideways, which hides options behind a gesture nobody is told about.
 */
export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}: {
  label?: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={{ gap: spacing.sm }}>
      {label ? <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          borderWidth: 1,
          borderColor: palette.borderStrong,
          borderRadius: radius.md,
          backgroundColor: palette.surface,
          paddingHorizontal: spacing.md,
          ...controlShadow,
          opacity: disabled ? 0.6 : pressed ? 0.72 : 1,
        })}
      >
        <Text
          numberOfLines={1}
          style={{
            minWidth: 0,
            flex: 1,
            color: selected ? palette.text : palette.muted,
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          {selected?.label ?? placeholder ?? ''}
        </Text>
        <AppIcon color={palette.muted} name="chevron-down" size={18} />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        transparent
        visible={open}
      >
        <Pressable
          accessibilityLabel={placeholder ?? label}
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.45)',
          }}
        >
          {/* Stops a tap inside the sheet from reaching the dismiss backdrop. */}
          <Pressable
            onPress={() => undefined}
            style={{
              maxHeight: '70%',
              borderTopLeftRadius: radius.md,
              borderTopRightRadius: radius.md,
              backgroundColor: palette.surface,
              // Clears the home indicator. At spacing.xl the last row sat right
              // on the gesture bar, which both looks cramped and is where the
              // system swallows the tap.
              paddingBottom: spacing.xxxl + spacing.md,
            }}
          >
            {label ? (
              <View style={{ borderBottomWidth: 1, borderBottomColor: palette.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
              </View>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <View key={String(option.value)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={String(option.value)}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({
                      minHeight: 52,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      backgroundColor: pressed ? palette.surfaceSubtle : 'transparent',
                      paddingHorizontal: spacing.lg,
                    })}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        minWidth: 0,
                        flex: 1,
                        color: palette.text,
                        fontSize: 15,
                        fontWeight: isSelected ? '700' : '500',
                      }}
                    >
                      {option.label}
                    </Text>
                    {isSelected ? <AppIcon color={palette.primary} name="checkmark" size={20} /> : null}
                  </Pressable>
                  {/* Inset hairline, and none after the last row. Drawn as its
                      own view rather than a bottom border so it can stop short
                      of both edges instead of walling the sheet off. */}
                  {index === options.length - 1 ? null : (
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.lg }} />
                  )}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * One choice per line with the state on the right, for a decision worth reading
 * before making — a payment method, say. Chips put the options side by side and
 * ask you to compare them at a glance; a stacked list asks you to read them.
 */
export function RadioGroup<T extends string | number>({ label, value, options, onChange }: { label?: string; value: T; options: Array<{ label: string; value: T; disabled?: boolean }>; onChange: (value: T) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {label ? <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: '700' }}>{label}</Text> : null}
      <View style={{ borderWidth: 1, borderColor: palette.controlBorder, borderRadius: radius.md, backgroundColor: palette.surface, overflow: 'hidden' }}>
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <View key={String(option.value)}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: Boolean(option.disabled) }}
              disabled={option.disabled}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => ({
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingHorizontal: spacing.md,
                backgroundColor: pressed ? palette.surfaceSubtle : 'transparent',
                opacity: option.disabled ? 0.48 : 1,
              })}
            >
              <Text numberOfLines={1} style={{ minWidth: 0, flex: 1, color: palette.text, fontSize: 15, fontWeight: selected ? '700' : '500' }}>{option.label}</Text>
              <View
                style={{
                  width: 22,
                  height: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: selected ? palette.primary : palette.borderStrong,
                  borderRadius: radius.full,
                }}
              >
                {selected ? <View style={{ width: 11, height: 11, borderRadius: radius.full, backgroundColor: palette.primary }} /> : null}
              </View>
            </Pressable>
            {index === options.length - 1 ? null : (
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.divider, marginHorizontal: spacing.md }} />
            )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function Feedback({ title, detail, tone = 'neutral' }: { title: string; detail?: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  const style = statusTone(tone);
  return (
    <View
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : tone === 'neutral' ? 'none' : 'polite'}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={{ gap: spacing.xs, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, ...style }}
    >
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
  showTopBorder = true,
}: {
  label?: string;
  value?: string;
  children: React.ReactNode;
  showTopBorder?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: showTopBorder ? 1 : 0, borderTopColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
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
