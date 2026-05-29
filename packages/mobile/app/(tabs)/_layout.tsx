/**
 * Layout de navegación por pestañas — pantalla principal de GymBit.
 * 5 tabs: Dashboard, Entrenamiento, Nutrición, Sueño, Perfil
 */

import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1F2937',
          borderTopColor: '#374151',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
          tabBarAccessibilityLabel: 'Dashboard principal',
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Entrena',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💪" focused={focused} />,
          tabBarAccessibilityLabel: 'Entrenamiento',
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutrición',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🥗" focused={focused} />,
          tabBarAccessibilityLabel: 'Nutrición',
        }}
      />
      <Tabs.Screen
        name="sleep"
        options={{
          title: 'Sueño',
          tabBarIcon: ({ focused }) => <TabIcon emoji="😴" focused={focused} />,
          tabBarAccessibilityLabel: 'Registro de sueño',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
          tabBarAccessibilityLabel: 'Perfil y configuración',
        }}
      />
    </Tabs>
  );
}
