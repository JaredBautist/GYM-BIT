/**
 * NotificationSettingsScreen — configuración de notificaciones por tipo.
 *
 * Requirements: 11.1, 11.2, 11.4
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, Switch, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';

import { getSession } from '../../db/repositories/user.repository';

interface NotificationSetting {
  id: string;
  notificationType: string;
  isEnabled: boolean;
  scheduledTime: string | null;
}

const NOTIFICATION_LABELS: Record<string, { label: string; emoji: string; description: string }> = {
  WORKOUT_REMINDER: { label: 'Recordatorio de entrenamiento', emoji: '💪', description: 'Te avisa cuando es hora de entrenar' },
  HYDRATION_REMINDER: { label: 'Recordatorio de hidratación', emoji: '💧', description: 'Te recuerda tomar agua durante el día' },
  MEAL_REMINDER: { label: 'Recordatorio de comida', emoji: '🍽️', description: 'Si no has registrado comidas antes de las 14:00' },
  PR_ALERT: { label: 'Alerta de récord personal', emoji: '🏆', description: 'Cuando rompes un récord personal' },
  ACHIEVEMENT_ALERT: { label: 'Logros y rachas', emoji: '🎯', description: 'Cuando alcanzas un logro o mantienes una racha' },
  LOW_RECOVERY_ALERT: { label: 'Alerta de recuperación baja', emoji: '😴', description: 'Cuando tu sueño indica baja recuperación' },
  WEIGH_IN_REMINDER: { label: 'Recordatorio de pesaje', emoji: '⚖️', description: 'Recordatorio semanal para registrar tu peso' },
};

export default function NotificationSettingsScreen(): React.JSX.Element {
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { void loadSettings(); }, []);

  async function loadSettings(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) return;
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/notifications/settings`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Array<{
          id: string; notification_type: string; is_enabled: boolean; scheduled_time: string | null;
        }>;
        setSettings(data.map((d) => ({
          id: d.id, notificationType: d.notification_type,
          isEnabled: !!d.is_enabled, scheduledTime: d.scheduled_time,
        })));
      }
    } catch { /* sin conexión */ }
    finally { setLoading(false); }
  }

  async function handleToggle(notificationType: string, isEnabled: boolean): Promise<void> {
    setSaving(notificationType);
    try {
      const session = await getSession();
      if (!session) return;
      await fetch(`${process.env.EXPO_PUBLIC_API_URL}/notifications/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ notificationType, isEnabled }),
      });
      setSettings((prev) => prev.map((s) =>
        s.notificationType === notificationType ? { ...s, isEnabled } : s,
      ));
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la configuración.');
    } finally {
      setSaving(null);
    }
  }

  async function handleConnectCalendar(provider: 'google' | 'apple'): Promise<void> {
    Alert.alert(
      `Conectar ${provider === 'google' ? 'Google Calendar' : 'Apple Calendar'}`,
      'Esta función requiere autorización. ¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Conectar',
          onPress: () => Alert.alert('Próximamente', 'La integración con calendarios estará disponible en la próxima versión.'),
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#6366F1" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">Notificaciones</Text>

      {settings.map((setting) => {
        const info = NOTIFICATION_LABELS[setting.notificationType];
        if (!info) return null;

        return (
          <View key={setting.id} style={styles.settingRow} accessibilityLabel={`${info.label}: ${setting.isEnabled ? 'activado' : 'desactivado'}`}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingEmoji}>{info.emoji}</Text>
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{info.label}</Text>
                <Text style={styles.settingDescription}>{info.description}</Text>
              </View>
            </View>
            {saving === setting.notificationType ? (
              <ActivityIndicator size="small" color="#6366F1" />
            ) : (
              <Switch
                value={setting.isEnabled}
                onValueChange={(v) => void handleToggle(setting.notificationType, v)}
                trackColor={{ false: '#374151', true: '#4F46E5' }}
                thumbColor={setting.isEnabled ? '#6366F1' : '#9CA3AF'}
                accessibilityLabel={`${setting.isEnabled ? 'Desactivar' : 'Activar'} ${info.label}`}
              />
            )}
          </View>
        );
      })}

      {/* Integración con calendarios */}
      <Text style={styles.sectionTitle}>Calendarios</Text>
      <Text style={styles.sectionSubtitle}>Crea eventos de entrenamiento automáticamente en tu calendario.</Text>

      {(['google', 'apple'] as const).map((provider) => (
        <TouchableOpacity
          key={provider}
          style={styles.calendarButton}
          onPress={() => void handleConnectCalendar(provider)}
          accessibilityRole="button"
          accessibilityLabel={`Conectar ${provider === 'google' ? 'Google Calendar' : 'Apple Calendar'}`}
        >
          <Text style={styles.calendarEmoji}>{provider === 'google' ? '📅' : '🗓️'}</Text>
          <Text style={styles.calendarText}>
            {provider === 'google' ? 'Google Calendar' : 'Apple Calendar'}
          </Text>
          <Text style={styles.calendarArrow}>→</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 48 },
  loading: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 20 },
  settingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  settingInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingEmoji: { fontSize: 22 },
  settingText: { flex: 1 },
  settingLabel: { fontSize: 14, fontWeight: '600', color: '#F9FAFB', marginBottom: 2 },
  settingDescription: { fontSize: 12, color: '#6B7280' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#F9FAFB', marginTop: 24, marginBottom: 6 },
  sectionSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 14 },
  calendarButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 8, gap: 10 },
  calendarEmoji: { fontSize: 22 },
  calendarText: { flex: 1, fontSize: 15, color: '#D1D5DB', fontWeight: '500' },
  calendarArrow: { color: '#6B7280', fontSize: 16 },
});
