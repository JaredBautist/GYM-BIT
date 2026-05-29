/**
 * Tab de perfil — perfil, wearables y notificaciones.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import ProfileScreen from '../../src/screens/profile/ProfileScreen';
import WearablesScreen from '../../src/screens/settings/WearablesScreen';
import NotificationSettingsScreen from '../../src/screens/settings/NotificationSettingsScreen';
import { clearSession } from '../../src/db/repositories/user.repository';

type ProfileView = 'profile' | 'wearables' | 'notifications';

export default function ProfileTab() {
  const router = useRouter();
  const [view, setView] = useState<ProfileView>('profile');

  async function handleLogout() {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: async () => {
            await clearSession();
            router.replace('/auth/login');
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      {/* Header con logout */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {view === 'profile' ? 'Mi Perfil' : view === 'wearables' ? 'Wearables' : 'Notificaciones'}
        </Text>
        <TouchableOpacity
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          style={styles.logoutBtn}
        >
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Selector de sección */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.selectorScroll}
        contentContainerStyle={styles.selectorContent}
      >
        {([
          { key: 'profile', label: '👤 Perfil' },
          { key: 'wearables', label: '⌚ Wearables' },
          { key: 'notifications', label: '🔔 Notificaciones' },
        ] as Array<{ key: ProfileView; label: string }>).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.selectorChip, view === key && styles.selectorChipActive]}
            onPress={() => setView(key)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: view === key }}
          >
            <Text style={[styles.selectorText, view === key && styles.selectorTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Contenido */}
      <View style={styles.content}>
        {view === 'profile' && <ProfileScreen />}
        {view === 'wearables' && <WearablesScreen />}
        {view === 'notifications' && <NotificationSettingsScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#F9FAFB' },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  selectorScroll: { maxHeight: 48 },
  selectorContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  selectorChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1F2937', borderWidth: 1.5, borderColor: '#374151' },
  selectorChipActive: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  selectorText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  selectorTextActive: { color: '#A5B4FC' },
  content: { flex: 1 },
});
