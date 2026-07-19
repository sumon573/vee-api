/**
 * Platform Utilities — shared helpers for runtime environment detection.
 *
 * Centralised here so callers (useZegoVoiceRoom, pushNotificationService, etc.)
 * don't each duplicate the same Expo Go detection logic.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Returns true when the app is running inside Expo Go (the store client).
 *
 * Native modules that require a custom dev client or production build
 * (OneSignal, ZEGO, etc.) must guard on this function and short-circuit
 * all native calls when it returns true.
 */
export function isExpoGo(): boolean {
  try {
    return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  } catch {
    // If expo-constants is unavailable, assume native build (safe default).
    return false;
  }
}

/**
 * Returns the base API URL, resolving EXPO_PUBLIC_DOMAIN when set (injected
 * by EAS build profiles) and falling back to the production Render URL.
 */
export function getApiBase(): string {
  const domain = process.env['EXPO_PUBLIC_DOMAIN'];
  if (domain) {
    // Normalise: strip any trailing slash, add https:// if scheme is absent.
    const normalised = domain.replace(/\/$/, '');
    return normalised.startsWith('http') ? normalised : `https://${normalised}`;
  }
  return 'https://vee-api.onrender.com';
}
