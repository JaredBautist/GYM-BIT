/**
 * WearablesScreen — estado de conexión y gestión de wearables.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';

import { getSession } from '../../db/repositories/user.repository';

interface WearableConnection {
  provider: string;
  isActive: boolean;
  lastSyncAt: string | null;
  consecutiveFailures: number;
}

const PROVIDER_LABELS: Record<string, { name: string; emoji: string }> = {
  healthkit: { name: 'Apple Watch (HealthKit)', emoji: '⌚' },
  garmin: { name: 'Garmin Connect', emoji: '🏃' },
  google_fit: { name: 'Google Fit (Wear OS)', emoji: '📱' },
};

export default function WearablesScreen(): React.JSX.Element {
  const [connections, setConnections] = useState<WearableConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => { void loadStatus(); }, []);

  async function loadStatus(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) return;
      const res = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/wearables/status`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Array<{
          provider: string; is_active: boolean; last_sync_at: string | null; consecutive_failures: number;
        }>;
        setConnections(data.map((d) => ({
          provider: d.provider, isActive: !!d.is_active,
          lastSyncAt: d.last_sync_at, consecutiveFailures: d.consecutive_failures,
        })));
      }
    } catch { /* sin conexión */ }
    finally { setLoading(false); }
  }

  async function handleSync(provider: string): Promise<void> {
    setSyncing(provider);
    try {
      const session = await getSession();
      if (!session) return;
      const res = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/wearables/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ provider, records: [] }),
      });
      if (res.ok) {
        await loadStatus();
        Alert.alert('Sincronizado', `${PROVIDER_LABELS[provider]?.name ?? provider} sincronizado correctamente.`);
      }
    } catch {
      Alert.alert('Error', 'No se pudo sincronizar el dispositivo.');
    } finally {
      setSyncing(null);
    }
  }

  async function handleDisconnect(provider: string): Promise<void> {
    Alert.alert(
      'Desconectar',
      `¿Deseas desconectar ${PROVIDER_LABELS[provider]?.name ?? provider}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar', style: 'destructive',
          onPress: async () => {
            const session = await getSession();
            if (!session) return;
            await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/wearables/disconnect/${provider}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${session.accessToken}` },
            });
            await loadStatus();
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#6366F1" /></View>;
  }

  const allProviders = ['healthkit', 'garmin', 'google_fit'];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">Wearables</Text>
      <Text style={styles.subtitle}>GymBit funciona sin wearables. Conéctalos para enriquecer tu seguimiento.</Text>

      {allProviders.map((provider) => {
        const conn = connections.find((c) => c.provider === provider);
        const info = PROVIDER_LABELS[provider]!;
        const isConnected = conn?.isActive ?? false;

        return (
          <View key={provider} style={styles.providerCard} accessibilityLabel={`${info.name}: ${isConnected ? 'conectado' : 'no conectado'}`}>
            <View style={styles.providerHeader}>
              <Text style={styles.providerEmoji}>{info.emoji}</Text>
              <View style={styles.providerInfo}>
                <Text style={styles.providerName}>{info.name}</Text>
                <View style={[styles.statusBadge, isConnected ? styles.statusConnected : styles.statusDisconnected]}>
                  <Text style={styles.statusText}>{isConnected ? 'Conectado' : 'No conectado'}</Text>
                </View>
              </View>
            </View>

            {isConnected && conn?.lastSyncAt && (
              <Text style={styles.lastSync}>
                Última sync: {new Date(conn.lastSyncAt).toLocaleString('es-CO')}
              </Text>
            )}

            {isConnected && (conn?.consecutiveFailures ?? 0) >= 3 && (
              <Text style={styles.failureWarning} accessibilityRole="alert">
                ⚠️ {conn!.consecutiveFailures} fallos consecutivos de sincronización
              </Text>
            )}

            <View style={styles.providerActions}>
              {isConnected ? (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.syncBtn]}
                    onPress={() => void handleSync(provider)}
                    disabled={syncing === provider}
                    accessibilityRole="button"
                    accessibilityLabel={`Sincronizar ${info.name}`}
                    accessibilityState={{ busy: syncing === provider }}
                  >
                    {syncing === provider
                      ? <ActivityIndicator color="#FFFFFF" size="small" />
                      : <Text style={styles.actionBtnText}>🔄 Sincronizar</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.disconnectBtn]}
                    onPress={() => void handleDisconnect(provider)}
                    accessibilityRole="button"
                    accessibilityLabel={`Desconectar ${info.name}`}
                  >
                    <Text style={styles.disconnectBtnText}>Desconectar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.connectBtn]}
                  onPress={() => Alert.alert('Conectar', `Para conectar ${info.name}, sigue las instrucciones en la app del dispositivo.`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Conectar ${info.name}`}
                >
                  <Text style={styles.actionBtnText}>Conectar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 48 },
  loading: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 20 },
  providerCard: { backgroundColor: '#1F2937', borderRadius: 14, padding: 16, marginBottom: 12 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  providerEmoji: { fontSize: 28 },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 15, fontWeight: '600', color: '#F9FAFB', marginBottom: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusConnected: { backgroundColor: '#064E3B' },
  statusDisconnected: { backgroundColor: '#374151' },
  statusText: { fontSize: 11, fontWeight: '600', color: '#D1D5DB' },
  lastSync: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  failureWarning: { fontSize: 12, color: '#F59E0B', marginBottom: 8 },
  providerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', minHeight: 36 },
  syncBtn: { backgroundColor: '#6366F1' },
  connectBtn: { backgroundColor: '#6366F1' },
  disconnectBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444' },
  actionBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  disconnectBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
});
