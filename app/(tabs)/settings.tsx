import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Picker } from '@react-native-picker/picker';
import { TextInput } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useSettings, defaultSettings } from '@/hooks/useSettings';
import { useRouter, useNavigation } from 'expo-router';
import { useSettingsContext } from '@/hooks/SettingsContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from '@/services/secureStorage';
import * as FileSystem from 'expo-file-system';

export default function SettingsScreen() {
  const { settings, updateSettings, isLoading, reloadSettings } = useSettings();  // Changed from loadSettings to reloadSettings
  const { notifySettingsChanged } = useSettingsContext();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const router = useRouter();
  const navigation = useNavigation();
  const [updating, setUpdating] = useState(false);
  const [tempSettings, setTempSettings] = useState({
    year: settings.year,
    spotMargin: settings.spotMargin.toString(),  // Ensure it's a string for the input
  });

  // Update temp settings when main settings change
  useEffect(() => {
    setTempSettings({
      year: settings.year,
      spotMargin: settings.spotMargin.toString(),
    });
  }, [settings]);

  const years = ['2023', '2024', '2025'];

  const handleSpotMarginChange = (value: string) => {
    // Allow only numbers and one decimal point
    const filtered = value.replace(/[^\d.]/g, '');
    const parts = filtered.split('.');
    if (parts.length > 2) return; // Don't allow multiple decimal points
    setTempSettings(prev => ({ ...prev, spotMargin: filtered }));
  };

  const handleYearChange = (value: string) => {
    setTempSettings(prev => ({ ...prev, year: value }));
  };

  const handleUpdate = async () => {
    try {
      setUpdating(true);
      // Validate spot margin is a valid number
      const marginValue = parseFloat(tempSettings.spotMargin);
      if (isNaN(marginValue)) {
        setTempSettings(prev => ({ ...prev, spotMargin: settings.spotMargin.toString() }));
        return;
      }
      
      // Update settings first
      const success = await updateSettings({ 
        year: tempSettings.year,
        spotMargin: marginValue.toString()
      });
      
      if (success) {
        // Notify about settings change and wait for it to complete
        await notifySettingsChanged();
        // Force reload settings and wait for it to complete
        await reloadSettings();
        // Then navigate back
        router.push('/(tabs)');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      setTempSettings({
        year: settings.year,
        spotMargin: settings.spotMargin.toString(),
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Reset Application",
      "This will clear all settings including your Elenia credentials. You'll need to go through the onboarding process again. Are you sure?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setUpdating(true);
            try {
              // Clear all AsyncStorage data
              await AsyncStorage.clear();
              // Clear secure storage
              await secureStorage.removePassword();
              // Clear cache directories
              const cacheDir = `${FileSystem.cacheDirectory}data/`;
              await FileSystem.deleteAsync(cacheDir, { idempotent: true });
              // Reset settings to default
              await updateSettings(defaultSettings);
              await notifySettingsChanged();
              // Navigate to onboarding
              router.replace('/onboarding');
            } catch (error) {
              console.error('Error resetting application:', error);
              Alert.alert(
                "Error",
                "Failed to reset application. Please try again."
              );
            } finally {
              setUpdating(false);
            }
          }
        }
      ]
    );
  };

  if (isLoading || updating) {
    return (
      <ThemedView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.loadingText}>
          {updating ? 'Updating settings...' : 'Loading settings...'}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.section}>
        
        <ThemedText style={styles.label}>Year</ThemedText>
        <View style={[styles.pickerContainer, { backgroundColor }]}>
          <Picker
            selectedValue={tempSettings.year}
            onValueChange={handleYearChange}
            style={[styles.picker, { color: textColor }]}>
            {years.map((year) => (
              <Picker.Item key={year} label={year} value={year} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Spot Margin (c/kWh)</ThemedText>
        <TextInput
          style={[styles.input, { backgroundColor, color: textColor }]}
          value={tempSettings.spotMargin}
          onChangeText={handleSpotMarginChange}
          keyboardType="decimal-pad"
          placeholder="Enter spot margin"
          placeholderTextColor="#666"
        />
        <ThemedText style={styles.helperText}>
          Current value: {settings.spotMargin} c/kWh
        </ThemedText>
      </View>

      <Pressable 
        style={({ pressed }) => [
          styles.updateButton,
          { opacity: pressed ? 0.8 : 1 },
          updating && styles.updateButtonDisabled
        ]}
        onPress={handleUpdate}
        disabled={updating || (
          tempSettings.year === settings.year && 
          tempSettings.spotMargin === settings.spotMargin
        )}>
        <ThemedText style={styles.buttonText}>
          Update and Return to Home
        </ThemedText>
      </Pressable>

      <View style={styles.section}>
        <ThemedText style={[styles.label, styles.dangerText]}>Danger Zone</ThemedText>
        <Pressable 
          style={({ pressed }) => [
            styles.resetButton,
            { opacity: pressed ? 0.8 : 1 }
          ]}
          onPress={handleReset}>
          <ThemedText style={styles.buttonText}>
            Reset Application
          </ThemedText>
        </Pressable>
        <ThemedText style={styles.label}>App version 1.0.4</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  pickerContainer: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  input: {
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  updateButton: {
    backgroundColor: '#2ecc71',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  updateButtonDisabled: {
    backgroundColor: '#95a5a6',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.7,
  },
  resetButton: {
    backgroundColor: '#e74c3c',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerText: {
    color: '#e74c3c',
  }
});