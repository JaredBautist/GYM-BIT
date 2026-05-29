/**
 * WeightHistoryScreen — historial de peso con gráfico de evolución (Victory Native).
 *
 * Requirements: 3.3, 3.4
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { getSession } from '../../db/repositories/user.repository';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface WeightEntry {
  id: string;
  weightKg: number;
  recordedAt: string;
}

export default function WeightHistoryScreen(): React.JSX.Element {
  const [history, setHistory] = useState<WeightEntry[]>([]);
  const [newWeight, setNewWeight] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) return;

      const res = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/profile/weight/history`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      if (res.ok) {
        const data = (await res.json()) as Array<{ id: string; weight_kg: number; recorded_at: string }>;
        setHistory(data.map((d) => ({
          id: d.id,
          weightKg: d.weight_kg,
          recordedAt: d.recorded_at,
        })));
      }
    } catch {
      // Usar datos locales si no hay conexión
    } finally {
      setLoading(false);
    }
  }

  async function handleAddWeight(): Promise<void> {
    const w = parseFloat(newWeight);
    if (isNaN(w) || w < 30 || w > 300) {
      setError('El peso debe estar entre 30 y 300 kg.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const session = await getSession();
      if (!session) return;

      const res = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/profile/weight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ weight_kg: w }),
      });

      if (res.ok) {
        setNewWeight('');
        await loadHistory();
        Alert.alert('Peso registrado', `${w} kg registrado correctamente.`);
      } else {
        const err = (await res.json()) as { message?: string };
        setError(err.message ?? 'Error al registrar el peso.');
      }
    } catch {
      setError('Error de conexión.');
    } finally {
      setSaving(false);
    }
  }

  // Preparar datos para el gráfico
  const chartData = history
    .slice()
    .reverse()
    .slice(-30) // últimos 30 registros
    .map((entry, i) => ({
      x: i + 1,
      y: entry.weightKg,
      date: new Date(entry.recordedAt).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }),
    }));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">Historial de peso</Text>

      {/* Registrar nuevo peso */}
      <View style={styles.addCard}>
        <Text style={styles.addTitle}>Registrar peso de hoy</Text>
        {error && (
          <Text style={styles.errorMsg} accessibilityRole="alert">{error}</Text>
        )}
        <View style={styles.addRow}>
          <TextInput
            style={styles.weightInput}
            value={newWeight}
            onChangeText={setNewWeight}
            keyboardType="numeric"
            placeholder="70.5"
            placeholderTextColor="#6B7280"
            accessibilityLabel="Nuevo peso en kilogramos"
          />
          <Text style={styles.kgLabel}>kg</Text>
          <TouchableOpacity
            style={[styles.addButton, saving && styles.addButtonDisabled]}
            onPress={handleAddWeight}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Registrar peso"
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.addButtonText}>Registrar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Gráfico de evolución */}
      {chartData.length > 1 && (
        <View style={styles.chartCard} accessibilityLabel="Gráfico de evolución de peso">
          <Text style={styles.chartTitle}>Evolución (últimos 30 registros)</Text>
          <LineChart
            data={{
              datasets: [{
                data: chartData.map((d) => d.y),
                color: () => '#6366F1',
                strokeWidth: 2,
              }],
            }}
            width={SCREEN_WIDTH - 40}
            height={220}
            chartConfig={{
              backgroundGradientFrom: '#1F2937',
              backgroundGradientTo: '#111827',
              color: () => '#9CA3AF',
              labelColor: () => '#9CA3AF',
              decimalPlaces: 1,
              propsForDots: { r: '4', strokeWidth: '1', stroke: '#6366F1' },
              propsForBackgroundLines: { stroke: '#1F2937' },
              propsForLabels: { fill: '#6B7280', fontSize: 10 },
            }}
            bezier
            withDots
            withInnerLines
            withOuterLines={false}
            withVerticalLines={false}
            withHorizontalLines
            fromZero={false}
            style={{ borderRadius: 8 }}
          />
        </View>
      )}

      {/* Lista de registros */}
      <Text style={styles.listTitle}>Registros recientes</Text>
      {history.length === 0 ? (
        <Text style={styles.emptyText}>No hay registros de peso aún.</Text>
      ) : (
        history.slice(0, 20).map((entry) => (
          <View key={entry.id} style={styles.entryRow}>
            <Text style={styles.entryWeight}>{entry.weightKg} kg</Text>
            <Text style={styles.entryDate}>
              {new Date(entry.recordedAt).toLocaleDateString('es-CO', {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 20, paddingVertical: 24, paddingBottom: 48 },
  loadingContainer: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 20 },
  addCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 20 },
  addTitle: { fontSize: 15, fontWeight: '600', color: '#D1D5DB', marginBottom: 12 },
  errorMsg: { color: '#EF4444', fontSize: 13, marginBottom: 8 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightInput: { flex: 1, backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#F9FAFB', minHeight: 44 },
  kgLabel: { color: '#9CA3AF', fontSize: 15 },
  addButton: { backgroundColor: '#6366F1', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  chartCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 12, marginBottom: 20 },
  chartTitle: { fontSize: 14, fontWeight: '600', color: '#9CA3AF', marginBottom: 8 },
  listTitle: { fontSize: 16, fontWeight: '600', color: '#D1D5DB', marginBottom: 12 },
  emptyText: { color: '#6B7280', fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  entryWeight: { fontSize: 16, fontWeight: '600', color: '#F9FAFB' },
  entryDate: { fontSize: 13, color: '#6B7280' },
});
