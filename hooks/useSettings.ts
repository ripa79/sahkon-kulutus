import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsContext } from './SettingsContext';
import { secureStorage } from '@/services/secureStorage';

const SETTINGS_KEY = 'app_settings';

interface Settings {
  year: string;
  spotMargin: string;
  eleniaUsername?: string;
  isOnboarded: boolean;
}

export const defaultSettings: Settings = {
  year: new Date().getFullYear().toString(),
  spotMargin: "1",
  isOnboarded: false
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const { settingsVersion } = useSettingsContext();

  const loadSettings = useCallback(async () => {
    try {
      console.warn('[useSettings] Loading settings...');
      const storedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (storedSettings) {
        console.warn('[useSettings] Found stored settings');
        const parsedSettings = JSON.parse(storedSettings);
        parsedSettings.spotMargin = parsedSettings.spotMargin.toString();
        setSettings(parsedSettings);
        console.warn('[useSettings] Settings loaded successfully:', { username: parsedSettings.eleniaUsername, isOnboarded: parsedSettings.isOnboarded });
      } else {
        console.warn('[useSettings] No stored settings found');
      }
    } catch (error) {
      console.error('[useSettings] Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings, settingsVersion]);

  const updateSettings = async (newSettings: Partial<Settings & { eleniaPassword?: string }>) => {
    try {
      console.warn('[useSettings] Updating settings...', { 
        hasUsername: !!newSettings.eleniaUsername,
        hasPassword: !!newSettings.eleniaPassword,
        isOnboarded: newSettings.isOnboarded
      });

      // Handle password separately
      if (newSettings.eleniaPassword) {
        console.warn('[useSettings] Storing password in secure storage...');
        await secureStorage.storePassword(newSettings.eleniaPassword);
        delete newSettings.eleniaPassword;
      }

      const updatedSettings = { 
        ...settings, 
        ...newSettings,
        spotMargin: newSettings.spotMargin?.toString() ?? settings.spotMargin 
      };

      console.warn('[useSettings] Saving settings to AsyncStorage...');
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
      
      await new Promise<void>(resolve => {
        setSettings(updatedSettings);
        requestAnimationFrame(() => resolve());
      });

      console.warn('[useSettings] Settings updated successfully');
      return true;
    } catch (error) {
      console.error('[useSettings] Error saving settings:', error);
      return false;
    }
  };

  const getEleniaPassword = async () => {
    return await secureStorage.getPassword();
  };

  return {
    settings,
    updateSettings,
    isLoading,
    reloadSettings: loadSettings,
    getEleniaPassword
  };
}