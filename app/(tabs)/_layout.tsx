import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Redirect } from 'expo-router';
import { useSettings } from '@/hooks/useSettings';
import { ThemedText } from '@/components/ThemedText';
import Constants from 'expo-constants';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { settings, isLoading } = useSettings();

  if (isLoading) {
    return null;
  }

  if (!settings.isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <>
      <ThemedText style={styles.version}>Version {Constants.expoConfig?.extra?.version || '1.0.3'}</ThemedText>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground,
          tabBarStyle: Platform.select({
            ios: {
              // Use a transparent background on iOS to show the blur effect
              position: 'absolute',
            },
            default: {},
          }),
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  version: {
    textAlign: 'center',
    paddingVertical: 8,
    fontSize: 12,
  },
});
