/**
 * DashboardPage — versión web del dashboard con Recharts.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 14.3
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

import { useAuth } from '../hooks/useAuth.js';

interface DashboardSummary {
  caloriesConsumed: number;
  calorieGoal: number;
  caloriesRemaining: number;
  nextSession: { planType: string; focus: string } | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  motivationalMessage: string;
}

const MACRO_COLORS = ['#6366F1', '#F59E0B', '#EF4444'];

export default function DashboardPage(): React.JSX.Element {
  const { session } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [weightData, setWeightData] = useState<Array<{ date: string; value: number }>>([]);
  const [caloriesData, setCaloriesData] = useState<Array<{ date: string; value: number; goal: number }>>([]);
  const [macrosData, setMacrosData] = useState<Array<{ name: string; value: number }>>([]);
  const [sleepData, setSleepData] = useState<Array<{ date: string; value: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session) void loadDashboard();
  }, [session]);

  async function loadDashboard(): Promise<void> {
    if (!session) return;
    const h = { Authorization: `Bearer ${session.accessToken}` };
    const base = import.meta.env.VITE_API_URL as string;

    try {
      const [s, w, c, m, sl] = await Promise.allSettled([
        fetch(`${base}/analytics/dashboard`, { headers: h }),
        fetch(`${base}/analytics/charts/weight`, { headers: h }),
        fetch(`${base}/analytics/charts/calories`, { headers: h }),
        fetch(`${base}/analytics/charts/macros`, { headers: h }),
        fetch(`${base}/analytics/charts/sleep`, { headers: h }),
      ]);

      if (s.status === 'fulfilled' && s.value.ok) setSummary(await s.value.json() as DashboardSummary);
      if (w.status === 'fulfilled' && w.value.ok) setWeightData(await w.value.json() as typeof weightData);
      if (c.status === 'fulfilled' && c.value.ok) {
        const raw = (await c.value.json()) as Array<{ date: string; value: number; label?: string }>;
        setCaloriesData(raw.map((d) => ({ date: d.date, value: d.value, goal: parseInt(d.label ?? '0') })));
      }
      if (m.status === 'fulfilled' && m.value.ok) setMacrosData(await m.value.json() as typeof macrosData);
      if (sl.status === 'fulfilled' && sl.value.ok) setSleepData(await sl.value.json() as typeof sleepData);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPdf(): Promise<void> {
    if (!session) return;
    await fetch(`${import.meta.env.VITE_API_URL}/analytics/export/pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    alert('Reporte generado correctamente.');
  }

  if (loading) {
    return (
      <div style={styles.loading} role="status" aria-label="Cargando dashboard">
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Cargando tu dashboard...</p>
      </div>
    );
  }

  const caloriesPercent = summary && summary.calorieGoal > 0
    ? Math.min(100, (summary.caloriesConsumed / summary.calorieGoal) * 100)
    : 0;

  return (
    <main style={styles.container}>
      <h1 style={styles.pageTitle}>Dashboard</h1>

      {/* Mensaje motivacional */}
      {summary?.motivationalMessage && (
        <div style={styles.motivationCard} role="note" aria-label="Mensaje motivacional">
          <p style={styles.motivationText}>✨ {summary.motivationalMessage}</p>
        </div>
      )}

      {/* Resumen diario */}
      {summary && (
        <section style={styles.summaryGrid} aria-label="Resumen del día">
          <div style={styles.summaryCard} aria-label={`Calorías consumidas: ${Math.round(summary.caloriesConsumed)}`}>
            <p style={styles.summaryValue}>{Math.round(summary.caloriesConsumed)}</p>
            <p style={styles.summaryLabel}>kcal consumidas</p>
          </div>
          <div style={styles.summaryCard} aria-label={`Calorías restantes: ${Math.round(summary.caloriesRemaining)}`}>
            <p style={{ ...styles.summaryValue, color: '#6366F1' }}>{Math.round(summary.caloriesRemaining)}</p>
            <p style={styles.summaryLabel}>kcal restantes</p>
          </div>
          {summary.nextSession && (
            <div style={styles.summaryCard} aria-label={`Próxima sesión: ${summary.nextSession.focus}`}>
              <p style={styles.summaryValue}>💪</p>
              <p style={styles.summaryLabel}>{summary.nextSession.focus}</p>
            </div>
          )}
          {summary.sleepHours !== null && (
            <div style={styles.summaryCard} aria-label={`Sueño: ${summary.sleepHours} horas`}>
              <p style={styles.summaryValue}>{summary.sleepHours}h</p>
              <p style={styles.summaryLabel}>sueño anoche</p>
            </div>
          )}
        </section>
      )}

      {/* Barra de progreso calórico */}
      {summary && (
        <div style={styles.progressContainer} role="progressbar" aria-valuenow={caloriesPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${Math.round(caloriesPercent)}% del objetivo calórico`}>
          <div style={{ ...styles.progressFill, width: `${caloriesPercent}%` }} />
        </div>
      )}

      {/* Gráfico de peso (línea) */}
      {weightData.length > 1 && (
        <section style={styles.chartSection} aria-label="Gráfico de evolución de peso">
          <h2 style={styles.chartTitle}>Evolución de peso</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={weightData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, color: '#F9FAFB' }} />
              <Line type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={2} dot={{ fill: '#6366F1', r: 3 }} name="Peso (kg)" />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Gráfico de calorías (barras) */}
      {caloriesData.length > 1 && (
        <section style={styles.chartSection} aria-label="Gráfico de calorías consumidas vs objetivo">
          <h2 style={styles.chartTitle}>Calorías consumidas vs objetivo</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={caloriesData.slice(-14)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, color: '#F9FAFB' }} />
              <Bar dataKey="value" fill="#F59E0B" name="Consumidas" radius={[4, 4, 0, 0]} />
              <Bar dataKey="goal" fill="#374151" name="Objetivo" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Gráfico de macros (donut) */}
      {macrosData.length > 0 && macrosData.some((d) => d.value > 0) && (
        <section style={styles.chartSection} aria-label="Distribución de macronutrientes">
          <h2 style={styles.chartTitle}>Macros de hoy</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={macrosData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${Math.round(value as number)}g`} labelLine={false}>
                {macrosData.map((_, i) => (
                  <Cell key={i} fill={MACRO_COLORS[i % MACRO_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, color: '#F9FAFB' }} />
              <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 13 }} />
            </PieChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Gráfico de sueño semanal (barras) */}
      {sleepData.length > 1 && (
        <section style={styles.chartSection} aria-label="Gráfico de horas de sueño semanal">
          <h2 style={styles.chartTitle}>Sueño semanal (horas)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sleepData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: 8, color: '#F9FAFB' }} />
              <Bar dataKey="value" fill="#8B5CF6" name="Horas" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Exportar PDF */}
      <button
        style={styles.exportButton}
        onClick={() => void handleExportPdf()}
        aria-label="Exportar reporte mensual en PDF"
      >
        📄 Exportar reporte mensual
      </button>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 900, margin: '0 auto', padding: '24px 16px 48px', backgroundColor: '#111827', minHeight: '100vh', color: '#F9FAFB' },
  pageTitle: { fontSize: 28, fontWeight: 700, marginBottom: 20 },
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' },
  spinner: { width: 40, height: 40, border: '3px solid #374151', borderTopColor: '#6366F1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText: { color: '#9CA3AF', marginTop: 12 },
  motivationCard: { backgroundColor: '#1E1B4B', borderRadius: 12, padding: '12px 16px', marginBottom: 16 },
  motivationText: { color: '#A5B4FC', fontStyle: 'italic', margin: 0 },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 },
  summaryCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, textAlign: 'center' },
  summaryValue: { fontSize: 28, fontWeight: 800, margin: '0 0 4px', color: '#F9FAFB' },
  summaryLabel: { fontSize: 12, color: '#6B7280', margin: 0 },
  progressContainer: { height: 6, backgroundColor: '#374151', borderRadius: 3, overflow: 'hidden', marginBottom: 24 },
  progressFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 3, transition: 'width 0.3s ease' },
  chartSection: { backgroundColor: '#1F2937', borderRadius: 14, padding: '16px 12px', marginBottom: 16 },
  chartTitle: { fontSize: 15, fontWeight: 600, color: '#9CA3AF', marginTop: 0, marginBottom: 12 },
  exportButton: { width: '100%', backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 10, padding: '14px 0', color: '#D1D5DB', fontSize: 15, cursor: 'pointer', marginTop: 8 },
};
