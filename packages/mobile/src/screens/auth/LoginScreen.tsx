/**
 * LoginScreen — pantalla de inicio de sesión.
 *
 * Soporta:
 *  - Login con correo y contraseña
 *  - "Continuar con Google" (OAuth 2.0 via Auth0 + expo-auth-session)
 *  - Mensajes de error inline y bloqueo por intentos fallidos
 *  - Persistencia de sesión local al autenticarse exitosamente
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.8
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

import { saveSession, upsertUser } from '../../db/repositories/user.repository';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = '455748712795-o4ebtpv3occlu28o7rkge9ve8ptva77q.apps.googleusercontent.com';

// ── Types ────────────────────────────────────────────────────────────────────

interface LoginForm {
  email: string;
  password: string;
}

interface ApiError {
  code?: string;
  message: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginScreen(): React.JSX.Element {
  const router = useRouter();

  const [form, setForm] = useState<LoginForm>({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMinutes, setBlockMinutes] = useState(0);

  // ── Email/password login ────────────────────────────────────────────────────

  async function handleEmailLogin(): Promise<void> {
    if (!form.email.trim() || !form.password.trim()) {
      setError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    setError(null);

    const apiUrl = process.env['EXPO_PUBLIC_API_URL'];
    console.log('[LoginScreen] API URL:', apiUrl);

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });

      const data = (await response.json()) as {
        tokens?: { accessToken: string; refreshToken: string };
        user?: { id: string };
        code?: string;
        error?: string;
        message?: string;
        blockedMinutes?: number;
      };

      if (!response.ok) {
        if (data.code === 'ACCOUNT_LOCKED') {
          setIsBlocked(true);
          setBlockMinutes(data.blockedMinutes ?? 15);
          setError(`Cuenta bloqueada por ${data.blockedMinutes ?? 15} minutos por intentos fallidos.`);
        } else {
          setError(data.error ?? data.message ?? 'Credenciales incorrectas. Intenta de nuevo.');
        }
        return;
      }

      if (data.tokens?.accessToken && data.tokens?.refreshToken && data.user?.id) {
        // Persistir sesión localmente (AES-256 via expo-secure-store) — Req 1.8
        await saveSession(data.user.id, data.tokens.accessToken, data.tokens.refreshToken);
        // Guardar datos básicos del usuario en caché local
        await upsertUser({
          id: data.user.id,
          email: data.user.email ?? '',
          name: data.user.name ?? '',
          auth0Id: null,
          isActive: 1,
          emailVerified: data.user.emailVerified ? 1 : 0,
          birthDate: null,
          gender: null,
          heightCm: null,
          weightKg: null,
          goal: null,
          experienceLevel: null,
          availableDays: null,
          medicalConditions: null,
          bmi: null,
          bmr: null,
          tdee: null,
        }).catch(() => {});
        router.replace('/');
      }
    } catch (err) {
      console.log('[LoginScreen] Error:', err instanceof Error ? err.message : err);
      console.log('[LoginScreen] Stack:', err instanceof Error ? err.stack : '');
      setError(`Error: ${err instanceof Error ? err.message : 'desconocido'}`);
    } finally {
      setLoading(false);
    }
  }

  // ── Google OAuth login ──────────────────────────────────────────────────────

  async function handleGoogleLogin(): Promise<void> {
    setGoogleLoading(true);
    setError(null);

    try {
      const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `response_type=code` +
        `&client_id=${GOOGLE_WEB_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=openid%20email%20profile` +
        `&access_type=offline`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');

        if (code) {
          const response = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, clientId: GOOGLE_WEB_CLIENT_ID, redirectUri }),
          });

      const rawText = await response.text();
      console.log('[LoginScreen] Response status:', response.status, 'Body:', rawText.slice(0, 200));
      const data = JSON.parse(rawText) as {
            tokens?: { accessToken: string; refreshToken: string };
            user?: { id: string };
            error?: string;
          };

          if (response.ok && data.tokens?.accessToken && data.tokens?.refreshToken && data.user?.id) {
            await saveSession(data.user.id, data.tokens.accessToken, data.tokens.refreshToken);
            await upsertUser({
              id: data.user.id,
              email: (data.user as { email?: string }).email ?? '',
              name: (data.user as { name?: string }).name ?? '',
              auth0Id: null,
              isActive: 1,
              emailVerified: 0,
              birthDate: null,
              gender: null,
              heightCm: null,
              weightKg: null,
              goal: null,
              experienceLevel: null,
              availableDays: null,
              medicalConditions: null,
              bmi: null,
              bmr: null,
              tdee: null,
            }).catch(() => {});
            router.replace('/');
          } else {
            setError(data.error ?? 'Error al autenticar con Google.');
          }
        } else {
          setError('No se recibió respuesta de Google.');
        }
      }
    } catch {
      setError('Error al iniciar sesión con Google.');
    } finally {
      setGoogleLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / título */}
        <Text style={styles.title} accessibilityRole="header">
          GymBit
        </Text>
        <Text style={styles.subtitle}>Tu compañero fitness inteligente</Text>

        {/* Error banner */}
        {error && (
          <View
            style={[styles.errorBanner, isBlocked && styles.errorBannerBlocked]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Email input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label} nativeID="email-label">
            Correo electrónico
          </Text>
          <TextInput
            style={styles.input}
            value={form.email}
            onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Correo electrónico"
            accessibilityLabelledBy="email-label"
            editable={!isBlocked && !loading}
            placeholder="tu@correo.com"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Password input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label} nativeID="password-label">
            Contraseña
          </Text>
          <TextInput
            style={styles.input}
            value={form.password}
            onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            accessibilityLabel="Contraseña"
            accessibilityLabelledBy="password-label"
            editable={!isBlocked && !loading}
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Forgot password */}
        <TouchableOpacity
          onPress={() => router.push('/auth/forgot-password')}
          accessibilityRole="link"
          accessibilityLabel="¿Olvidaste tu contraseña?"
        >
          <Text style={styles.forgotPassword}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>

        {/* Login button */}
        <TouchableOpacity
          style={[styles.button, (loading || isBlocked) && styles.buttonDisabled]}
          onPress={handleEmailLogin}
          disabled={loading || isBlocked}
          accessibilityRole="button"
          accessibilityLabel="Iniciar sesión"
          accessibilityState={{ disabled: loading || isBlocked, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Iniciar sesión</Text>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>o</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google button */}
        <TouchableOpacity
          style={[styles.googleButton, (loading || googleLoading) && styles.buttonDisabled]}
          onPress={handleGoogleLogin}
          disabled={loading || googleLoading}
          accessibilityRole="button"
          accessibilityLabel="Continuar con Google"
        >
          {googleLoading ? (
            <ActivityIndicator color="#F9FAFB" />
          ) : (
            <Text style={styles.googleButtonText}>Continuar con Google</Text>
          )}
        </TouchableOpacity>

        {/* Register link */}
        <View style={styles.registerRow}>
          <Text style={styles.registerText}>¿No tienes cuenta? </Text>
          <TouchableOpacity
            onPress={() => router.push('/auth/register')}
            accessibilityRole="link"
            accessibilityLabel="Crear cuenta"
          >
            <Text style={styles.registerLink}>Crear cuenta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#F9FAFB',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerBlocked: {
    backgroundColor: '#FEF3C7',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#D1D5DB',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#F9FAFB',
    minHeight: 48,
  },
  forgotPassword: {
    color: '#6366F1',
    fontSize: 14,
    textAlign: 'right',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#374151',
  },
  dividerText: {
    color: '#6B7280',
    marginHorizontal: 12,
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  googleButtonText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '500',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  registerText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  registerLink: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '600',
  },
});
