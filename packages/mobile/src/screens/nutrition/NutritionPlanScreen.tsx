/**
 * NutritionPlanScreen — plan nutricional activo con distribución de macros.
 * RecipesScreen — ver y crear recetas con ingredientes.
 *
 * Requirements: 6.5, 6.6, 7.1, 7.2, 7.3
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { VictoryPie } from 'victory-native';

import { getSession } from '../../db/repositories/user.repository';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface NutritionPlan {
  calorieGoal: number;
  proteinGoalG: number;
  carbsGoalG: number;
  fatGoalG: number;
  generatedAt: string;
}

export default function NutritionPlanScreen(): React.JSX.Element {
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void loadPlan();
  }, []);

  async function loadPlan(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) return;

      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/nutrition/plan`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          calorie_goal: number; protein_goal_g: number;
          carbs_goal_g: number; fat_goal_g: number; generated_at: string;
        };
        setPlan({
          calorieGoal: data.calorie_goal,
          proteinGoalG: data.protein_goal_g,
          carbsGoalG: data.carbs_goal_g,
          fatGoalG: data.fat_goal_g,
          generatedAt: data.generated_at,
        });
      }
    } catch {
      // Sin conexión
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePlan(): Promise<void> {
    setGenerating(true);
    try {
      const session = await getSession();
      if (!session) return;

      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/nutrition/plan/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      if (res.ok) {
        await loadPlan();
      }
    } catch {
      // Error de conexión
    } finally {
      setGenerating(false);
    }
  }

  // Datos para el gráfico donut de macros
  const macroData = plan
    ? [
        { x: 'Proteínas', y: plan.proteinGoalG * 4, label: `${plan.proteinGoalG}g`, color: '#6366F1' },
        { x: 'Carbos', y: plan.carbsGoalG * 4, label: `${plan.carbsGoalG}g`, color: '#F59E0B' },
        { x: 'Grasas', y: plan.fatGoalG * 9, label: `${plan.fatGoalG}g`, color: '#EF4444' },
      ]
    : [];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">Plan Nutricional</Text>

      {plan ? (
        <>
          {/* Objetivo calórico */}
          <View style={styles.calorieCard} accessibilityLabel={`Objetivo calórico: ${plan.calorieGoal} calorías`}>
            <Text style={styles.calorieValue}>{plan.calorieGoal}</Text>
            <Text style={styles.calorieLabel}>kcal / día</Text>
          </View>

          {/* Gráfico donut de macros (Victory Native) */}
          <View style={styles.chartCard} accessibilityLabel="Distribución de macronutrientes">
            <Text style={styles.chartTitle}>Distribución de macros</Text>
            <VictoryPie
              data={macroData}
              width={SCREEN_WIDTH - 40}
              height={220}
              colorScale={macroData.map((d) => d.color)}
              innerRadius={60}
              labelRadius={90}
              style={{
                labels: { fill: '#D1D5DB', fontSize: 12, fontWeight: '600' },
              }}
              padding={{ top: 10, bottom: 10, left: 20, right: 20 }}
            />
            {/* Leyenda */}
            <View style={styles.legend}>
              {[
                { label: 'Proteínas', value: plan.proteinGoalG, color: '#6366F1', kcal: plan.proteinGoalG * 4 },
                { label: 'Carbohidratos', value: plan.carbsGoalG, color: '#F59E0B', kcal: plan.carbsGoalG * 4 },
                { label: 'Grasas', value: plan.fatGoalG, color: '#EF4444', kcal: plan.fatGoalG * 9 },
              ].map(({ label, value, color, kcal }) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendLabel}>{label}</Text>
                  <Text style={styles.legendValue}>{value}g ({kcal} kcal)</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.generatedAt}>
            Generado: {new Date(plan.generatedAt).toLocaleDateString('es-CO')}
          </Text>
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No tienes un plan nutricional activo.</Text>
          <Text style={styles.emptySubtext}>Completa tu perfil para generar uno personalizado.</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.generateButton, generating && styles.generateButtonDisabled]}
        onPress={handleGeneratePlan}
        disabled={generating}
        accessibilityRole="button"
        accessibilityLabel="Generar nuevo plan nutricional"
        accessibilityState={{ disabled: generating, busy: generating }}
      >
        {generating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.generateButtonText}>
            {plan ? '🔄 Regenerar plan' : '✨ Generar plan'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 20, paddingVertical: 24, paddingBottom: 48 },
  loadingContainer: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 20 },
  calorieCard: { backgroundColor: '#1E1B4B', borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 16 },
  calorieValue: { fontSize: 48, fontWeight: '800', color: '#6366F1' },
  calorieLabel: { fontSize: 16, color: '#A5B4FC', marginTop: 4 },
  chartCard: { backgroundColor: '#1F2937', borderRadius: 14, padding: 16, marginBottom: 16 },
  chartTitle: { fontSize: 15, fontWeight: '600', color: '#D1D5DB', marginBottom: 8 },
  legend: { gap: 8, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, color: '#9CA3AF' },
  legendValue: { fontSize: 13, color: '#D1D5DB', fontWeight: '600' },
  generatedAt: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 16 },
  emptyCard: { backgroundColor: '#1F2937', borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 16, color: '#D1D5DB', textAlign: 'center', marginBottom: 8 },
  emptySubtext: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  generateButton: { backgroundColor: '#6366F1', borderRadius: 10, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
  generateButtonDisabled: { opacity: 0.5 },
  generateButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
