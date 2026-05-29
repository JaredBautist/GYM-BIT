/**
 * Tab de entrenamiento — muestra el plan activo del día.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';

import { getSession } from '../../src/db/repositories/user.repository';
import { getActivePlan } from '../../src/db/repositories/workout.repository';

export default function WorkoutTab() {
  const router = useRouter();
  const [plan, setPlan] = useState<{ planType: string; days: Array<{ id: string; dayOfWeek: number; focus: string; exercises: Array<{ exerciseName: string | null; sets: number; repsTarget: number }> }> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadPlan();
  }, []);

  async function loadPlan() {
    try {
      const session = await getSession();
      if (!session) return;

      // Intentar desde servidor
      const res = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/workouts/plan`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      if (res.ok) {
        const data = await res.json() as {
          plan_type: string;
          days: Array<{ id: string; day_of_week: number; focus: string; exercises: Array<{ exercise_name: string; sets: number; reps_target: number }> }>;
        };
        setPlan({
          planType: data.plan_type,
          days: data.days.map(d => ({
            id: d.id,
            dayOfWeek: d.day_of_week,
            focus: d.focus,
            exercises: d.exercises.map(e => ({
              exerciseName: e.exercise_name,
              sets: e.sets,
              repsTarget: e.reps_target,
            })),
          })),
        });
      } else {
        // Caché local
        const local = await getActivePlan(session.userId);
        if (local) {
          setPlan({
            planType: local.plan.planType,
            days: local.days.map(d => ({
              id: d.id,
              dayOfWeek: d.dayOfWeek,
              focus: d.focus,
              exercises: d.exercises.map(e => ({
                exerciseName: e.exerciseName,
                sets: e.sets,
                repsTarget: e.repsTarget,
              })),
            })),
          });
        }
      }
    } catch {
      // Sin conexión — usar caché
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().getDay(); // 0=Dom, 1=Lun...
  const todayDay = plan?.days.find(d => d.dayOfWeek === today) ?? plan?.days[0];

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#6366F1" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">Entrenamiento</Text>

      {!plan ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>💪</Text>
          <Text style={styles.emptyTitle}>Sin plan activo</Text>
          <Text style={styles.emptyText}>Completa el onboarding para generar tu plan personalizado.</Text>
          <TouchableOpacity
            style={styles.generateBtn}
            onPress={() => router.push('/onboarding')}
            accessibilityRole="button"
            accessibilityLabel="Ir al onboarding"
          >
            <Text style={styles.generateBtnText}>Crear mi plan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Plan badge */}
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{plan.planType.replace('_', ' ')}</Text>
          </View>

          {/* Sesión de hoy */}
          {todayDay && (
            <View style={styles.todayCard}>
              <Text style={styles.todayLabel}>Hoy — {todayDay.focus}</Text>
              <Text style={styles.exerciseCount}>{todayDay.exercises.length} ejercicios</Text>

              {todayDay.exercises.slice(0, 4).map((ex, i) => (
                <View key={i} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{ex.exerciseName ?? 'Ejercicio'}</Text>
                  <Text style={styles.exerciseSets}>{ex.sets} × {ex.repsTarget}</Text>
                </View>
              ))}

              {todayDay.exercises.length > 4 && (
                <Text style={styles.moreExercises}>+{todayDay.exercises.length - 4} más...</Text>
              )}

              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => router.push({ pathname: '/workout/session', params: { planId: plan ? 'active' : '', dayId: todayDay.id } })}
                accessibilityRole="button"
                accessibilityLabel="Iniciar sesión de entrenamiento"
              >
                <Text style={styles.startBtnText}>▶ Iniciar sesión</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Todos los días del plan */}
          <Text style={styles.sectionTitle}>Plan completo</Text>
          {plan.days.map((day) => (
            <View key={day.id} style={[styles.dayRow, day.id === todayDay?.id && styles.dayRowToday]}>
              <Text style={styles.dayFocus}>{day.focus}</Text>
              <Text style={styles.dayExercises}>{day.exercises.length} ejercicios</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 48 },
  loading: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#F9FAFB', marginBottom: 20 },
  emptyCard: { backgroundColor: '#1F2937', borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F9FAFB', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  generateBtn: { backgroundColor: '#6366F1', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  generateBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  planBadge: { backgroundColor: '#1E1B4B', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 16 },
  planBadgeText: { color: '#A5B4FC', fontSize: 13, fontWeight: '600' },
  todayCard: { backgroundColor: '#1F2937', borderRadius: 16, padding: 16, marginBottom: 20 },
  todayLabel: { fontSize: 18, fontWeight: '700', color: '#F9FAFB', marginBottom: 4 },
  exerciseCount: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#374151' },
  exerciseName: { fontSize: 14, color: '#D1D5DB', flex: 1 },
  exerciseSets: { fontSize: 14, color: '#6366F1', fontWeight: '600' },
  moreExercises: { fontSize: 13, color: '#6B7280', marginTop: 8 },
  startBtn: { backgroundColor: '#6366F1', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 16, minHeight: 48 },
  startBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#9CA3AF', marginBottom: 10 },
  dayRow: { backgroundColor: '#1F2937', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  dayRowToday: { borderWidth: 1.5, borderColor: '#6366F1' },
  dayFocus: { fontSize: 15, color: '#D1D5DB', fontWeight: '500' },
  dayExercises: { fontSize: 13, color: '#6B7280' },
});
