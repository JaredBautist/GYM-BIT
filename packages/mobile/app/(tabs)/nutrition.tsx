/**
 * Tab de nutrición — registro diario + plan nutricional.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import NutritionDailyScreen from '../../src/screens/nutrition/NutritionDailyScreen';
import NutritionPlanScreen from '../../src/screens/nutrition/NutritionPlanScreen';

type NutritionView = 'daily' | 'plan';

export default function NutritionTab() {
  const [view, setView] = useState<NutritionView>('daily');

  return (
    <View style={styles.container}>
      {/* Selector de vista */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segment, view === 'daily' && styles.segmentActive]}
          onPress={() => setView('daily')}
          accessibilityRole="tab"
          accessibilityLabel="Registro diario"
          accessibilityState={{ selected: view === 'daily' }}
        >
          <Text style={[styles.segmentText, view === 'daily' && styles.segmentTextActive]}>
            📋 Diario
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, view === 'plan' && styles.segmentActive]}
          onPress={() => setView('plan')}
          accessibilityRole="tab"
          accessibilityLabel="Plan nutricional"
          accessibilityState={{ selected: view === 'plan' }}
        >
          <Text style={[styles.segmentText, view === 'plan' && styles.segmentTextActive]}>
            🎯 Mi Plan
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contenido */}
      <View style={styles.content}>
        {view === 'daily' ? <NutritionDailyScreen /> : <NutritionPlanScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', paddingTop: 56 },
  segmentRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, backgroundColor: '#1F2937', borderRadius: 10, padding: 4 },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: '#6366F1' },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  segmentTextActive: { color: '#FFFFFF' },
  content: { flex: 1 },
});
