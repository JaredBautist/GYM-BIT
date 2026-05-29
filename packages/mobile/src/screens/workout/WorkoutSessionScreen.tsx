/**
 * WorkoutSessionScreen — pantalla de sesión de entrenamiento activa.
 *
 * - Lista de ejercicios del día con GIFs demostrativos
 * - Temporizador de descanso automático al registrar una serie
 * - Mantiene pantalla encendida (expo-keep-awake)
 * - Registra cada serie con peso, reps y timestamp
 * - Guarda estado en SQLite para reanudar si la app se cierra
 *
 * Requirements: 5.1, 5.2, 5.3, 5.6, 5.7
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Vibration,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { getSession } from '../../db/repositories/user.repository';
import {
  createLocalSession,
  updateLocalSession,
  createLocalSerieLog,
  getActiveSession,
} from '../../db/repositories/workout.repository';
import { writeOffline } from '../../offline/sync.manager';

// ── Types ────────────────────────────────────────────────────────────────────

interface PlanExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroups: string;
  sets: number;
  repsTarget: number;
  restSeconds: number;
  weightKg: number;
  gifUrl: string | null;
  isCompound: boolean;
  supersetGroupId: string | null;
}

interface SerieInput {
  weight: string;
  reps: string;
  done: boolean;
  isPr: boolean;
}

interface ExerciseState {
  exercise: PlanExercise;
  series: SerieInput[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorkoutSessionScreen(): React.JSX.Element {
  const router = useRouter();
  const { planId, dayId } = useLocalSearchParams<{ planId: string; dayId: string }>();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExerciseState[]>([]);
  const [restTimer, setRestTimer] = useState<number>(0);
  const [restActive, setRestActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mantener pantalla encendida (Req 5.1)
  useEffect(() => {
    void activateKeepAwakeAsync();
    return () => { deactivateKeepAwake(); };
  }, []);

  // Temporizador de sesión
  useEffect(() => {
    sessionIntervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    };
  }, []);

  // Cargar ejercicios y reanudar sesión si existe
  useEffect(() => {
    void initSession();
  }, []);

  async function initSession(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) { router.replace('/auth/login'); return; }

      // Verificar si hay sesión activa para reanudar (Req 5.6)
      const activeSession = await getActiveSession(session.userId);

      let sid: string;
      if (activeSession) {
        sid = activeSession.id;
        // Restaurar estado offline si existe
        if (activeSession.offlineState) {
          const state = JSON.parse(activeSession.offlineState) as { elapsedSeconds?: number };
          if (state.elapsedSeconds) setElapsedSeconds(state.elapsedSeconds);
        }
      } else {
        // Crear nueva sesión local
        const newSession = await createLocalSession(session.userId, planId ?? null);
        sid = newSession.id;

        // Encolar en Cola_Offline (Req 5.7)
        await writeOffline(session.userId, 'CREATE', 'session', sid, {
          userId: session.userId,
          planId: planId ?? null,
          startedAt: new Date().toISOString(),
          isActive: true,
        });
      }

      setSessionId(sid);

      // Cargar ejercicios del día desde el servidor o caché
      await loadExercises(session.accessToken, sid);
    } catch (err) {
      console.error('[WorkoutSession] init error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadExercises(accessToken: string, sid: string): Promise<void> {
    try {
      const res = await fetch(
        `${process.env['EXPO_PUBLIC_API_URL']}/workouts/plan`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!res.ok) return;

      const plan = (await res.json()) as {
        days: Array<{
          id: string;
          exercises: PlanExercise[];
        }>;
      };

      const day = plan.days.find((d) => d.id === dayId) ?? plan.days[0];
      if (!day) return;

      const exerciseStates: ExerciseState[] = day.exercises.map((ex) => ({
        exercise: ex,
        series: Array.from({ length: ex.sets }, () => ({
          weight: String(ex.weightKg || ''),
          reps: String(ex.repsTarget),
          done: false,
          isPr: false,
        })),
      }));

      setExercises(exerciseStates);
    } catch {
      // Usar caché local si no hay conexión (Req 5.7)
    }
  }

  // Temporizador de descanso (Req 5.2)
  function startRestTimer(seconds: number): void {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestTimer(seconds);
    setRestActive(true);

    restIntervalRef.current = setInterval(() => {
      setRestTimer((t) => {
        if (t <= 1) {
          clearInterval(restIntervalRef.current!);
          setRestActive(false);
          Vibration.vibrate([0, 300, 100, 300]);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  // Registrar serie (Req 5.3)
  async function handleLogSerie(
    exerciseIndex: number,
    serieIndex: number,
  ): Promise<void> {
    const exState = exercises[exerciseIndex];
    if (!exState || !sessionId) return;

    const serie = exState.series[serieIndex];
    if (!serie || serie.done) return;

    const weight = parseFloat(serie.weight);
    const reps = parseInt(serie.reps);

    if (isNaN(weight) || isNaN(reps) || reps <= 0) {
      Alert.alert('Datos inválidos', 'Ingresa peso y repeticiones válidos.');
      return;
    }

    const session = await getSession();
    if (!session) return;

    // Guardar serie localmente
    const serieLog = await createLocalSerieLog(
      sessionId,
      exState.exercise.exerciseId,
      serieIndex + 1,
      weight,
      reps,
    );

    // Encolar en Cola_Offline (Req 5.7)
    await writeOffline(session.userId, 'CREATE', 'serie_log', serieLog.id, {
      sessionId,
      exerciseId: exState.exercise.exerciseId,
      setNumber: serieIndex + 1,
      weightKg: weight,
      repsDone: reps,
      loggedAt: new Date().toISOString(),
    });

    // Marcar serie como completada
    setExercises((prev) => {
      const updated = [...prev];
      const ex = { ...updated[exerciseIndex]! };
      const series = [...ex.series];
      series[serieIndex] = { ...series[serieIndex]!, done: true };
      ex.series = series;
      updated[exerciseIndex] = ex;
      return updated;
    });

    // Iniciar temporizador de descanso (Req 5.2)
    startRestTimer(exState.exercise.restSeconds);

    // Guardar estado de sesión en SQLite (Req 5.6)
    await updateLocalSession(sessionId, {
      offlineState: JSON.stringify({ elapsedSeconds }),
    });
  }

  // Completar sesión
  async function handleCompleteSession(): Promise<void> {
    const allDone = exercises.every((ex) => ex.series.every((s) => s.done));

    if (!allDone) {
      Alert.alert(
        'Sesión incompleta',
        '¿Deseas terminar la sesión aunque no hayas completado todos los ejercicios?',
        [
          { text: 'Continuar entrenando', style: 'cancel' },
          { text: 'Terminar', style: 'destructive', onPress: () => void doCompleteSession() },
        ],
      );
    } else {
      await doCompleteSession();
    }
  }

  async function doCompleteSession(): Promise<void> {
    if (!sessionId) return;

    const session = await getSession();
    if (!session) return;

    // Calcular volumen total
    let totalVolume = 0;
    for (const ex of exercises) {
      for (const s of ex.series) {
        if (s.done) {
          totalVolume += parseFloat(s.weight || '0') * parseInt(s.reps || '0');
        }
      }
    }

    await updateLocalSession(sessionId, {
      isActive: 0,
      completedAt: Date.now(),
      totalVolumeKg: totalVolume,
      durationSeconds: elapsedSeconds,
    });

    // Encolar actualización en Cola_Offline
    await writeOffline(session.userId, 'UPDATE', 'session', sessionId, {
      completedAt: new Date().toISOString(),
      totalVolumeKg: totalVolume,
      durationSeconds: elapsedSeconds,
      isActive: false,
    });

    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);

    router.replace({
      pathname: '/workout/session-summary',
      params: {
        sessionId,
        totalVolume: String(totalVolume),
        duration: String(elapsedSeconds),
        exercisesCount: String(exercises.length),
      },
    });
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Preparando tu entrenamiento...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header con temporizador de sesión */}
      <View style={styles.header}>
        <Text style={styles.sessionTimer} accessibilityLabel={`Tiempo de sesión: ${formatTime(elapsedSeconds)}`}>
          ⏱ {formatTime(elapsedSeconds)}
        </Text>
        <TouchableOpacity
          style={styles.finishButton}
          onPress={handleCompleteSession}
          accessibilityRole="button"
          accessibilityLabel="Terminar sesión"
        >
          <Text style={styles.finishButtonText}>Terminar</Text>
        </TouchableOpacity>
      </View>

      {/* Temporizador de descanso (Req 5.2) */}
      {restActive && (
        <View style={styles.restBanner} accessibilityLiveRegion="polite" accessibilityLabel={`Descanso: ${restTimer} segundos`}>
          <Text style={styles.restText}>😮‍💨 Descanso: {restTimer}s</Text>
          <TouchableOpacity onPress={() => { setRestActive(false); if (restIntervalRef.current) clearInterval(restIntervalRef.current); }}>
            <Text style={styles.skipRest}>Saltar</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {exercises.map((exState, exIdx) => (
          <View key={exState.exercise.id} style={styles.exerciseCard}>
            {/* GIF demostrativo */}
            {exState.exercise.gifUrl && (
              <Image
                source={{ uri: exState.exercise.gifUrl }}
                style={styles.exerciseGif}
                accessibilityLabel={`Demostración de ${exState.exercise.exerciseName}`}
              />
            )}

            <Text style={styles.exerciseName}>{exState.exercise.exerciseName}</Text>
            <Text style={styles.muscleGroups}>{exState.exercise.muscleGroups}</Text>

            {/* Series */}
            {exState.series.map((serie, sIdx) => (
              <View key={sIdx} style={[styles.serieRow, serie.done && styles.serieRowDone]}>
                <Text style={styles.serieNumber}>Serie {sIdx + 1}</Text>

                <View style={styles.serieInputs}>
                  <TextInput
                    style={[styles.serieInput, serie.done && styles.serieInputDone]}
                    value={serie.weight}
                    onChangeText={(v) => {
                      setExercises((prev) => {
                        const u = [...prev];
                        const ex = { ...u[exIdx]! };
                        const s = [...ex.series];
                        s[sIdx] = { ...s[sIdx]!, weight: v };
                        ex.series = s;
                        u[exIdx] = ex;
                        return u;
                      });
                    }}
                    keyboardType="numeric"
                    editable={!serie.done}
                    accessibilityLabel={`Peso serie ${sIdx + 1}`}
                    placeholder="kg"
                    placeholderTextColor="#6B7280"
                  />
                  <Text style={styles.serieX}>×</Text>
                  <TextInput
                    style={[styles.serieInput, serie.done && styles.serieInputDone]}
                    value={serie.reps}
                    onChangeText={(v) => {
                      setExercises((prev) => {
                        const u = [...prev];
                        const ex = { ...u[exIdx]! };
                        const s = [...ex.series];
                        s[sIdx] = { ...s[sIdx]!, reps: v };
                        ex.series = s;
                        u[exIdx] = ex;
                        return u;
                      });
                    }}
                    keyboardType="numeric"
                    editable={!serie.done}
                    accessibilityLabel={`Repeticiones serie ${sIdx + 1}`}
                    placeholder="reps"
                    placeholderTextColor="#6B7280"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.doneButton, serie.done && styles.doneButtonDone]}
                  onPress={() => void handleLogSerie(exIdx, sIdx)}
                  disabled={serie.done}
                  accessibilityRole="button"
                  accessibilityLabel={serie.done ? 'Serie completada' : `Completar serie ${sIdx + 1}`}
                  accessibilityState={{ disabled: serie.done }}
                >
                  <Text style={styles.doneButtonText}>{serie.done ? '✓' : '○'}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  loadingContainer: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9CA3AF', fontSize: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, backgroundColor: '#1F2937' },
  sessionTimer: { fontSize: 20, fontWeight: '700', color: '#F9FAFB' },
  finishButton: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  finishButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  restBanner: { backgroundColor: '#1E1B4B', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  restText: { color: '#A5B4FC', fontSize: 15, fontWeight: '600' },
  skipRest: { color: '#6366F1', fontSize: 13 },
  content: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 48 },
  exerciseCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 16 },
  exerciseGif: { width: '100%', height: 160, borderRadius: 8, marginBottom: 12, backgroundColor: '#374151' },
  exerciseName: { fontSize: 17, fontWeight: '700', color: '#F9FAFB', marginBottom: 4 },
  muscleGroups: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  serieRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#374151', gap: 8 },
  serieRowDone: { opacity: 0.6 },
  serieNumber: { width: 52, fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  serieInputs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  serieInput: { flex: 1, backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 15, color: '#F9FAFB', textAlign: 'center', minHeight: 36 },
  serieInputDone: { borderColor: '#374151', color: '#6B7280' },
  serieX: { color: '#6B7280', fontSize: 14 },
  doneButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  doneButtonDone: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  doneButtonText: { color: '#F9FAFB', fontSize: 16, fontWeight: '700' },
});
