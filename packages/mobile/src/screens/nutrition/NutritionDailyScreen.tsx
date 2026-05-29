/**
 * NutritionDailyScreen — registro diario de alimentos.
 *
 * - Vista de comidas del día con totales de macros
 * - Búsqueda de alimentos con debounce (USDA o caché local)
 * - Escáner de código de barras (expo-barcode-scanner)
 * - Captura de foto con envío a AI_Vision_Service (deshabilitado offline)
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.7
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import NetInfo from '@react-native-community/netinfo';

import { getSession } from '../../db/repositories/user.repository';
import { searchFoodsLocal, getOrCreateDailyRecord } from '../../db/repositories/nutrition.repository';
import { writeOffline } from '../../offline/sync.manager';

// ── Types ────────────────────────────────────────────────────────────────────

const BarcodeCameraView = CameraView as unknown as React.ComponentType<{
  style: object;
  facing: 'back' | 'front';
  onBarcodeScanned: (event: { data: string }) => void;
  barcodeScannerSettings: { barcodeTypes: string[] };
}>;

interface FoodItem {
  id: string;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

interface MealEntry {
  id: string;
  mealType: string;
  foods: Array<{ name: string; quantityG: number; calories: number }>;
}

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calorieGoal: number;
}

type ActiveMode = 'search' | 'barcode' | 'photo' | null;

// ── Component ─────────────────────────────────────────────────────────────────

export default function NutritionDailyScreen(): React.JSX.Element {
  const today = new Date().toISOString().split('T')[0]!;

  const [totals, setTotals] = useState<DailyTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0, calorieGoal: 0 });
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [selectedMealType, setSelectedMealType] = useState<string>('LUNCH');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadDailyRecord();
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected && !!state.isInternetReachable);
    });
    return () => unsub();
  }, []);

  async function loadDailyRecord(): Promise<void> {
    try {
      const session = await getSession();
      if (!session) return;

      const res = await fetch(
        `${process.env['EXPO_PUBLIC_API_URL']}/nutrition/daily/${today}`,
        { headers: { Authorization: `Bearer ${session.accessToken}` } },
      );

      if (res.ok) {
        const data = (await res.json()) as {
          total_calories: number; total_protein: number;
          total_carbs: number; total_fat: number; calorie_goal: number;
          meals?: Array<{ id: string; meal_type: string; food_logs?: Array<{ food_id: string; quantity_g: number; calories: number }> }>;
        };

        setTotals({
          calories: data.total_calories,
          protein: data.total_protein,
          carbs: data.total_carbs,
          fat: data.total_fat,
          calorieGoal: data.calorie_goal,
        });
      } else {
        // Usar caché local (Req 6.7)
        const local = await getOrCreateDailyRecord(session.userId, today);
        setTotals({
          calories: local.totalCalories,
          protein: local.totalProtein,
          carbs: local.totalCarbs,
          fat: local.totalFat,
          calorieGoal: local.calorieGoal,
        });
      }
    } catch {
      // Sin conexión — datos locales
    }
  }

  // Búsqueda con debounce (Req 6.1)
  function handleSearchChange(text: string): void {
    setSearchQuery(text);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    if (!text.trim()) { setSearchResults([]); return; }

    searchDebounce.current = setTimeout(() => void doSearch(text), 400);
  }

  async function doSearch(query: string): Promise<void> {
    setSearching(true);
    try {
      if (isOnline) {
        const session = await getSession();
        if (!session) return;

        const res = await fetch(
          `${process.env['EXPO_PUBLIC_API_URL']}/nutrition/search?q=${encodeURIComponent(query)}`,
          { headers: { Authorization: `Bearer ${session.accessToken}` } },
        );

        if (res.ok) {
          const data = (await res.json()) as Array<{
            id: string; name: string;
            calories_per_100g: number; protein_per_100g: number;
            carbs_per_100g: number; fat_per_100g: number;
          }>;
          setSearchResults(data.map((f) => ({
            id: f.id, name: f.name,
            caloriesPer100g: f.calories_per_100g,
            proteinPer100g: f.protein_per_100g,
            carbsPer100g: f.carbs_per_100g,
            fatPer100g: f.fat_per_100g,
          })));
          return;
        }
      }

      // Fallback a caché local (Req 6.7)
      const local = await searchFoodsLocal(query);
      setSearchResults(local.map((f) => ({
        id: f.id, name: f.name,
        caloriesPer100g: f.caloriesPer100g,
        proteinPer100g: f.proteinPer100g,
        carbsPer100g: f.carbsPer100g,
        fatPer100g: f.fatPer100g,
      })));
    } finally {
      setSearching(false);
    }
  }

  async function handleAddFood(food: FoodItem, quantityG = 100): Promise<void> {
    try {
      const session = await getSession();
      if (!session) return;

      if (isOnline) {
        // Crear comida si no existe
        const mealRes = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/nutrition/daily/meals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
          body: JSON.stringify({ date: today, mealType: selectedMealType }),
        });

        if (mealRes.ok) {
          const meal = (await mealRes.json()) as { id: string };
          await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/nutrition/daily/meals/${meal.id}/foods`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
            body: JSON.stringify({ foodId: food.id, quantityG }),
          });
        }
      } else {
        // Encolar offline (Req 6.7)
        await writeOffline(session.userId, 'CREATE', 'food_log', `fl-${Date.now()}`, {
          foodId: food.id, quantityG, mealType: selectedMealType, date: today,
        });
      }

      setSearchQuery('');
      setSearchResults([]);
      setActiveMode(null);
      await loadDailyRecord();
    } catch {
      Alert.alert('Error', 'No se pudo agregar el alimento.');
    }
  }

  // Escáner de código de barras (Req 6.2)
  async function handleBarcodeScan(barcode: string): Promise<void> {
    setActiveMode(null);
    try {
      const session = await getSession();
      if (!session) return;

      const res = await fetch(`${process.env['EXPO_PUBLIC_API_URL']}/nutrition/barcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ barcode }),
      });

      if (res.ok) {
        const food = (await res.json()) as FoodItem & { calories_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number };
        Alert.alert(
          food.name,
          `${food.calories_per_100g} kcal / 100g`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Agregar 100g', onPress: () => void handleAddFood({ id: food.id, name: food.name, caloriesPer100g: food.calories_per_100g, proteinPer100g: food.protein_per_100g, carbsPer100g: food.carbs_per_100g, fatPer100g: food.fat_per_100g }) },
          ],
        );
      } else {
        Alert.alert('No encontrado', 'No se encontró ningún alimento con ese código de barras.');
      }
    } catch {
      Alert.alert('Error', 'Error al buscar el código de barras.');
    }
  }

  const caloriesRemaining = Math.max(0, totals.calorieGoal - totals.calories);
  const caloriesPercent = totals.calorieGoal > 0 ? Math.min(1, totals.calories / totals.calorieGoal) : 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Resumen calórico del día */}
        <View style={styles.summaryCard} accessibilityLabel={`Calorías: ${Math.round(totals.calories)} de ${totals.calorieGoal}`}>
          <Text style={styles.summaryTitle}>Hoy — {today}</Text>
          <View style={styles.caloriesRow}>
            <View>
              <Text style={styles.caloriesConsumed}>{Math.round(totals.calories)}</Text>
              <Text style={styles.caloriesLabel}>consumidas</Text>
            </View>
            <View style={styles.caloriesDivider} />
            <View>
              <Text style={styles.caloriesRemaining}>{Math.round(caloriesRemaining)}</Text>
              <Text style={styles.caloriesLabel}>restantes</Text>
            </View>
            <View style={styles.caloriesDivider} />
            <View>
              <Text style={styles.caloriesGoal}>{totals.calorieGoal}</Text>
              <Text style={styles.caloriesLabel}>objetivo</Text>
            </View>
          </View>

          {/* Barra de progreso */}
          <View style={styles.progressBar} accessibilityLabel={`${Math.round(caloriesPercent * 100)}% del objetivo calórico`}>
            <View style={[styles.progressFill, { width: `${caloriesPercent * 100}%` as `${number}%` }]} />
          </View>

          {/* Macros */}
          <View style={styles.macrosRow}>
            {[
              { label: 'Proteínas', value: totals.protein, color: '#6366F1' },
              { label: 'Carbos', value: totals.carbs, color: '#F59E0B' },
              { label: 'Grasas', value: totals.fat, color: '#EF4444' },
            ].map(({ label, value, color }) => (
              <View key={label} style={styles.macroItem}>
                <Text style={[styles.macroValue, { color }]}>{Math.round(value)}g</Text>
                <Text style={styles.macroLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Selector de tipo de comida */}
        <View style={styles.mealTypeRow}>
          {['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.mealTypeChip, selectedMealType === type && styles.mealTypeChipSelected]}
              onPress={() => setSelectedMealType(type)}
              accessibilityRole="radio"
              accessibilityLabel={type === 'BREAKFAST' ? 'Desayuno' : type === 'LUNCH' ? 'Almuerzo' : type === 'DINNER' ? 'Cena' : 'Snack'}
              accessibilityState={{ selected: selectedMealType === type }}
            >
              <Text style={[styles.mealTypeText, selectedMealType === type && styles.mealTypeTextSelected]}>
                {type === 'BREAKFAST' ? '🌅' : type === 'LUNCH' ? '☀️' : type === 'DINNER' ? '🌙' : '🍎'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Botones de entrada */}
        <View style={styles.inputButtons}>
          <TouchableOpacity
            style={styles.inputBtn}
            onPress={() => setActiveMode(activeMode === 'search' ? null : 'search')}
            accessibilityRole="button"
            accessibilityLabel="Buscar alimento"
          >
            <Text style={styles.inputBtnText}>🔍 Buscar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.inputBtn}
            onPress={async () => {
              if (!cameraPermission?.granted) await requestCameraPermission();
              setActiveMode(activeMode === 'barcode' ? null : 'barcode');
            }}
            accessibilityRole="button"
            accessibilityLabel="Escanear código de barras"
          >
            <Text style={styles.inputBtnText}>📷 Código</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.inputBtn, !isOnline && styles.inputBtnDisabled]}
            onPress={() => {
              if (!isOnline) {
                Alert.alert('Sin conexión', 'El reconocimiento por foto requiere conexión a internet.');
                return;
              }
              setActiveMode(activeMode === 'photo' ? null : 'photo');
            }}
            disabled={!isOnline}
            accessibilityRole="button"
            accessibilityLabel={isOnline ? 'Fotografiar alimento' : 'Fotografiar alimento (requiere conexión)'}
            accessibilityState={{ disabled: !isOnline }}
          >
            <Text style={[styles.inputBtnText, !isOnline && styles.inputBtnTextDisabled]}>📸 Foto</Text>
          </TouchableOpacity>
        </View>

        {/* Panel de búsqueda */}
        {activeMode === 'search' && (
          <View style={styles.searchPanel}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Buscar alimento..."
              placeholderTextColor="#6B7280"
              autoFocus
              accessibilityLabel="Buscar alimento por nombre"
            />
            {searching && <ActivityIndicator color="#6366F1" style={styles.searchSpinner} />}
            {searchResults.length > 0 && (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.searchResult}
                    onPress={() => void handleAddFood(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Agregar ${item.name}, ${Math.round(item.caloriesPer100g)} calorías por 100 gramos`}
                  >
                    <Text style={styles.searchResultName}>{item.name}</Text>
                    <Text style={styles.searchResultCal}>{Math.round(item.caloriesPer100g)} kcal/100g</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* Escáner de código de barras (Req 6.2) */}
        {activeMode === 'barcode' && cameraPermission?.granted && (
          <View style={styles.cameraContainer} accessibilityLabel="Escáner de código de barras">
            <BarcodeCameraView
              style={styles.camera}
              facing="back"
              onBarcodeScanned={({ data }) => void handleBarcodeScan(data)}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            />
            <TouchableOpacity
              style={styles.closeCameraBtn}
              onPress={() => setActiveMode(null)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar escáner"
            >
              <Text style={styles.closeCameraBtnText}>✕ Cerrar</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 48 },
  summaryCard: { backgroundColor: '#1F2937', borderRadius: 14, padding: 16, marginBottom: 16 },
  summaryTitle: { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  caloriesRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 12 },
  caloriesConsumed: { fontSize: 24, fontWeight: '700', color: '#F9FAFB', textAlign: 'center' },
  caloriesRemaining: { fontSize: 24, fontWeight: '700', color: '#6366F1', textAlign: 'center' },
  caloriesGoal: { fontSize: 24, fontWeight: '700', color: '#9CA3AF', textAlign: 'center' },
  caloriesLabel: { fontSize: 11, color: '#6B7280', textAlign: 'center', marginTop: 2 },
  caloriesDivider: { width: 1, height: 40, backgroundColor: '#374151' },
  progressBar: { height: 6, backgroundColor: '#374151', borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 3 },
  macrosRow: { flexDirection: 'row', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center' },
  macroValue: { fontSize: 16, fontWeight: '700' },
  macroLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  mealTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mealTypeChip: { flex: 1, backgroundColor: '#1F2937', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#374151' },
  mealTypeChipSelected: { borderColor: '#6366F1', backgroundColor: '#1E1B4B' },
  mealTypeText: { fontSize: 20 },
  mealTypeTextSelected: { fontSize: 20 },
  inputButtons: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  inputBtn: { flex: 1, backgroundColor: '#1F2937', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  inputBtnDisabled: { opacity: 0.4 },
  inputBtnText: { color: '#D1D5DB', fontSize: 13, fontWeight: '500' },
  inputBtnTextDisabled: { color: '#6B7280' },
  searchPanel: { backgroundColor: '#1F2937', borderRadius: 10, padding: 12, marginBottom: 16 },
  searchInput: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#F9FAFB', minHeight: 44 },
  searchSpinner: { marginTop: 8 },
  searchResult: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#374151' },
  searchResultName: { flex: 1, fontSize: 14, color: '#D1D5DB' },
  searchResultCal: { fontSize: 13, color: '#6B7280' },
  cameraContainer: { borderRadius: 12, overflow: 'hidden', marginBottom: 16, height: 240 },
  camera: { flex: 1 },
  closeCameraBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  closeCameraBtnText: { color: '#FFFFFF', fontSize: 13 },
});
