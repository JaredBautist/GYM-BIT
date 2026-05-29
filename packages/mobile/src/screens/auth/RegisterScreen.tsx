/**
 * RegisterScreen — pantalla de registro con correo y contraseña.
 *
 * Requirements: 1.2, 1.3, 1.4
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
} from 'react-native';
import { useRouter } from 'expo-router';

import { saveSession } from '../../db/repositories/user.repository';

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterScreen(): React.JSX.Element {
  const router = useRouter();

  const [form, setForm] = useState<RegisterForm>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function validate(): string | null {
    if (!form.name.trim()) return 'El nombre es requerido.';
    if (!form.email.trim()) return 'El correo es requerido.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'El correo no es válido.';
    if (form.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (form.password !== form.confirmPassword) return 'Las contraseñas no coinciden.';
    return null;
  }

  async function handleRegister(): Promise<void> {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        code?: string;
        accessToken?: string;
        refreshToken?: string;
        user?: { id: string };
      };

      if (!response.ok) {
        setError(data.message ?? 'Error al crear la cuenta. Intenta de nuevo.');
        return;
      }

      // Si el servidor devuelve tokens directamente (sin verificación de email)
      if (data.accessToken && data.refreshToken && data.user?.id) {
        await saveSession(data.user.id, data.accessToken, data.refreshToken);
        router.replace('/onboarding');
      } else {
        // Flujo con verificación de email
        setSuccess(true);
      }
    } catch {
      setError('Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successTitle} accessibilityRole="header">
          ¡Revisa tu correo!
        </Text>
        <Text style={styles.successText}>
          Te enviamos un enlace de verificación a {form.email}.{'\n'}
          Haz clic en el enlace para activar tu cuenta.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/auth/login')}
          accessibilityRole="button"
          accessibilityLabel="Ir al inicio de sesión"
        >
          <Text style={styles.buttonText}>Ir al inicio de sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title} accessibilityRole="header">
          Crear cuenta
        </Text>

        {error && (
          <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {[
          { key: 'name', label: 'Nombre completo', placeholder: 'Juan García', secure: false, keyboard: 'default' as const },
          { key: 'email', label: 'Correo electrónico', placeholder: 'tu@correo.com', secure: false, keyboard: 'email-address' as const },
          { key: 'password', label: 'Contraseña', placeholder: '••••••••', secure: true, keyboard: 'default' as const },
          { key: 'confirmPassword', label: 'Confirmar contraseña', placeholder: '••••••••', secure: true, keyboard: 'default' as const },
        ].map(({ key, label, placeholder, secure, keyboard }) => (
          <View key={key} style={styles.inputGroup}>
            <Text style={styles.label} nativeID={`${key}-label`}>{label}</Text>
            <TextInput
              style={styles.input}
              value={form[key as keyof RegisterForm]}
              onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
              secureTextEntry={secure}
              keyboardType={keyboard}
              autoCapitalize={key === 'name' ? 'words' : 'none'}
              accessibilityLabel={label}
              accessibilityLabelledBy={`${key}-label`}
              editable={!loading}
              placeholder={placeholder}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        ))}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Crear cuenta"
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Crear cuenta</Text>
          )}
        </TouchableOpacity>

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>¿Ya tienes cuenta? </Text>
          <TouchableOpacity
            onPress={() => router.replace('/auth/login')}
            accessibilityRole="link"
            accessibilityLabel="Iniciar sesión"
          >
            <Text style={styles.loginLink}>Iniciar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  title: { fontSize: 28, fontWeight: '700', color: '#F9FAFB', textAlign: 'center', marginBottom: 32 },
  errorBanner: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { color: '#991B1B', fontSize: 14 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#D1D5DB', marginBottom: 6 },
  input: { backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#F9FAFB', minHeight: 48 },
  button: { backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8, minHeight: 48 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  loginText: { color: '#9CA3AF', fontSize: 14 },
  loginLink: { color: '#6366F1', fontSize: 14, fontWeight: '600' },
  successContainer: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  successTitle: { fontSize: 28, fontWeight: '700', color: '#F9FAFB', marginBottom: 16 },
  successText: { fontSize: 16, color: '#9CA3AF', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
});
