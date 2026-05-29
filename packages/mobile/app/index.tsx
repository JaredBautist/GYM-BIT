/**
 * Pantalla de entrada — redirige según estado de sesión y onboarding.
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

import { getSession, getUserById } from '../src/db/repositories/user.repository';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    getSession().then(async (session) => {
      if (!isMounted) return;

      if (session) {
        const user = await getUserById(session.userId);
        const hasOnboarding = user && user.goal && user.heightCm && user.weightKg;
        router.replace(hasOnboarding ? '/(tabs)' : '/onboarding');
      } else {
        router.replace('/auth/login');
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  );
}
