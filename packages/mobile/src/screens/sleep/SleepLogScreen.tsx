/**
 * SleepLogScreen — registro de sueño con historial semanal.
 *
 * Requirements: 8.1, 8.2
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { VictoryBar, VictoryChart, VictoryAxis, VictoryTheme } from 'victory-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { getSession } from '../../db/repositories/user.repository';
import { createLocalSleepRecord } from '../../db/repositories/sleep.repository';
import { writeOffline } from '../../offline/sync.manager';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface SleepRecord {
  id: string;
  sleepStart: string;
  sleepEnd: string;
  durationMinutes: number;
  qualityStars: number;
  source: string;
}

export default function SleepLogScreen(): React.JSX.Element {
  const [history, setHistory] = useState<SleepRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sleepStart, setSleepStart] = useState<Date>(() => {
    const d = new Date(); d.setHours(22, 0, 0, 0); return d;
  });
  const [sleepEnd, setSleepEnd] = useState<Date>(() => {
    const d = new Date(); d.setHours(6, 0, 0, 0); d.setDate(d.getDate() + 1); return d;
  });
  const [qualityStars, setQualityStars] = useState(4);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => { void loadHistory(); }, []);

  async function loadHistory(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) return;
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/sleep/history`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Array<{
          id: string; sleep_start: string; sleep_end: string;
          duration_minutes: number; quality_stars: number; source: string;
        }>;
        setHistory(data.map((d) => ({
          id: d.id, sleepStart: d.sleep_start, sleepEnd: d.sleep_end,
          durationMinutes: d.duration_minutes, qualityStars: d.quality_stars, source: d.source,
        })));
      }
    } catch { /* sin conexión */ }
    finally { setLoading(false); }
  }

  async function handleSave(): Promise<void> {
    if (sleepEnd <= sleepStart) {
      Alert.alert('Error', 'La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }
    setSaving(true);
    try {
      const session = await getSession();
      if (!session) return;

      const durationMinutes = Math.round((sleepEnd.getTime() - sleepStart.getTime()) / 60000);

      // Guardar localmente
      await createLocalSleepRecord(session.userId, sleepStart.getTime(), sleepEnd.getTime(), durationMinutes, qualityStars);

      // Encolar offline
      const id = `sleep-${Date.now()}`;
      await writeOffline(session.userId, 'CREATE', 'sleep_record', id, {
        userId: session.userId,
        sleepStart: sleepStart.toISOString(),
        sleepEnd: sleepEnd.toISOString(),
        durationMinutes,
        qualityStars,
        source: 'MANUAL',
      });

      await loadHistory();
      Alert.alert('Guardado', `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m registradas.`);
    } catch {
      Alert.alert('Error', 'No se pudo guardar el registro de sueño.');
    } finally {
      setSaving(false);
    }
  }

  // Datos para gráfico de barras semanal
  const weeklyData = history.slice(0, 7).reverse().map((r, i) => ({
    x: i + 1,
    y: Math.round(r.durationMinutes / 60 * 10) / 10,
    label: `${Math.round(r.durationMinutes / 60 * 10) / 10}h`,
  }));

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#6366F1" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">Registro de Sueño</Text>

      {/* Formulario */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Registrar sueño de anoche</Text>

        <View style={styles.timeRow}>
          <View style={styles.timeField}>
            <Text style={styles.timeLabel}>Me dormí</Text>
            <TouchableOpacity
              style={styles.timeButton}
              onPress={() => setShowStartPicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`Hora de inicio: ${sleepStart.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
            >
              <Text style={styles.timeValue}>
                {sleepStart.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.timeSeparator}>→</Text>
          <View style={styles.timeField}>
            <Text style={styles.timeLabel}>Me desperté</Text>
            <TouchableOpacity
              style={styles.timeButton}
              onPress={() => setShowEndPicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`Hora de fin: ${sleepEnd.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
            >
              <Text style={styles.timeValue}>
                {sleepEnd.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {showStartPicker && (
          <DateTimePicker value={sleepStart} mode="time" onChange={(_, d) => { setShowStartPicker(false); if (d) setSleepStart(d); }} />
        )}
        {showEndPicker && (
          <DateTimePicker value={sleepEnd} mode="time" onChange={(_, d) => { setShowEndPicker(false); if (d) setSleepEnd(d); }} />
        )}

        {/* Duración calculada */}
        {sleepEnd > sleepStart && (
          <Text style={styles.duration} accessibilityLabel={`Duración: ${Math.floor((sleepEnd.getTime() - sleepStart.getTime()) / 3600000)}h ${Math.floor(((sleepEnd.getTime() - sleepStart.getTime()) % 3600000) / 60000)}m`}>
            ⏱ {Math.floor((sleepEnd.getTime() - sleepStart.getTime()) / 3600000)}h{' '}
            {Math.floor(((sleepEnd.getTime() - sleepStart.getTime()) % 3600000) / 60000)}m
          </Text>
        )}

        {/* Calidad 1–5 estrellas */}
        <Text style={styles.qualityLabel}>Calidad del sueño</Text>
        <View style={styles.starsRow} accessibilityLabel={`Calidad: ${qualityStars} de 5 estrellas`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setQualityStars(star)}
              accessibilityRole="radio"
              accessibilityLabel={`${star} estrella${star > 1 ? 's' : ''}`}
              accessibilityState={{ selected: qualityStars === star }}
            >
              <Text style={[styles.star, star <= qualityStars && styles.starFilled]}>★</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Guardar registro de sueño"
          accessibilityState={{ disabled: saving, busy: saving }}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      {/* Gráfico semanal */}
      {weeklyData.length > 1 && (
        <View style={styles.chartCard} accessibilityLabel="Gráfico de horas de sueño semanal">
          <Text style={styles.chartTitle}>Últimos 7 días (horas)</Text>
          <VictoryChart width={SCREEN_WIDTH - 40} height={180} theme={VictoryTheme.material}
            padding={{ top: 20, bottom: 30, left: 40, right: 20 }}>
            <VictoryAxis style={{ axis: { stroke: '#374151' }, tickLabels: { fill: '#6B7280', fontSize: 10 } }} tickFormat={() => ''} />
            <VictoryAxis dependentAxis style={{ axis: { stroke: '#374151' }, tickLabels: { fill: '#9CA3AF', fontSize: 10 }, grid: { stroke: '#1F2937' } }} />
            <VictoryBar data={weeklyData} style={{ data: { fill: '#6366F1', width: 20 } }} />
          </VictoryChart>
        </View>
      )}

      {/* Historial */}
      <Text style={styles.historyTitle}>Historial reciente</Text>
      {history.slice(0, 10).map((r) => (
        <View key={r.id} style={styles.historyRow}>
          <View>
            <Text style={styles.historyDate}>
              {new Date(r.sleepStart).toLocaleDateString('es-CO', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Text style={styles.historyDuration}>
              {Math.floor(r.durationMinutes / 60)}h {r.durationMinutes % 60}m
            </Text>
          </View>
          <Text style={styles.historyStars}>{'★'.repeat(r.qualityStars)}{'☆'.repeat(5 - r.qualityStars)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 48 },
  loading: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 20 },
  formCard: { backgroundColor: '#1F2937', borderRadius: 14, padding: 16, marginBottom: 16 },
  formTitle: { fontSize: 15, fontWeight: '600', color: '#D1D5DB', marginBottom: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  timeField: { flex: 1 },
  timeLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  timeButton: { backgroundColor: '#111827', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  timeValue: { fontSize: 18, fontWeight: '700', color: '#F9FAFB' },
  timeSeparator: { color: '#6B7280', fontSize: 18, marginTop: 16 },
  duration: { fontSize: 16, color: '#6366F1', fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  qualityLabel: { fontSize: 13, color: '#9CA3AF', marginBottom: 8 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  star: { fontSize: 32, color: '#374151' },
  starFilled: { color: '#F59E0B' },
  saveButton: { backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 12, alignItems: 'center', minHeight: 44 },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  chartCard: { backgroundColor: '#1F2937', borderRadius: 14, padding: 12, marginBottom: 16 },
  chartTitle: { fontSize: 14, fontWeight: '600', color: '#9CA3AF', marginBottom: 4 },
  historyTitle: { fontSize: 16, fontWeight: '600', color: '#D1D5DB', marginBottom: 12 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  historyDate: { fontSize: 13, color: '#9CA3AF' },
  historyDuration: { fontSize: 16, fontWeight: '600', color: '#F9FAFB' },
  historyStars: { fontSize: 16, color: '#F59E0B' },
});
