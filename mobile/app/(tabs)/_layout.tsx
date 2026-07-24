/**
 * Mizani tab navigation — Ionicons tab bar, Inter labels.
 */

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size = 24 }: { name: IoniconName; color: string; size?: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

import { View } from 'react-native';
import FloatingMizizi from '@/components/FloatingMizizi';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const c = Colors[colorScheme];

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: c.tabIconSelected,
          tabBarInactiveTintColor: c.tabIconDefault,
          tabBarStyle: {
            backgroundColor: c.surface,
            borderTopColor: c.border,
            borderTopWidth: 1,
            paddingBottom: Platform.OS === 'ios' ? 4 : 8,
            paddingTop: 8,
            height: Platform.OS === 'ios' ? 84 : 64,
          },
          tabBarLabelStyle: {
            fontFamily: 'Inter_500Medium',
            fontSize: 11,
            letterSpacing: 0.2,
            marginTop: 2,
          },
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.text,
          headerTitleStyle: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 17,
          },
          headerShown: useClientOnlyValue(false, true),
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Mizizi',
            tabBarIcon: ({ color }) => (
              <TabIcon name="home-outline" color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="money"
          options={{
            title: 'Money',
            tabBarIcon: ({ color }) => (
              <TabIcon name="cash-outline" color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="customers"
          options={{
            title: 'People',
            tabBarIcon: ({ color }) => (
              <TabIcon name="people-outline" color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="goods"
          options={{
            title: 'Goods',
            tabBarIcon: ({ color }) => (
              <TabIcon name="cube-outline" color={color as string} />
            ),
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Inbox',
            tabBarIcon: ({ color }) => (
              <TabIcon name="mail-outline" color={color as string} />
            ),
          }}
        />
        <Tabs.Screen name="two" options={{ href: null }} />
      </Tabs>
      <FloatingMizizi />
    </View>
  );
}
