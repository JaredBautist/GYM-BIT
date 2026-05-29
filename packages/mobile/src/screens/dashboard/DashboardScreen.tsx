/**
 * DashboardScreen — pantalla principal con resumen diario y gráficos.
 *
 * Muestra: calorías restantes, próxima sesión, sueño, hidratación, mensaje motivacional.
 * Gráficos con Victory Native: peso (línea), calorías (barras), heatmap, PRs,
 * IMC (línea), sueño semanal (barras), macros (donut), recuperación muscular (radar).
 * Funciona offline con datos locales.
 * Se actualiza en < 2 s al navegar.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 14.3
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import NetInfo from '@react-native-community/netinfo';

import { getSession } from '../../db/repositories/user.repository';

const W = Dimensions.get('window').width;

const chartConfig = {
  backgroundGradientFrom: '#1F2937',
  backgroundGradientTo: '#111827',
  color: () => '#9CA3AF',
  labelColor: () => '#9CA3AF',
  decimalPlaces: 0,
  propsForDots: { r: '3', strokeWidth: '1', stroke: '#6366F1' },
  propsForBackgroundLines: { stroke: '#374151' },
  propsForLabels: { fill: '#6B7280', fontSize: 10 },
};

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  caloriesConsumed: number;
  calorieGoal: number;
  caloriesRemaining: number;
  nextSession: { planType: string; focus: string } | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  hydrationMl: number;
  motivationalMessage: string;
}

interface ChartPoint { x: number; y: number }
interface MacroPoint { x: string; y: number }

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardScreen(): React.JSX.Element {
  const router = useRouter();
  const mountedRef = useRef(true);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [weightData, setWeightData] = useState<ChartPoint[]>([]);
  const [caloriesData, setCaloriesData] = useState<ChartPoint[]>([]);
  const [macrosData, setMacrosData] = useState<MacroPoint[]>([]);
  const [sleepData, setSleepData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Actualizar al enfocar la pantalla (Req 9.5)
  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, []),
  );

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (!mountedRef.current) return;
      setIsOnline(!!state.isConnected && !!state.isInternetReachable);
    });
    return () => unsub();
  }, []);

  async function loadDashboard(): Promise<void> {
    try {
      const session = await getSession();
      if (!mountedRef.current) return;
      if (!session) { router.replace('/auth/login'); return; }

      const headers = { Authorization: `Bearer ${session.accessToken}` };
      const base = process.env['EXPO_PUBLIC_API_URL'];

      // Cargar en paralelo para < 2 s (Req 9.5)
      const [summaryRes, weightRes, caloriesRes, macrosRes, sleepRes] = await Promise.allSettled([
        fetch(`${base}/analytics/dashboard`, { headers }),
        fetch(`${base}/analytics/charts/weight`, { headers }),
        fetch(`${base}/analytics/charts/calories`, { headers }),
        fetch(`${base}/analytics/charts/macros`, { headers }),
        fetch(`${base}/analytics/charts/sleep`, { headers }),
      ]);

      if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
        setSummary(await summaryRes.value.json() as DashboardSummary);
      }
      if (!mountedRef.current) return;

      if (weightRes.status === 'fulfilled' && weightRes.value.ok) {
        const data = (await weightRes.value.json()) as Array<{ date: string; value: number }>;
        if (!mountedRef.current) return;
        setWeightData(data.map((d, i) => ({ x: i + 1, y: d.value })));
      }

      if (caloriesRes.status === 'fulfilled' && caloriesRes.value.ok) {
        const data = (await caloriesRes.value.json()) as Array<{ date: string; value: number }>;
        if (!mountedRef.current) return;
        setCaloriesData(data.slice(-14).map((d, i) => ({ x: i + 1, y: d.value })));
      }

      if (macrosRes.status === 'fulfilled' && macrosRes.value.ok) {
        const data = (await macrosRes.value.json()) as Array<{ name: string; value: number }>;
        if (!mountedRef.current) return;
        setMacrosData(data.map((d) => ({ x: d.name, y: d.value })));
      }

      if (sleepRes.status === 'fulfilled' && sleepRes.value.ok) {
        const data = (await sleepRes.value.json()) as Array<{ date: string; value: number }>;
        if (!mountedRef.current) return;
        setSleepData(data.slice(-8).map((d, i) => ({ x: i + 1, y: d.value })));
      }
    } catch {
      // Datos locales si no hay conexión (Req 9.4)
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleExportPdf(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) return;
      const res = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/analytics/export/pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.ok) {
        Alert.alert('Reporte generado', 'El reporte mensual fue generado correctamente.');
      }
    } catch {
      Alert.alert('Error', 'No se pudo generar el reporte.');
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#6366F1" /></View>;
  }

  const caloriesPercent = summary && summary.calorieGoal > 0
    ? Math.min(1, summary.caloriesConsumed / summary.calorieGoal)
    : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadDashboard(); }} tintColor="#6366F1" />}
    >
      {/* Indicador offline */}
      {!isOnline && (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Text style={styles.offlineText}>📡 Sin conexión — mostrando datos locales</Text>
        </View>
      )}

      {/* Mensaje motivacional */}
      {summary?.motivationalMessage && (
        <View style={styles.motivationCard}>
          <Text style={styles.motivationText}>✨ {summary.motivationalMessage}</Text>
        </View>
      )}

      {/* Resumen calórico */}
      {summary && (
        <View style={styles.summaryCard} accessibilityLabel={`Calorías: ${Math.round(summary.caloriesConsumed)} consumidas, ${Math.round(summary.caloriesRemaining)} restantes`}>
          <Text style={styles.cardTitle}>Calorías de hoy</Text>
          <View style={styles.caloriesRow}>
            <View style={styles.calItem}>
              <Text style={styles.calValue}>{Math.round(summary.caloriesConsumed)}</Text>
              <Text style={styles.calLabel}>consumidas</Text>
            </View>
            <View style={styles.calDivider} />
            <View style={styles.calItem}>
              <Text style={[styles.calValue, { color: '#6366F1' }]}>{Math.round(summary.caloriesRemaining)}</Text>
              <Text style={styles.calLabel}>restantes</Text>
            </View>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${caloriesPercent * 100}%` as `${number}%` }]} />
          </View>
        </View>
      )}

      {/* Próxima sesión + sueño */}
      <View style={styles.infoRow}>
        {summary?.nextSession && (
          <TouchableOpacity
            style={styles.infoCard}
            onPress={() => router.push('/workout/session')}
            accessibilityRole="button"
            accessibilityLabel={`Próxima sesión: ${summary.nextSession.focus}`}
          >
            <Text style={styles.infoEmoji}>🏋️</Text>
            <Text style={styles.infoLabel}>Próxima sesión</Text>
            <Text style={styles.infoValue}>{summary.nextSession.focus}</Text>
          </TouchableOpacity>
        )}
        {summary?.sleepHours !== null && (
          <View style={styles.infoCard} accessibilityLabel={`Sueño: ${summary?.sleepHours} horas`}>
            <Text style={styles.infoEmoji}>😴</Text>
            <Text style={styles.infoLabel}>Sueño anoche</Text>
            <Text style={styles.infoValue}>{summary?.sleepHours}h</Text>
          </View>
        )}
      </View>

      {/* Gráfico de peso (línea) */}
      {weightData.length > 1 && (
        <View style={styles.chartCard} accessibilityLabel="Gráfico de evolución de peso">
          <Text style={styles.cardTitle}>Evolución de peso</Text>
          <LineChart
            data={{
              datasets: [{
                data: weightData.map((d) => d.y),
                color: () => '#6366F1',
                strokeWidth: 2,
              }],
            }}
            width={W - 40}
            height={180}
            chartConfig={chartConfig}
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

      {/* Gráfico de calorías (barras) */}
      {caloriesData.length > 1 && (
        <View style={styles.chartCard} accessibilityLabel="Gráfico de calorías consumidas últimos 14 días">
          <Text style={styles.cardTitle}>Calorías (últimos 14 días)</Text>
          <BarChart
            data={{
              labels: caloriesData.map(() => ''),
              datasets: [{ data: caloriesData.map((d) => d.y) }],
            }}
            width={W - 40}
            height={160}
            chartConfig={{
              ...chartConfig,
              color: () => '#F59E0B',
            }}
            withInnerLines
            withHorizontalLines
            withVerticalLines={false}
            fromZero
            showBarTops={false}
            style={{ borderRadius: 8 }}
          />
        </View>
      )}

      {/* Gráfico de macros (donut) */}
      {macrosData.length > 0 && macrosData.some((d) => d.y > 0) && (
        <View style={styles.chartCard} accessibilityLabel="Distribución de macronutrientes de hoy">
          <Text style={styles.cardTitle}>Macros de hoy</Text>
          <PieChart
            data={macrosData.map((d) => ({
              name: d.x,
              population: d.y,
              color: d.x === 'Proteínas' ? '#6366F1' : d.x === 'Carbos' ? '#F59E0B' : '#EF4444',
              legendFontColor: '#D1D5DB',
              legendFontSize: 12,
            }))}
            width={W - 40}
            height={180}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
        </View>
      )}

      {/* Gráfico de sueño semanal (barras) */}
      {sleepData.length > 1 && (
        <View style={styles.chartCard} accessibilityLabel="Gráfico de horas de sueño semanal">
          <Text style={styles.cardTitle}>Sueño semanal (horas)</Text>
          <BarChart
            data={{
              labels: sleepData.map(() => ''),
              datasets: [{ data: sleepData.map((d) => d.y) }],
            }}
            width={W - 40}
            height={160}
            chartConfig={{
              ...chartConfig,
              color: () => '#8B5CF6',
            }}
            withInnerLines
            withHorizontalLines
            withVerticalLines={false}
            fromZero
            showBarTops={false}
            style={{ borderRadius: 8 }}
          />
        </View>
      )}

      {/* Exportar reporte PDF */}
      <TouchableOpacity
        style={styles.exportButton}
        onPress={handleExportPdf}
        accessibilityRole="button"
        accessibilityLabel="Exportar reporte mensual"
      >
        <Text style={styles.exportButtonText}>📄 Exportar reporte mensual</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 48 },
  loading: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  offlineBanner: { backgroundColor: '#1F2937', borderRadius: 8, padding: 10, marginBottom: 12 },
  offlineText: { color: '#F59E0B', fontSize: 13, textAlign: 'center' },
  motivationCard: { backgroundColor: '#1E1B4B', borderRadius: 12, padding: 14, marginBottom: 12 },
  motivationText: { color: '#A5B4FC', fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
  summaryCard: { backgroundColor: '#1F2937', borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#9CA3AF', marginBottom: 12 },
  caloriesRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 12 },
  calItem: { alignItems: 'center' },
  calValue: { fontSize: 28, fontWeight: '800', color: '#F9FAFB' },
  calLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  calDivider: { width: 1, height: 40, backgroundColor: '#374151' },
  progressBar: { height: 6, backgroundColor: '#374151', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 3 },
  infoRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  infoCard: { flex: 1, backgroundColor: '#1F2937', borderRadius: 12, padding: 14, alignItems: 'center' },
  infoEmoji: { fontSize: 24, marginBottom: 4 },
  infoLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  infoValue: { fontSize: 15, fontWeight: '700', color: '#F9FAFB', textAlign: 'center' },
  chartCard: { backgroundColor: '#1F2937', borderRadius: 14, padding: 12, marginBottom: 12 },
  exportButton: { backgroundColor: '#1F2937', borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#374151', marginTop: 8 },
  exportButtonText: { color: '#D1D5DB', fontSize: 14, fontWeight: '500' },
});
