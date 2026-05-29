/**
 * OnboardingScreen — flujo de configuración inicial post-registro.
 *
 * Secuencia: objetivo → datos físicos → nivel de experiencia → días disponibles → equipamiento
 * Guarda progreso parcial en SQLite para retomar si el usuario abandona.
 * Al completar, dispara generación de plan de entrenamiento y plan nutricional.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';

import { getSession, getUserById, upsertUser } from '../../db/repositories/user.repository';
import { dbRun, dbQuery } from '../../db/database';

// ── Types ────────────────────────────────────────────────────────────────────

type Goal = 'LOSE_WEIGHT' | 'GAIN_MUSCLE' | 'GAIN_WEIGHT' | 'MAINTENANCE' | 'ENDURANCE';
type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
type Equipment = 'BARBELL' | 'DUMBBELL' | 'MACHINE' | 'CABLE' | 'BODYWEIGHT';

interface OnboardingData {
  goal: Goal | null;
  heightCm: string;
  weightKg: string;
  birthDate: string;
  gender: 'male' | 'female' | null;
  experienceLevel: ExperienceLevel | null;
  availableDays: number | null;
  equipment: Equipment[];
}

type OnboardingStep = 'goal' | 'physical' | 'experience' | 'days' | 'equipment';

const STEPS: OnboardingStep[] = ['goal', 'physical', 'experience', 'days', 'equipment'];

const STEP_TITLES: Record<OnboardingStep, string> = {
  goal: '¿Cuál es tu objetivo principal?',
  physical: 'Tus datos físicos',
  experience: '¿Cuál es tu nivel de experiencia?',
  days: '¿Cuántos días puedes entrenar por semana?',
  equipment: '¿Qué equipamiento tienes disponible?',
};

const GOALS: Array<{ value: Goal; label: string; emoji: string }> = [
  { value: 'LOSE_WEIGHT', label: 'Perder peso', emoji: '🔥' },
  { value: 'GAIN_MUSCLE', label: 'Ganar músculo', emoji: '💪' },
  { value: 'GAIN_WEIGHT', label: 'Ganar peso', emoji: '⬆️' },
  { value: 'MAINTENANCE', label: 'Mantenerme', emoji: '⚖️' },
  { value: 'ENDURANCE', label: 'Mejorar resistencia', emoji: '🏃' },
];

const EXPERIENCE_LEVELS: Array<{ value: ExperienceLevel; label: string; description: string }> = [
  { value: 'BEGINNER', label: 'Principiante', description: 'Menos de 1 año entrenando' },
  { value: 'INTERMEDIATE', label: 'Intermedio', description: '1–3 años entrenando' },
  { value: 'ADVANCED', label: 'Avanzado', description: 'Más de 3 años entrenando' },
];

const EQUIPMENT_OPTIONS: Array<{ value: Equipment; label: string }> = [
  { value: 'BARBELL', label: 'Barra olímpica' },
  { value: 'DUMBBELL', label: 'Mancuernas' },
  { value: 'MACHINE', label: 'Máquinas' },
  { value: 'CABLE', label: 'Poleas' },
  { value: 'BODYWEIGHT', label: 'Solo peso corporal' },
];

const ONBOARDING_CACHE_KEY = 'onboarding_progress';

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingScreen(): React.JSX.Element {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>('goal');
  const [data, setData] = useState<OnboardingData>({
    goal: null,
    heightCm: '',
    weightKg: '',
    birthDate: '',
    gender: null,
    experienceLevel: null,
    availableDays: null,
    equipment: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar progreso parcial guardado (Req 2.4)
  useEffect(() => {
    loadSavedProgress();
  }, []);

  async function loadSavedProgress(): Promise<void> {
    try {
      const rows = await dbQuery<{ value: string }>(
        'SELECT value FROM users_cache WHERE id = ? LIMIT 1',
        [ONBOARDING_CACHE_KEY],
      );
      if (rows.length > 0) {
        const saved = JSON.parse(rows[0]!.value) as Partial<OnboardingData & { step: OnboardingStep }>;
        if (saved.step) setCurrentStep(saved.step);
        setData((d) => ({ ...d, ...saved }));
      }
    } catch {
      // Sin progreso guardado — empezar desde el inicio
    }
  }

  async function saveProgress(step: OnboardingStep, updatedData: OnboardingData): Promise<void> {
    try {
      const value = JSON.stringify({ ...updatedData, step });
      await dbRun(
        `INSERT INTO users_cache (id, email, name, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
        [ONBOARDING_CACHE_KEY, '', value, Date.now()],
      );
    } catch {
      // Guardar progreso es best-effort
    }
  }

  const stepIndex = STEPS.indexOf(currentStep);
  const isLastStep = currentStep === 'equipment';

  function goNext(): void {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      const nextStep = STEPS[nextIndex]!;
      setCurrentStep(nextStep);
      void saveProgress(nextStep, data);
    }
  }

  function goBack(): void {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]!);
    }
  }

  function toggleEquipment(eq: Equipment): void {
    setData((d) => ({
      ...d,
      equipment: d.equipment.includes(eq)
        ? d.equipment.filter((e) => e !== eq)
        : [...d.equipment, eq],
    }));
  }

  async function handleComplete(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const session = await getSession();
      if (!session) {
        router.replace('/auth/login');
        return;
      }

      // Actualizar perfil en el servidor
      const profileResponse = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          goal: data.goal,
          height_cm: parseFloat(data.heightCm),
          weight_kg: parseFloat(data.weightKg),
          birth_date: data.birthDate,
          gender: data.gender,
          experience_level: data.experienceLevel,
          available_days: data.availableDays,
        }),
      });

      if (!profileResponse.ok) {
        const err = (await profileResponse.json()) as { message?: string };
        setError(err.message ?? 'Error al guardar el perfil.');
        return;
      }

      // Generar plan de entrenamiento (Req 2.2)
      await fetch(`${process.env.EXPO_PUBLIC_API_URL}/workouts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          goal: data.goal,
          experienceLevel: data.experienceLevel,
          availableDays: data.availableDays,
          equipment: data.equipment,
        }),
      });

      // Generar plan nutricional (Req 2.3)
      await fetch(`${process.env.EXPO_PUBLIC_API_URL}/nutrition/plan/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      // Limpiar progreso guardado
      await dbRun('DELETE FROM users_cache WHERE id = ?', [ONBOARDING_CACHE_KEY]);

      router.replace('/(tabs)');
    } catch {
      setError('Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // ── Step renderers ──────────────────────────────────────────────────────────

  function renderGoalStep(): React.JSX.Element {
    return (
      <View style={styles.optionsGrid}>
        {GOALS.map(({ value, label, emoji }) => (
          <TouchableOpacity
            key={value}
            style={[styles.optionCard, data.goal === value && styles.optionCardSelected]}
            onPress={() => setData((d) => ({ ...d, goal: value }))}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected: data.goal === value }}
          >
            <Text style={styles.optionEmoji}>{emoji}</Text>
            <Text style={[styles.optionLabel, data.goal === value && styles.optionLabelSelected]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderPhysicalStep(): React.JSX.Element {
    return (
      <View>
        {[
          { key: 'heightCm', label: 'Altura (cm)', placeholder: '170', keyboard: 'numeric' as const },
          { key: 'weightKg', label: 'Peso (kg)', placeholder: '70', keyboard: 'numeric' as const },
          { key: 'birthDate', label: 'Fecha de nacimiento (YYYY-MM-DD)', placeholder: '1990-01-15', keyboard: 'default' as const },
        ].map(({ key, label, placeholder, keyboard }) => (
          <View key={key} style={styles.inputGroup}>
            <Text style={styles.label} nativeID={`${key}-label`}>{label}</Text>
            <TextInput
              style={styles.input}
              value={data[key as keyof OnboardingData] as string}
              onChangeText={(v) => setData((d) => ({ ...d, [key]: v }))}
              keyboardType={keyboard}
              accessibilityLabel={label}
              accessibilityLabelledBy={`${key}-label`}
              placeholder={placeholder}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        ))}
        <Text style={styles.label}>Género</Text>
        <View style={styles.genderRow}>
          {(['male', 'female'] as const).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.genderButton, data.gender === g && styles.genderButtonSelected]}
              onPress={() => setData((d) => ({ ...d, gender: g }))}
              accessibilityRole="radio"
              accessibilityLabel={g === 'male' ? 'Masculino' : 'Femenino'}
              accessibilityState={{ selected: data.gender === g }}
            >
              <Text style={[styles.genderText, data.gender === g && styles.genderTextSelected]}>
                {g === 'male' ? 'Masculino' : 'Femenino'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  function renderExperienceStep(): React.JSX.Element {
    return (
      <View>
        {EXPERIENCE_LEVELS.map(({ value, label, description }) => (
          <TouchableOpacity
            key={value}
            style={[styles.levelCard, data.experienceLevel === value && styles.levelCardSelected]}
            onPress={() => setData((d) => ({ ...d, experienceLevel: value }))}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${description}`}
            accessibilityState={{ selected: data.experienceLevel === value }}
          >
            <Text style={[styles.levelLabel, data.experienceLevel === value && styles.levelLabelSelected]}>
              {label}
            </Text>
            <Text style={styles.levelDescription}>{description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderDaysStep(): React.JSX.Element {
    return (
      <View style={styles.daysGrid}>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
          <TouchableOpacity
            key={day}
            style={[styles.dayButton, data.availableDays === day && styles.dayButtonSelected]}
            onPress={() => setData((d) => ({ ...d, availableDays: day }))}
            accessibilityRole="radio"
            accessibilityLabel={`${day} día${day > 1 ? 's' : ''} por semana`}
            accessibilityState={{ selected: data.availableDays === day }}
          >
            <Text style={[styles.dayText, data.availableDays === day && styles.dayTextSelected]}>
              {day}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderEquipmentStep(): React.JSX.Element {
    return (
      <View>
        <Text style={styles.equipmentHint}>
          Selecciona todo el equipamiento disponible. Si no tienes nada, deja todo sin seleccionar.
        </Text>
        {EQUIPMENT_OPTIONS.map(({ value, label }) => (
          <TouchableOpacity
            key={value}
            style={[styles.equipmentItem, data.equipment.includes(value) && styles.equipmentItemSelected]}
            onPress={() => toggleEquipment(value)}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked: data.equipment.includes(value) }}
          >
            <View style={[styles.checkbox, data.equipment.includes(value) && styles.checkboxChecked]}>
              {data.equipment.includes(value) && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.equipmentLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 'goal': return data.goal !== null;
      case 'physical': return data.heightCm !== '' && data.weightKg !== '' && data.birthDate !== '' && data.gender !== null;
      case 'experience': return data.experienceLevel !== null;
      case 'days': return data.availableDays !== null;
      case 'equipment': return true; // Equipamiento es opcional (Req 2.5)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        {STEPS.map((step, i) => (
          <View
            key={step}
            style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]}
            accessibilityLabel={`Paso ${i + 1} de ${STEPS.length}`}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle} accessibilityRole="header">
          {STEP_TITLES[currentStep]}
        </Text>

        {error && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {currentStep === 'goal' && renderGoalStep()}
        {currentStep === 'physical' && renderPhysicalStep()}
        {currentStep === 'experience' && renderExperienceStep()}
        {currentStep === 'days' && renderDaysStep()}
        {currentStep === 'equipment' && renderEquipmentStep()}
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.navRow}>
        {stepIndex > 0 && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Paso anterior"
          >
            <Text style={styles.backBtnText}>← Atrás</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled, loading && styles.nextBtnDisabled]}
          onPress={isLastStep ? handleComplete : goNext}
          disabled={!canProceed() || loading}
          accessibilityRole="button"
          accessibilityLabel={isLastStep ? 'Comenzar' : 'Siguiente'}
          accessibilityState={{ disabled: !canProceed() || loading }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.nextBtnText}>{isLastStep ? '¡Comenzar! 🚀' : 'Siguiente →'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  progressBar: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 60, paddingBottom: 16 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#374151' },
  progressDotActive: { backgroundColor: '#6366F1' },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },
  stepTitle: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', marginBottom: 24 },
  errorBanner: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { color: '#991B1B', fontSize: 14 },
  optionsGrid: { gap: 12 },
  optionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', borderWidth: 2, borderColor: '#374151', borderRadius: 12, padding: 16, gap: 12 },
  optionCardSelected: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  optionEmoji: { fontSize: 24 },
  optionLabel: { fontSize: 16, color: '#D1D5DB', fontWeight: '500' },
  optionLabelSelected: { color: '#A5B4FC' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#D1D5DB', marginBottom: 6 },
  input: { backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#F9FAFB', minHeight: 48 },
  genderRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  genderButton: { flex: 1, backgroundColor: '#1F2937', borderWidth: 2, borderColor: '#374151', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  genderButtonSelected: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  genderText: { color: '#D1D5DB', fontSize: 15, fontWeight: '500' },
  genderTextSelected: { color: '#A5B4FC' },
  levelCard: { backgroundColor: '#1F2937', borderWidth: 2, borderColor: '#374151', borderRadius: 12, padding: 16, marginBottom: 12 },
  levelCardSelected: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  levelLabel: { fontSize: 16, fontWeight: '600', color: '#D1D5DB', marginBottom: 4 },
  levelLabelSelected: { color: '#A5B4FC' },
  levelDescription: { fontSize: 13, color: '#6B7280' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  dayButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1F2937', borderWidth: 2, borderColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  dayButtonSelected: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  dayText: { fontSize: 22, fontWeight: '700', color: '#D1D5DB' },
  dayTextSelected: { color: '#A5B4FC' },
  equipmentHint: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  equipmentItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', borderWidth: 2, borderColor: '#374151', borderRadius: 10, padding: 14, marginBottom: 10, gap: 12 },
  equipmentItemSelected: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#6B7280', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  equipmentLabel: { fontSize: 15, color: '#D1D5DB', fontWeight: '500' },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16, gap: 12 },
  backBtn: { paddingVertical: 14, paddingHorizontal: 20 },
  backBtnText: { color: '#6B7280', fontSize: 15 },
  nextBtn: { flex: 1, backgroundColor: '#6366F1', borderRadius: 8, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
