import * as SecureStore from 'expo-secure-store';

const ELENIA_PASSWORD_KEY = 'elenia_password_secure';

export const secureStorage = {
  async storePassword(password: string): Promise<void> {
    try {
      console.warn('[SecureStorage] Attempting to store password');
      await SecureStore.setItemAsync(ELENIA_PASSWORD_KEY, password);
      console.warn('[SecureStorage] Password stored successfully');
    } catch (error) {
      console.warn('[SecureStorage] Error storing password:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  },

  async getPassword(): Promise<string | null> {
    try {
      console.warn('[SecureStorage] Attempting to retrieve password');
      const result = await SecureStore.getItemAsync(ELENIA_PASSWORD_KEY);
      console.warn('[SecureStorage] Password retrieval result:', result ? 'Password found' : 'No password found');
      return result;
    } catch (error) {
      console.warn('[SecureStorage] Error retrieving password:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  },

  async removePassword(): Promise<void> {
    try {
      console.warn('[SecureStorage] Attempting to remove password');
      await SecureStore.deleteItemAsync(ELENIA_PASSWORD_KEY);
      console.warn('[SecureStorage] Password removed successfully');
    } catch (error) {
      console.warn('[SecureStorage] Error removing password:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  },

  async isAvailable(): Promise<boolean> {
    try {
      console.warn('[SecureStorage] Checking if secure storage is available');
      const isAvailable = await SecureStore.isAvailableAsync();
      console.warn('[SecureStorage] Secure storage available:', isAvailable);
      return isAvailable;
    } catch (error) {
      console.warn('[SecureStorage] Error checking availability:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }
};