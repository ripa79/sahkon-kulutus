import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, SafeAreaView, Dimensions, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useSettings } from '@/hooks/useSettings';
import { testEleniaCredentials } from '@/services/eleniaAuthService';
import { Stack } from 'expo-router';
import { secureStorage } from '@/services/secureStorage';
import Constants from 'expo-constants';

export default function OnboardingScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { updateSettings } = useSettings();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  const handleSubmit = async () => {
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.warn('[Onboarding] Checking if secure storage is available...');
      const isSecureStorageAvailable = await secureStorage.isAvailable();
      console.warn('[Onboarding] Secure storage available:', isSecureStorageAvailable);

      console.warn('[Onboarding] Testing Elenia credentials...');
      const isValid = await testEleniaCredentials(username, password);
      console.warn('[Onboarding] Credentials valid:', isValid);
      
      if (isValid) {
        console.warn('[Onboarding] Updating settings...');
        const updateResult = await updateSettings({
          eleniaUsername: username,
          eleniaPassword: password,
          isOnboarded: true
        });
        console.warn('[Onboarding] Settings updated:', updateResult);

        // Double check that password was stored
        const storedPassword = await secureStorage.getPassword();
        console.warn('[Onboarding] Password stored successfully:', !!storedPassword);

        router.replace('/(tabs)');
      } else {
        setError('Invalid credentials');
      }
    } catch (err) {
      console.warn('[Onboarding] Error during onboarding:', err instanceof Error ? err.message : err);
      setError('Failed to verify credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.wrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.contentContainer}>
          <View style={styles.headerSection}>
            <ThemedText style={styles.title}>Welcome!</ThemedText>
            <ThemedText style={styles.subtitle}>Please enter your Elenia credentials</ThemedText>
          </View>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, { color: textColor, borderColor: textColor }]}
              placeholder="Username"
              placeholderTextColor="#666"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, { color: textColor, borderColor: textColor }]}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
            <TouchableOpacity 
              style={styles.button} 
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>Continue</ThemedText>
              )}
            </TouchableOpacity>
          </View>
          <ThemedText style={styles.version}>Version {Constants.expoConfig?.extra?.version || '1.0.4'}</ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const { height } = Dimensions.get('window');

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerSection: {
    paddingTop: 100, // Move padding to header section
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    flexWrap: 'wrap', // Ensure text wraps properly
    marginBottom: 16,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    lineHeight: 34, // Added line height for better vertical spacing
    minHeight: 40, // Minimum height to ensure text fits
    paddingVertical: 4, // Add some padding around the text
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 300,
    alignSelf: 'center',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  button: {
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#FF3B30',
    marginTop: -8,
    marginBottom: 8,
    textAlign: 'center',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    position: 'absolute',
    bottom: 20,
    width: '100%',
    alignSelf: 'center',
  },
});