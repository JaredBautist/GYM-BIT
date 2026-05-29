/**
 * ForgotPasswordScreen — pantalla de recuperación de contraseña.
 *
 * Requirements: 1.5
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
} from 'react-native';
import { useRouter } from 'expo-router';

export default function ForgotPasswordScreen(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (!email.trim()) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (response.ok) {
        setSent(true);
      } else {
        const data = (await response.json()) as { error?: string; message?: string };
        setError(data.error ?? data.message ?? 'Error al enviar el correo. Intenta de nuevo.');
      }
    } catch {
      setError('Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title} accessibilityRole="header">Correo enviado</Text>
          <Text style={styles.description}>
            Si el correo {email} está registrado, recibirás un enlace para restablecer tu contraseña en menos de 60 segundos.{'\n\n'}
            El enlace es válido por 30 minutos.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/auth/login')}
            accessibilityRole="button"
            accessibilityLabel="Volver al inicio de sesión"
          >
            <Text style={styles.buttonText}>Volver al inicio de sesión</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">Recuperar contraseña</Text>
        <Text style={styles.description}>
          Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
        </Text>

        {error && (
          <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label} nativeID="email-label">Correo electrónico</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Correo electrónico"
            accessibilityLabelledBy="email-label"
            editable={!loading}
            placeholder="tu@correo.com"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Enviar enlace de recuperación"
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Enviar enlace</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  title: { fontSize: 28, fontWeight: '700', color: '#F9FAFB', marginBottom: 12 },
  description: { fontSize: 15, color: '#9CA3AF', marginBottom: 32, lineHeight: 22 },
  errorBanner: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { color: '#991B1B', fontSize: 14 },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '500', color: '#D1D5DB', marginBottom: 6 },
  input: { backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#F9FAFB', minHeight: 48 },
  button: { backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  backButton: { marginTop: 24, alignItems: 'center' },
  backText: { color: '#6366F1', fontSize: 15 },
});
