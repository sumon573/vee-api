/**
 * ZEGOCLOUD Config — Vee App Voice Rooms
 *
 * ⚠️  For production hardening, move App Sign verification to a backend
 *     token server (ZEGOCLOUD server-side token authentication).
 *     Client-side App Sign is accepted for direct publish/play scenarios.
 */

export const ZEGO_CONFIG = {
  appID: 1932008396,
  appSign: 'c711a7a14e131ccfb53a6c3a1a4ec1f546b6760f16170730e769564dfe0670e1',
};

export function isZegoConfigured(): boolean {
  return ZEGO_CONFIG.appID !== 0 && ZEGO_CONFIG.appSign !== 'YOUR_APP_SIGN';
}
