import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { useAuth, CustomerAccountRejected } from '@/lib/auth-context';
import { colors, radius, spacing, text } from '@/theme';

export default function StaffLoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err: unknown) {
      if (err instanceof CustomerAccountRejected) {
        setError(err.message);
      } else {
        const apiMsg = (err as { message?: string | string[] })?.message;
        setError(
          (Array.isArray(apiMsg) ? apiMsg[0] : apiMsg) ||
            'Login failed. Check your credentials and try again.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll keyboardAware>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>Martino Noir</Text>
        <Text style={styles.brandSub}>Staff Scanner</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>
          Staff accounts only. Customer accounts cannot sign in here.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.form}>
        <Input
          label="Email"
          required
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@martinonoir.com"
          value={email}
          onChangeText={setEmail}
        />

        <View>
          <Input
            label="Password"
            required
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            secureTextEntry={!showPassword}
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
            style={styles.eyeBtn}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.ink[500]}
            />
          </Pressable>
        </View>

        <Button
          title="Sign in"
          onPress={handleSubmit}
          loading={submitting}
          fullWidth
          size="lg"
          style={{ marginTop: spacing[2] }}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Forgot your password? Ask a Martino Noir administrator to reset it.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { marginTop: spacing[4], marginBottom: spacing[8] },
  brand: {
    ...text.lg,
    fontWeight: '700',
    color: colors.ink[900],
    letterSpacing: 0.5,
  },
  brandSub: {
    ...text.xs,
    color: colors.ink[500],
    letterSpacing: 2,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  header: { marginBottom: spacing[6] },
  title: {
    ...text['4xl'],
    fontWeight: '700',
    color: colors.ink[900],
    marginBottom: spacing[2],
    letterSpacing: -0.5,
  },
  subtitle: { ...text.base, color: colors.ink[500] },
  form: { gap: spacing[4] },
  eyeBtn: {
    position: 'absolute',
    right: spacing[3],
    top: 36,
    padding: spacing[2],
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.dangerLight,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    marginBottom: spacing[4],
  },
  errorText: { ...text.sm, color: colors.danger, flex: 1 },
  footer: {
    marginTop: spacing[10],
    marginBottom: spacing[4],
  },
  footerText: { ...text.sm, color: colors.ink[500], textAlign: 'center' },
});

export const options = { title: 'Sign In' };
