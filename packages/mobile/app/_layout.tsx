/**
 * Layout raíz de Expo Router.
 * Gestiona la autenticación y redirige según el estado de sesión.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';

import { getSession } from '../src/db/repositories/user.repository';
import { getDatabase } from '../src/db/database';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Inicializar la base de datos SQLite al arrancar
    getDatabase()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/register" />
        <Stack.Screen name="auth/forgot-password" />
        <Stack.Screen name="onboarding/index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile/weight-history" options={{ headerShown: true, title: 'Historial de peso', headerStyle: { backgroundColor: '#111827' }, headerTintColor: '#F9FAFB' }} />
        <Stack.Screen name="workout/session" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="workout/session-summary" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </>
  );
}
