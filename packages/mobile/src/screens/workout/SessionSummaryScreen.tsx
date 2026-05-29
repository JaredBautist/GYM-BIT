/**
 * SessionSummaryScreen — resumen de sesión completada con PRs.
 *
 * Muestra: duración, volumen total, ejercicios completados y PRs rotos.
 * Animación/sonido al romper un PR.
 * Sincroniza con backend (o encola si offline).
 *
 * Requirements: 5.4, 5.5
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Vibration,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { getSession } from '../../db/repositories/user.repository';
import { triggerSync } from '../../offline/sync.manager';

export default function SessionSummaryScreen(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId: string;
    totalVolume: string;
    duration: string;
    exercisesCount: string;
  }>();

  const [prs, setPrs] = useState<Array<{ exerciseName: string; weightKg: number; reps: number }>>([]);
  const [syncing, setSyncing] = useState(false);

  const totalVolume = parseFloat(params.totalVolume ?? '0');
  const durationSeconds = parseInt(params.duration ?? '0');
  const exercisesCount = parseInt(params.exercisesCount ?? '0');

  useEffect(() => {
    void syncAndLoadPrs();
  }, []);

  async function syncAndLoadPrs(): Promise<void> {
    setSyncing(true);
    try {
      // Sincronizar con backend (Req 5.4)
      await triggerSync();

      // Cargar PRs rotos en esta sesión
      const session = await getSession();
      if (!session) return;

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/workouts/prs`,
        { headers: { Authorization: `Bearer ${session.accessToken}` } },
      );

      if (res.ok) {
        const data = (await res.json()) as Array<{
          exercise_name: string;
          weight_kg: number;
          reps: number;
          achieved_at: string;
        }>;

        // Filtrar PRs logrados en los últimos 5 minutos (esta sesión)
        const recentPrs = data.filter((pr) => {
          const achievedAt = new Date(pr.achieved_at).getTime();
          return Date.now() - achievedAt < 5 * 60 * 1000;
        });

        setPrs(recentPrs.map((pr) => ({
          exerciseName: pr.exercise_name,
          weightKg: pr.weight_kg,
          reps: pr.reps,
        })));

        // Vibración al romper PRs (Req 5.5)
        if (recentPrs.length > 0) {
          Vibration.vibrate([0, 200, 100, 200, 100, 400]);
        }
      }
    } catch {
      // Sin conexión — los datos se sincronizarán después
    } finally {
      setSyncing(false);
    }
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Título */}
      <Text style={styles.title} accessibilityRole="header">¡Sesión completada! 🎉</Text>

      {/* Estadísticas principales */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard} accessibilityLabel={`Duración: ${formatDuration(durationSeconds)}`}>
          <Text style={styles.statValue}>{formatDuration(durationSeconds)}</Text>
          <Text style={styles.statLabel}>Duración</Text>
        </View>
        <View style={styles.statCard} accessibilityLabel={`Volumen total: ${Math.round(totalVolume)} kilogramos`}>
          <Text style={styles.statValue}>{Math.round(totalVolume)}</Text>
          <Text style={styles.statLabel}>Volumen (kg)</Text>
        </View>
        <View style={styles.statCard} accessibilityLabel={`Ejercicios completados: ${exercisesCount}`}>
          <Text style={styles.statValue}>{exercisesCount}</Text>
          <Text style={styles.statLabel}>Ejercicios</Text>
        </View>
      </View>

      {/* PRs rotos (Req 5.5) */}
      {prs.length > 0 && (
        <View style={styles.prsSection}>
          <Text style={styles.prsTitle}>🏆 ¡Nuevos récords personales!</Text>
          {prs.map((pr, i) => (
            <View key={i} style={styles.prCard} accessibilityLabel={`Nuevo récord en ${pr.exerciseName}: ${pr.weightKg} kg × ${pr.reps} repeticiones`}>
              <Text style={styles.prExercise}>{pr.exerciseName}</Text>
              <Text style={styles.prValue}>{pr.weightKg} kg × {pr.reps} reps</Text>
            </View>
          ))}
        </View>
      )}

      {/* Estado de sincronización */}
      {syncing && (
        <Text style={styles.syncText} accessibilityLiveRegion="polite">
          Sincronizando datos...
        </Text>
      )}

      {/* Botón volver al inicio */}
      <TouchableOpacity
        style={styles.homeButton}
        onPress={() => router.replace('/(tabs)')}
        accessibilityRole="button"
        accessibilityLabel="Volver al inicio"
      >
        <Text style={styles.homeButtonText}>Volver al inicio</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 20, paddingVertical: 40, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: '700', color: '#F9FAFB', textAlign: 'center', marginBottom: 32 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  statCard: { flex: 1, backgroundColor: '#1F2937', borderRadius: 12, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#6366F1', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#6B7280', textAlign: 'center' },
  prsSection: { backgroundColor: '#1E1B4B', borderRadius: 12, padding: 16, marginBottom: 24 },
  prsTitle: { fontSize: 16, fontWeight: '700', color: '#A5B4FC', marginBottom: 12 },
  prCard: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#312E81' },
  prExercise: { fontSize: 14, color: '#D1D5DB', fontWeight: '500' },
  prValue: { fontSize: 14, color: '#6366F1', fontWeight: '700' },
  syncText: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  homeButton: { backgroundColor: '#6366F1', borderRadius: 10, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
  homeButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
