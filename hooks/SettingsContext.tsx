import React, { createContext, useContext, useState, useCallback } from 'react';

interface SettingsContextType {
  settingsVersion: number;
  notifySettingsChanged: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  settingsVersion: 0,
  notifySettingsChanged: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settingsVersion, setSettingsVersion] = useState(0);

  const notifySettingsChanged = useCallback(async () => {
    // Use a promise to ensure the version update is complete
    return new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        setSettingsVersion(prev => prev + 1);
        // Wait for the next frame to ensure the state update has propagated
        requestAnimationFrame(() => resolve());
      });
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settingsVersion, notifySettingsChanged }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettingsContext = () => useContext(SettingsContext);