/**
 * ThemeContext — app-wide dark/light mode preference.
 *
 * • Loads preference from Firebase RTDB on auth mount (users/{uid}/appSettings/darkMode).
 * • Exposes darkMode + setDarkMode to any component via useTheme().
 * • setDarkMode both updates local state AND persists to Firebase immediately.
 * • Default: false (Light Mode). Users opt in to Dark Mode.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ref, get, update } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { useAuth } from './AuthContext';

type ThemeContextType = {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  darkMode: false,
  setDarkMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [darkMode, setDarkModeState] = useState(false); // default: Light Mode

  // Load persisted preference once the user is known
  useEffect(() => {
    if (!user?.uid) {
      setDarkModeState(false); // reset to default on logout
      return;
    }
    get(ref(database, `users/${user.uid}/appSettings/darkMode`))
      .then((snap) => {
        if (snap.exists()) {
          setDarkModeState(snap.val() as boolean);
        }
        // If no value saved yet, stay at default (false = Light Mode)
      })
      .catch(() => {});
  }, [user?.uid]);

  const setDarkMode = useCallback((value: boolean) => {
    setDarkModeState(value);
    if (user?.uid) {
      update(ref(database, `users/${user.uid}/appSettings`), { darkMode: value })
        .catch(() => {});
    }
  }, [user?.uid]);

  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
