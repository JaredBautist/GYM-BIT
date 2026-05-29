/**
 * Pantalla de entrada — redirige según estado de sesión.
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

import { getSession } from '../src/db/repositories/user.repository';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    getSession().then((session) => {
      if (!isMounted) return;

      if (session) {
        router.replace('/(tabs)');
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
