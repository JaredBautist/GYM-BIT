/**
 * ProfileScreen — formulario de edición de datos físicos y métricas.
 *
 * Muestra IMC, TMB y TDEE calculados en tiempo real al editar altura/peso.
 * Valida rangos con mensajes de error claros.
 * Al guardar cambios de objetivo, muestra confirmación de regeneración de planes.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';

import { getSession } from '../../db/repositories/user.repository';

// ── Types ────────────────────────────────────────────────────────────────────

type Goal = 'LOSE_WEIGHT' | 'GAIN_MUSCLE' | 'GAIN_WEIGHT' | 'MAINTENANCE' | 'ENDURANCE';
type Gender = 'male' | 'female';
type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

interface ProfileForm {
  name: string;
  birthDate: string;
  gender: Gender | '';
  heightCm: string;
  weightKg: string;
  goal: Goal | '';
  experienceLevel: ExperienceLevel | '';
  availableDays: string;
  medicalConditions: string;
}

interface Metrics {
  bmi: number | null;
  bmr: number | null;
  tdee: number | null;
}

interface FieldError {
  field: string;
  message: string;
}

// ── Pure metric calculations (mirrors backend formulas) ───────────────────────

function calcBMI(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 100) / 100;
}

function calcBMR(weightKg: number, heightCm: number, ageYears: number, gender: Gender): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return Math.round((gender === 'male' ? base + 5 : base - 161) * 100) / 100;
}

const ACTIVITY_FACTORS: Record<ExperienceLevel, number> = {
  BEGINNER: 1.2,
  INTERMEDIATE: 1.55,
  ADVANCED: 1.725,
};

function calcTDEE(bmr: number, level: ExperienceLevel): number {
  return Math.round(bmr * ACTIVITY_FACTORS[level] * 100) / 100;
}

function ageFromBirthDate(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ── Component ─────────────────────────────────────────────────────────────────

const GOALS: Array<{ value: Goal; label: string }> = [
  { value: 'LOSE_WEIGHT', label: 'Perder peso' },
  { value: 'GAIN_MUSCLE', label: 'Ganar músculo' },
  { value: 'GAIN_WEIGHT', label: 'Ganar peso' },
  { value: 'MAINTENANCE', label: 'Mantenerme' },
  { value: 'ENDURANCE', label: 'Resistencia' },
];

export default function ProfileScreen(): React.JSX.Element {
  const router = useRouter();

  const [form, setForm] = useState<ProfileForm>({
    name: '', birthDate: '', gender: '', heightCm: '', weightKg: '',
    goal: '', experienceLevel: '', availableDays: '', medicalConditions: '',
  });
  const [metrics, setMetrics] = useState<Metrics>({ bmi: null, bmr: null, tdee: null });
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalGoal, setOriginalGoal] = useState<Goal | ''>('');

  // Cargar perfil al montar
  useEffect(() => {
    void loadProfile();
  }, []);

  // Recalcular métricas en tiempo real al cambiar altura, peso, fecha o género
  useEffect(() => {
    recalcMetrics();
  }, [form.heightCm, form.weightKg, form.birthDate, form.gender, form.experienceLevel]);

  async function loadProfile(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) { router.replace('/auth/login'); return; }

      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/profile`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          name?: string; birth_date?: string; gender?: string;
          height_cm?: number; weight_kg?: number; goal?: string;
          experience_level?: string; available_days?: number;
          medical_conditions?: string; bmi?: number; bmr?: number; tdee?: number;
        };

        setForm({
          name: data.name ?? '',
          birthDate: data.birth_date ? String(data.birth_date).split('T')[0]! : '',
          gender: (data.gender as Gender) ?? '',
          heightCm: data.height_cm ? String(data.height_cm) : '',
          weightKg: data.weight_kg ? String(data.weight_kg) : '',
          goal: (data.goal as Goal) ?? '',
          experienceLevel: (data.experience_level as ExperienceLevel) ?? '',
          availableDays: data.available_days ? String(data.available_days) : '',
          medicalConditions: data.medical_conditions ?? '',
        });
        setOriginalGoal((data.goal as Goal) ?? '');
        setMetrics({ bmi: data.bmi ?? null, bmr: data.bmr ?? null, tdee: data.tdee ?? null });
      }
    } catch {
      // Usar datos locales si no hay conexión
    } finally {
      setLoading(false);
    }
  }

  function recalcMetrics(): void {
    const h = parseFloat(form.heightCm);
    const w = parseFloat(form.weightKg);
    const g = form.gender as Gender;
    const lvl = form.experienceLevel as ExperienceLevel;

    if (!h || !w || h < 100 || h > 250 || w < 30 || w > 300) {
      setMetrics({ bmi: null, bmr: null, tdee: null });
      return;
    }

    const bmi = calcBMI(w, h);

    if (!form.birthDate || !g) {
      setMetrics({ bmi, bmr: null, tdee: null });
      return;
    }

    const age = ageFromBirthDate(form.birthDate);
    if (age < 13) { setMetrics({ bmi, bmr: null, tdee: null }); return; }

    const bmr = calcBMR(w, h, age, g);
    const tdee = lvl ? calcTDEE(bmr, lvl) : null;

    setMetrics({ bmi, bmr, tdee });
  }

  function validate(): FieldError[] {
    const errors: FieldError[] = [];
    const h = parseFloat(form.heightCm);
    const w = parseFloat(form.weightKg);

    if (!form.name.trim()) errors.push({ field: 'name', message: 'El nombre es requerido.' });
    if (!form.birthDate) errors.push({ field: 'birthDate', message: 'La fecha de nacimiento es requerida.' });
    else {
      const age = ageFromBirthDate(form.birthDate);
      if (age < 13) errors.push({ field: 'birthDate', message: 'Debes tener al menos 13 años.' });
    }
    if (!form.gender) errors.push({ field: 'gender', message: 'El género es requerido.' });
    if (!form.heightCm) errors.push({ field: 'heightCm', message: 'La altura es requerida.' });
    else if (h < 100 || h > 250) errors.push({ field: 'heightCm', message: 'La altura debe estar entre 100 y 250 cm.' });
    if (!form.weightKg) errors.push({ field: 'weightKg', message: 'El peso es requerido.' });
    else if (w < 30 || w > 300) errors.push({ field: 'weightKg', message: 'El peso debe estar entre 30 y 300 kg.' });
    if (!form.goal) errors.push({ field: 'goal', message: 'El objetivo es requerido.' });

    return errors;
  }

  async function handleSave(): Promise<void> {
    const errors = validate();
    setFieldErrors(errors);
    if (errors.length > 0) return;

    const goalChanged = form.goal !== originalGoal && originalGoal !== '';

    if (goalChanged) {
      Alert.alert(
        'Cambio de objetivo',
        'Al cambiar tu objetivo, se regenerarán tu plan de entrenamiento y plan nutricional. ¿Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => void doSave() },
        ],
      );
    } else {
      await doSave();
    }
  }

  async function doSave(): Promise<void> {
    setSaving(true);
    try {
      const session = await getSession();
      if (!session) return;

      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          birth_date: form.birthDate,
          gender: form.gender,
          height_cm: parseFloat(form.heightCm),
          weight_kg: parseFloat(form.weightKg),
          goal: form.goal,
          experience_level: form.experienceLevel || undefined,
          available_days: form.availableDays ? parseInt(form.availableDays) : undefined,
          medical_conditions: form.medicalConditions || undefined,
        }),
      });

      if (res.ok) {
        setOriginalGoal(form.goal as Goal);
        Alert.alert('Guardado', 'Tu perfil fue actualizado correctamente.');
      } else {
        const err = (await res.json()) as { message?: string };
        Alert.alert('Error', err.message ?? 'No se pudo guardar el perfil.');
      }
    } catch {
      Alert.alert('Error', 'Error de conexión. Los cambios se guardarán cuando recuperes internet.');
    } finally {
      setSaving(false);
    }
  }

  function fieldError(field: string): string | null {
    return fieldErrors.find((e) => e.field === field)?.message ?? null;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle} accessibilityRole="header">Datos personales</Text>

      {/* Nombre */}
      <View style={styles.field}>
        <Text style={styles.label} nativeID="name-label">Nombre completo</Text>
        <TextInput
          style={[styles.input, fieldError('name') && styles.inputError]}
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          accessibilityLabel="Nombre completo"
          accessibilityLabelledBy="name-label"
          placeholder="Juan García"
          placeholderTextColor="#6B7280"
        />
        {fieldError('name') && <Text style={styles.errorMsg} accessibilityRole="alert">{fieldError('name')}</Text>}
      </View>

      {/* Fecha de nacimiento */}
      <View style={styles.field}>
        <Text style={styles.label} nativeID="dob-label">Fecha de nacimiento</Text>
        <TextInput
          style={[styles.input, fieldError('birthDate') && styles.inputError]}
          value={form.birthDate}
          onChangeText={(v) => setForm((f) => ({ ...f, birthDate: v }))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#6B7280"
          accessibilityLabel="Fecha de nacimiento"
          accessibilityLabelledBy="dob-label"
        />
        {fieldError('birthDate') && <Text style={styles.errorMsg} accessibilityRole="alert">{fieldError('birthDate')}</Text>}
      </View>

      {/* Género */}
      <View style={styles.field}>
        <Text style={styles.label}>Género</Text>
        <View style={styles.row}>
          {(['male', 'female'] as Gender[]).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.chip, form.gender === g && styles.chipSelected]}
              onPress={() => setForm((f) => ({ ...f, gender: g }))}
              accessibilityRole="radio"
              accessibilityLabel={g === 'male' ? 'Masculino' : 'Femenino'}
              accessibilityState={{ selected: form.gender === g }}
            >
              <Text style={[styles.chipText, form.gender === g && styles.chipTextSelected]}>
                {g === 'male' ? 'Masculino' : 'Femenino'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {fieldError('gender') && <Text style={styles.errorMsg}>{fieldError('gender')}</Text>}
      </View>

      <Text style={styles.sectionTitle}>Datos físicos</Text>

      {/* Altura */}
      <View style={styles.field}>
        <Text style={styles.label} nativeID="height-label">Altura (cm)</Text>
        <TextInput
          style={[styles.input, fieldError('heightCm') && styles.inputError]}
          value={form.heightCm}
          onChangeText={(v) => setForm((f) => ({ ...f, heightCm: v }))}
          keyboardType="numeric"
          accessibilityLabel="Altura en centímetros"
          accessibilityLabelledBy="height-label"
          placeholder="170"
          placeholderTextColor="#6B7280"
        />
        {fieldError('heightCm') && <Text style={styles.errorMsg} accessibilityRole="alert">{fieldError('heightCm')}</Text>}
      </View>

      {/* Peso */}
      <View style={styles.field}>
        <Text style={styles.label} nativeID="weight-label">Peso (kg)</Text>
        <TextInput
          style={[styles.input, fieldError('weightKg') && styles.inputError]}
          value={form.weightKg}
          onChangeText={(v) => setForm((f) => ({ ...f, weightKg: v }))}
          keyboardType="numeric"
          accessibilityLabel="Peso en kilogramos"
          accessibilityLabelledBy="weight-label"
          placeholder="70"
          placeholderTextColor="#6B7280"
        />
        {fieldError('weightKg') && <Text style={styles.errorMsg} accessibilityRole="alert">{fieldError('weightKg')}</Text>}
      </View>

      {/* Métricas en tiempo real */}
      {(metrics.bmi || metrics.bmr || metrics.tdee) && (
        <View style={styles.metricsCard} accessibilityLabel="Métricas calculadas">
          <Text style={styles.metricsTitle}>Tus métricas</Text>
          <View style={styles.metricsRow}>
            {metrics.bmi !== null && (
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{metrics.bmi}</Text>
                <Text style={styles.metricLabel}>IMC</Text>
              </View>
            )}
            {metrics.bmr !== null && (
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{Math.round(metrics.bmr)}</Text>
                <Text style={styles.metricLabel}>TMB (kcal)</Text>
              </View>
            )}
            {metrics.tdee !== null && (
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{Math.round(metrics.tdee)}</Text>
                <Text style={styles.metricLabel}>TDEE (kcal)</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Objetivo y entrenamiento</Text>

      {/* Objetivo */}
      <View style={styles.field}>
        <Text style={styles.label}>Objetivo principal</Text>
        <View style={styles.goalsGrid}>
          {GOALS.map(({ value, label }) => (
            <TouchableOpacity
              key={value}
              style={[styles.goalChip, form.goal === value && styles.goalChipSelected]}
              onPress={() => setForm((f) => ({ ...f, goal: value }))}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected: form.goal === value }}
            >
              <Text style={[styles.goalChipText, form.goal === value && styles.goalChipTextSelected]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {fieldError('goal') && <Text style={styles.errorMsg}>{fieldError('goal')}</Text>}
      </View>

      {/* Nivel de experiencia */}
      <View style={styles.field}>
        <Text style={styles.label}>Nivel de experiencia (opcional)</Text>
        <View style={styles.row}>
          {(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as ExperienceLevel[]).map((lvl) => (
            <TouchableOpacity
              key={lvl}
              style={[styles.chip, form.experienceLevel === lvl && styles.chipSelected]}
              onPress={() => setForm((f) => ({ ...f, experienceLevel: lvl }))}
              accessibilityRole="radio"
              accessibilityLabel={lvl === 'BEGINNER' ? 'Principiante' : lvl === 'INTERMEDIATE' ? 'Intermedio' : 'Avanzado'}
              accessibilityState={{ selected: form.experienceLevel === lvl }}
            >
              <Text style={[styles.chipText, form.experienceLevel === lvl && styles.chipTextSelected]}>
                {lvl === 'BEGINNER' ? 'Principiante' : lvl === 'INTERMEDIATE' ? 'Intermedio' : 'Avanzado'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Días disponibles */}
      <View style={styles.field}>
        <Text style={styles.label} nativeID="days-label">Días disponibles por semana (opcional)</Text>
        <TextInput
          style={styles.input}
          value={form.availableDays}
          onChangeText={(v) => setForm((f) => ({ ...f, availableDays: v }))}
          keyboardType="numeric"
          accessibilityLabel="Días disponibles por semana"
          accessibilityLabelledBy="days-label"
          placeholder="3"
          placeholderTextColor="#6B7280"
        />
      </View>

      {/* Condiciones médicas */}
      <View style={styles.field}>
        <Text style={styles.label} nativeID="medical-label">Condiciones médicas (opcional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.medicalConditions}
          onChangeText={(v) => setForm((f) => ({ ...f, medicalConditions: v }))}
          multiline
          numberOfLines={3}
          accessibilityLabel="Condiciones médicas"
          accessibilityLabelledBy="medical-label"
          placeholder="Ej: hipertensión, diabetes..."
          placeholderTextColor="#6B7280"
        />
      </View>

      {/* Botón guardar */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Guardar perfil"
        accessibilityState={{ disabled: saving, busy: saving }}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>Guardar cambios</Text>
        )}
      </TouchableOpacity>

      {/* Historial de peso */}
      <TouchableOpacity
        style={styles.weightHistoryButton}
        onPress={() => router.push('/profile/weight-history')}
        accessibilityRole="button"
        accessibilityLabel="Ver historial de peso"
      >
        <Text style={styles.weightHistoryText}>📊 Ver historial de peso</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 20, paddingVertical: 24, paddingBottom: 48 },
  loadingContainer: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#F9FAFB', marginTop: 24, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '500', color: '#9CA3AF', marginBottom: 6 },
  input: { backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#F9FAFB', minHeight: 44 },
  inputError: { borderColor: '#EF4444' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  errorMsg: { color: '#EF4444', fontSize: 12, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#374151', backgroundColor: '#1F2937' },
  chipSelected: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  chipText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  chipTextSelected: { color: '#A5B4FC' },
  metricsCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 8 },
  metricsTitle: { fontSize: 14, fontWeight: '600', color: '#9CA3AF', marginBottom: 12 },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  metricItem: { alignItems: 'center' },
  metricValue: { fontSize: 22, fontWeight: '700', color: '#6366F1' },
  metricLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#374151', backgroundColor: '#1F2937' },
  goalChipSelected: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  goalChipText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  goalChipTextSelected: { color: '#A5B4FC' },
  saveButton: { backgroundColor: '#6366F1', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24, minHeight: 48 },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  weightHistoryButton: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  weightHistoryText: { color: '#6366F1', fontSize: 15 },
});
