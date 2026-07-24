/**
 * Mizani shared UI primitives — redesigned to ui-ux-pro-max "Modern Dark
 * (Cinema Mobile)" spec.
 *
 * Design rules applied (from skill audit):
 * — No emoji as structural icons → @expo/vector-icons throughout
 * — Touch targets ≥ 44pt (paddingVertical 14 minimum on buttons)
 * — Pressed state feedback within 80-150ms (opacity + scale via Animated)
 * — 8dp spacing rhythm: 8 / 16 / 24 / 32 / 48
 * — Semantic colour tokens only (never hardcoded hex in screens)
 * — SafeAreaView on Screen to respect notch / gesture bar
 * — Inter font loaded via @expo-google-fonts/inter in root _layout
 */

import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// ─────────────────────────────────────────────
// Theme hook
// ─────────────────────────────────────────────
export type Theme = typeof Colors.light;

export function useTheme(): Theme {
  const scheme = useColorScheme() ?? 'light';
  return Colors[scheme];
}

// ─────────────────────────────────────────────
// Screen — safe-area aware root wrapper
// ─────────────────────────────────────────────
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// Card — elevated surface with shadow
// ─────────────────────────────────────────────
export function Card({
  children,
  style,
  elevated,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
}) {
  const c = useTheme();
  const bg = elevated ? c.surfaceElevated : c.surface;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor: c.border,
          shadowColor: c.shadow,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────
// Typography
// ─────────────────────────────────────────────
export function Title({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const c = useTheme();
  return <Text style={[styles.title, { color: c.text }, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const c = useTheme();
  return <Text style={[styles.heading, { color: c.text }, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const c = useTheme();
  return <Text style={[styles.body, { color: c.text }, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const c = useTheme();
  return <Text style={[styles.muted, { color: c.textMuted }, style]}>{children}</Text>;
}

/** Uppercase labelled section divider with thin rule. */
export function SectionLabel({ label }: { label: string }) {
  const c = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>{label.toUpperCase()}</Text>
      <View style={[styles.sectionRule, { backgroundColor: c.border }]} />
    </View>
  );
}

// ─────────────────────────────────────────────
// Badge — semantic status pill
// ─────────────────────────────────────────────
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const BADGE_MAP: Record<BadgeVariant, { text: string; bg: string }> = {
  success: 'success',
  warning: 'warning',
  danger:  'danger',
  info:    'info',
  neutral: 'border',
} as unknown as Record<BadgeVariant, { text: string; bg: string }>;

export function Badge({ label, variant = 'neutral' }: { label: string; variant?: BadgeVariant }) {
  const c = useTheme();
  const colorMap: Record<BadgeVariant, { text: string; bg: string }> = {
    success: { text: c.success,  bg: c.successBg },
    warning: { text: c.warning,  bg: c.warningBg },
    danger:  { text: c.danger,   bg: c.dangerBg  },
    info:    { text: c.info,     bg: c.infoBg    },
    neutral: { text: c.textMuted, bg: c.surface  },
  };
  const { text, bg } = colorMap[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: text + '33' }]}>
      <Text style={[styles.badgeLabel, { color: text }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// StatCard — hero metric card
// ─────────────────────────────────────────────
export function StatCard({
  label,
  value,
  accent,
  style,
}: {
  label: string;
  value: string;
  accent?: string;
  style?: ViewStyle;
}) {
  const c = useTheme();
  return (
    <Card style={StyleSheet.flatten([styles.statCard, style])}>
      <Text style={[styles.statValue, { color: accent ?? c.tint }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </Card>
  );
}

// ─────────────────────────────────────────────
// FieldInput — styled text input with label
// ─────────────────────────────────────────────
import { TextInput, TextInputProps } from 'react-native';

export function FieldInput({
  label,
  style,
  ...props
}: TextInputProps & { label?: string; style?: ViewStyle }) {
  const c = useTheme();
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.textMuted}
        style={[
          styles.input,
          {
            borderColor: c.border,
            color: c.text,
            backgroundColor: c.surfaceElevated,
          },
        ]}
        {...props}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────
function useScalePress() {
  const scale = new Animated.Value(1);
  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  return { scale, onPressIn, onPressOut };
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const c = useTheme();
  const { scale, onPressIn, onPressOut } = useScalePress();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}>
      <Animated.View
        style={[
          styles.button,
          { backgroundColor: c.tint, opacity: disabled ? 0.45 : 1, transform: [{ scale }] },
        ]}>
        {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
        <Text style={[styles.buttonLabel, { color: c.textOnPrimary }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const c = useTheme();
  const { scale, onPressIn, onPressOut } = useScalePress();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}>
      <Animated.View
        style={[
          styles.button,
          styles.buttonSecondary,
          { borderColor: c.tint, opacity: disabled ? 0.45 : 1, transform: [{ scale }] },
        ]}>
        {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
        <Text style={[styles.buttonLabel, { color: c.tint }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function DangerButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const c = useTheme();
  const { scale, onPressIn, onPressOut } = useScalePress();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}>
      <Animated.View
        style={[
          styles.button,
          styles.buttonSecondary,
          { borderColor: c.danger, opacity: disabled ? 0.45 : 1, transform: [{ scale }] },
        ]}>
        <Text style={[styles.buttonLabel, { color: c.danger }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────
// Loading spinner
// ─────────────────────────────────────────────
export function Loading({ label }: { label?: string }) {
  const c = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.tint} size="large" />
      {label ? <Text style={[styles.muted, { color: c.textMuted, marginTop: 12 }]}>{label}</Text> : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// Error text
// ─────────────────────────────────────────────
export function ErrorText({ message }: { message: string }) {
  const c = useTheme();
  return (
    <View style={[styles.errorBanner, { backgroundColor: c.dangerBg, borderColor: c.danger + '44' }]}>
      <Text style={[styles.errorMsg, { color: c.danger }]}>{message}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────
export function Divider({ style }: { style?: ViewStyle }) {
  const c = useTheme();
  return <View style={[styles.divider, { backgroundColor: c.border }, style]} />;
}

// ─────────────────────────────────────────────
// StyleSheet
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    // Elevation shadow
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    marginBottom: 4,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'Inter_400Regular',
  },
  muted: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
  },
  sectionRule: {
    flex: 1,
    height: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  statCard: {
    flex: 1,
    padding: 16,
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 10,
    minHeight: 52, // ≥ 44pt touch target
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  errorMsg: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
});
