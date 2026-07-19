/**
 * useZegoVoiceRoom — ZEGOCLOUD Real Audio Hook (v4 — Minimize fix)
 *
 * BUG 11 fix: Prevent crash on room exit / background / minimize:
 *   • Added `isCleaningUp` guard so cleanup never runs twice
 *   • logoutRoom + destroyEngine are wrapped in try-catch and never block unmount
 *   • All engine event callbacks guard on mountedRef AND engineRef
 *   • AppState change listener pauses/resumes engine gracefully
 *
 * Minimize fix (v4):
 *   • Module-level `_persistedEngine` holds the ZEGO engine when the user
 *     minimizes the room. The engine is NOT destroyed — only refs are cleared.
 *   • When VoiceRoomScreen remounts (user returns from MinimizedRoomBar),
 *     the hook detects the persisted engine and reuses it, restoring all state.
 *   • Call `setZegoMinimized(true)` before router.back() to activate this path.
 *   • Call `destroyPersistedZegoEngine()` from MinimizedRoomBar close button
 *     to fully tear down the engine when the user discards the minimized room.
 *
 * ✅ Fix 1: isHost gate removed — all seat members publish
 * ✅ Fix 2: roomStreamUpdate listener — auto stream discovery + playback
 * ✅ Fix 3: localSoundLevelUpdate — local speaking detection
 * ✅ Fix 4: Android mic permission explicitly requested
 * ✅ Fix 5: startPublishing / stopPublishing controlled from screen
 * ✅ Fix 6: Cleanup guard prevents double-destroy crash (BUG 11)
 * ✅ Fix 7: AppState handler prevents background crash (BUG 11)
 * ✅ Fix 8: Module-level engine persist for minimize (v4)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform, PermissionsAndroid, AppState, AppStateStatus } from 'react-native';
import { ZEGO_CONFIG, isZegoConfigured } from '../config/zegocloud';
import { isExpoGo } from '../utils/platform';

// ─── ZEGOCLOUD SDK Types ─────────────────────────────────────────────────────

type ZegoUser = { userID: string; userName: string };

type ZegoStream = {
  streamID: string;
  user: ZegoUser;
  extraInfo?: string;
};

type ZegoSoundLevelInfo = {
  streamID?: string;  // SDK v3.x
  userID?: string;    // some wrapper versions
  soundLevel: number;
};

type ZegoRoomConfig = {
  isUserStatusNotify?: boolean;
};

type ZegoEngine = {
  loginRoom(
    roomID: string,
    user: ZegoUser,
    config?: ZegoRoomConfig,
  ): Promise<{ errorCode: number }>;
  logoutRoom(roomID?: string): Promise<void>;
  startPublishingStream(streamID: string): void;
  stopPublishingStream(): void;
  startPlayingStream(streamID: string): void;
  stopPlayingStream(streamID: string): void;
  muteMicrophone(mute: boolean): void;
  enableSpeaker(enable: boolean): void;
  /** interval in milliseconds — enables sound-level callbacks */
  setSoundLevelDelegate(intervalMs: number): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback?: (...args: unknown[]) => void): void;
};

type ZegoExpressModule = {
  default: {
    createEngineWithProfile(profile: {
      appID: number;
      appSign: string;
      scenario: number;
    }): ZegoEngine;
    destroyEngine(): Promise<void>;
  };
};

// ─── Public Types ────────────────────────────────────────────────────────────

export type ZegoRoomOptions = {
  roomID: string;
  userID: string;
  userName: string;
  /** Deprecated — kept for backwards compat, no longer used internally */
  isHost?: boolean;
};

export type ZegoRoomReturn = {
  joined: boolean;
  muted: boolean;
  speakerOn: boolean;
  isPublishing: boolean;
  localSpeaking: boolean;
  speakingUsers: Record<string, boolean>;
  error: string | null;
  /**
   * True when this hook session was restored from a minimized engine rather
   * than created fresh. VoiceRoomScreen uses this flag to re-play remote
   * speaker streams that were already active before minimize (because
   * roomStreamUpdate ADD does not re-fire for pre-existing streams).
   */
  wasRestored: boolean;
  startPublishing: () => void;
  stopPublishing: () => void;
  toggleMic: () => void;
  toggleSpeaker: () => void;
  /** Directly set the mic muted state (used for host-driven remote mute). */
  setMicMuted: (muted: boolean) => void;
  muteRemoteUser: (userID: string) => void;
  playUserStream: (userID: string) => void;
  stopUserStream: (userID: string) => void;
};

// ─── Module-level persist (for minimize) ─────────────────────────────────────

type PersistedEngine = {
  engine: ZegoEngine;
  zego: ZegoExpressModule['default'];
  muted: boolean;
  published: boolean;
};

/** Set to true by VoiceRoomScreen.handleMinimize() before router.back(). */
let _isMinimized = false;
/** Holds the engine when screen is minimized so it isn't destroyed. */
let _persistedEngine: PersistedEngine | null = null;

/** Call before router.back() to keep the engine alive on minimize. */
export function setZegoMinimized(minimized: boolean): void {
  _isMinimized = minimized;
}

/** Returns the muted state of the persisted engine (for MinimizedRoomBar). */
export function getPersistedZegoMuted(): boolean {
  return _persistedEngine?.muted ?? false;
}

/**
 * Fully tear down the persisted engine.
 * Call from MinimizedRoomBar's close (X) button so audio stops
 * when the user discards the minimized room.
 */
export function destroyPersistedZegoEngine(): void {
  if (!_persistedEngine) return;
  const { engine, zego, published } = _persistedEngine;
  _persistedEngine = null;
  _isMinimized = false;
  if (published) {
    try { engine.stopPublishingStream(); } catch { /* non-critical */ }
  }
  try { engine.off('roomStreamUpdate'); } catch { /* non-critical */ }
  try { engine.off('remoteSoundLevelUpdate'); } catch { /* non-critical */ }
  try { engine.off('localSoundLevelUpdate'); } catch { /* non-critical */ }
  try { engine.off('IMRoomUserUpdate'); } catch { /* non-critical */ }
  (async () => {
    try { await engine.logoutRoom(); } catch { /* non-critical */ }
    try { await zego.destroyEngine(); } catch { /* non-critical */ }
  })();
}

// ─── Mic Permission Helper ───────────────────────────────────────────────────

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  try {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (already) return true;

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message:
          'Vee needs microphone access so you can speak in Voice Rooms.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
        buttonNeutral: 'Ask Later',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useZegoVoiceRoom(options: ZegoRoomOptions): ZegoRoomReturn {
  const engineRef      = useRef<ZegoEngine | null>(null);
  const zegoRef        = useRef<ZegoExpressModule['default'] | null>(null);
  const mountedRef     = useRef(true);
  const publishedRef   = useRef(false);
  const isCleaningUpRef = useRef(false);

  const [joined,        setJoined]        = useState(false);
  const [muted,         setMuted]         = useState(true);
  const [speakerOn,     setSpeakerOn]     = useState(true);
  /** True when the hook was initialized from a persisted (minimized) engine. */
  const [wasRestored,   setWasRestored]   = useState(false);

  const mutedRef    = useRef(true);
  const speakerOnRef = useRef(true);
  const [isPublishing,  setIsPublishing]  = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState<Record<string, boolean>>({});
  const [error,         setError]         = useState<string | null>(null);

  const myStreamID = `${options.roomID}_${options.userID}`;

  /* ══════════════════════════════════════════════
     ENGINE INIT + ROOM JOIN
  ══════════════════════════════════════════════ */
  useEffect(() => {
    mountedRef.current = true;
    isCleaningUpRef.current = false;

    if (!isZegoConfigured()) {
      return;
    }

    const roomID   = options.roomID;
    const userID   = options.userID;
    const userName = options.userName;

    // ── AppState handler (shared by restore and normal init paths) ────────
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const eng = engineRef.current;
      if (!eng) return;
      try {
        if (nextState === 'background' || nextState === 'inactive') {
          if (publishedRef.current) {
            eng.muteMicrophone(true);
          }
        } else if (nextState === 'active') {
          if (publishedRef.current) {
            eng.muteMicrophone(mutedRef.current);
            eng.enableSpeaker(speakerOnRef.current);
          }
        }
      } catch {
        // non-critical
      }
    };

    // ── Event registration helper (shared by restore and normal paths) ─────
    function registerEvents(engine: ZegoEngine) {
      engine.on('roomStreamUpdate', ((
        _rid: unknown,
        updateType: 'ADD' | 'DELETE',
        streamList: ZegoStream[],
      ) => {
        if (!mountedRef.current || !engineRef.current) return;
        if (updateType === 'ADD') {
          streamList.forEach(s => {
            if (s.user?.userID !== userID) {
              try { engineRef.current?.startPlayingStream(s.streamID); } catch { /* non-critical */ }
            }
          });
        } else if (updateType === 'DELETE') {
          streamList.forEach(s => {
            try { engineRef.current?.stopPlayingStream(s.streamID); } catch { /* non-critical */ }
            const uid = s.user?.userID ?? s.streamID.substring(roomID.length + 1);
            setSpeakingUsers(prev => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          });
        }
      }) as (...args: unknown[]) => void);

      engine.on('remoteSoundLevelUpdate', ((
        infoList: ZegoSoundLevelInfo[],
      ) => {
        if (!mountedRef.current) return;
        const updated: Record<string, boolean> = {};
        infoList.forEach(item => {
          let uid: string | undefined;
          if (item.streamID) {
            const prefix = `${roomID}_`;
            uid = item.streamID.startsWith(prefix)
              ? item.streamID.slice(prefix.length)
              : item.streamID;
          } else if (item.userID) {
            uid = item.userID;
          }
          if (uid) updated[uid] = item.soundLevel > 10;
        });
        if (Object.keys(updated).length > 0) {
          setSpeakingUsers(prev => ({ ...prev, ...updated }));
        }
      }) as (...args: unknown[]) => void);

      engine.on('localSoundLevelUpdate', ((soundLevel: number) => {
        if (!mountedRef.current) return;
        setLocalSpeaking(soundLevel > 10);
      }) as (...args: unknown[]) => void);

      engine.on('IMRoomUserUpdate', ((
        _rid: unknown,
        updateType: 'ADD' | 'DELETE',
        userList: ZegoUser[],
      ) => {
        if (!mountedRef.current || updateType !== 'DELETE') return;
        setSpeakingUsers(prev => {
          const next = { ...prev };
          userList.forEach(u => delete next[u.userID]);
          return next;
        });
      }) as (...args: unknown[]) => void);
    }

    // ── Normal cleanup helper ─────────────────────────────────────────────
    function performCleanup() {
      if (isCleaningUpRef.current) return;
      isCleaningUpRef.current = true;
      mountedRef.current = false;

      const engine  = engineRef.current;
      const ZegoSDK = zegoRef.current;
      engineRef.current = null;
      zegoRef.current   = null;

      if (engine) {
        try { engine.off('roomStreamUpdate'); } catch { /* non-critical */ }
        try { engine.off('remoteSoundLevelUpdate'); } catch { /* non-critical */ }
        try { engine.off('localSoundLevelUpdate'); } catch { /* non-critical */ }
        try { engine.off('IMRoomUserUpdate'); } catch { /* non-critical */ }

        if (publishedRef.current) {
          try { engine.stopPublishingStream(); } catch { /* non-critical */ }
          publishedRef.current = false;
        }

        (async () => {
          try { await engine.logoutRoom(roomID); } catch { /* non-critical */ }
          try { await ZegoSDK?.destroyEngine(); } catch { /* non-critical */ }
        })();
      }
    }

    // ── Restore from minimize (reuse persisted engine) ────────────────────
    if (_persistedEngine) {
      const persisted = _persistedEngine;
      _persistedEngine = null;
      _isMinimized = false;

      engineRef.current  = persisted.engine;
      zegoRef.current    = persisted.zego;
      publishedRef.current = persisted.published;
      setMuted(persisted.muted);
      mutedRef.current   = persisted.muted;
      setIsPublishing(persisted.published);
      setJoined(true);
      setError(null);
      // Signal to VoiceRoomScreen that it must re-play existing remote streams,
      // because roomStreamUpdate ADD will NOT re-fire for streams already active
      // before minimize — only new streams trigger that event.
      setWasRestored(true);

      // Re-register event listeners with fresh closures on this component instance
      persisted.engine.off('roomStreamUpdate');
      persisted.engine.off('remoteSoundLevelUpdate');
      persisted.engine.off('localSoundLevelUpdate');
      persisted.engine.off('IMRoomUserUpdate');
      registerEvents(persisted.engine);
    } else {
      // ── Normal init ──────────────────────────────────────────────────────
      (async () => {
        // Skip entirely in Expo Go — native ZEGO modules not available
        if (isExpoGo()) return;

        const hasMic = await requestMicPermission();
        if (!hasMic) {
          if (mountedRef.current) {
            setError('Microphone permission denied. Please allow it in Settings to speak in Voice Rooms.');
          }
        }

        if (!mountedRef.current) return;

        let ZegoSDK: ZegoExpressModule['default'];
        let engine: ZegoEngine;

        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mod = require('zego-express-engine-reactnative') as ZegoExpressModule;
          ZegoSDK = mod.default;
        } catch {
          return;
        }

        if (!mountedRef.current) return;

        try {
          engine = ZegoSDK.createEngineWithProfile({
            appID: ZEGO_CONFIG.appID,
            appSign: ZEGO_CONFIG.appSign,
            scenario: 1,
          });

          engineRef.current = engine;
          zegoRef.current   = ZegoSDK;

          engine.setSoundLevelDelegate(300);
          registerEvents(engine);

          const result = await engine.loginRoom(
            roomID,
            { userID, userName },
            { isUserStatusNotify: true },
          );

          if (!mountedRef.current) return;

          if (result.errorCode !== 0) {
            setError(`Room join failed (code: ${result.errorCode})`);
            return;
          }

          engine.enableSpeaker(true);
          setJoined(true);
          setError(null);

        } catch (err) {
          if (mountedRef.current) {
            setError(err instanceof Error ? err.message : 'ZEGOCLOUD error');
          }
        }
      })();
    }

    // ── AppState subscription (shared by both paths) ──────────────────────
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      appStateSub.remove();

      // Minimize path: save engine to module-level persist instead of destroying
      if (_isMinimized && engineRef.current) {
        _persistedEngine = {
          engine:    engineRef.current,
          zego:      zegoRef.current!,
          muted:     mutedRef.current,
          published: publishedRef.current,
        };
        engineRef.current = null;
        zegoRef.current   = null;
        mountedRef.current = false;
        return;
      }

      // Normal leave path: full teardown
      performCleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.roomID, options.userID, options.userName]);

  /* ══════════════════════════════════════════════
     PUBLISHING CONTROL
  ══════════════════════════════════════════════ */

  const startPublishing = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !mountedRef.current || publishedRef.current) return;
    try {
      engine.startPublishingStream(myStreamID);
      engine.muteMicrophone(true); // start muted
      publishedRef.current = true;
      setIsPublishing(true);
      setMuted(true);
      mutedRef.current = true;
    } catch {
      // non-critical
    }
  }, [myStreamID]);

  const stopPublishing = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !publishedRef.current) return;
    try {
      engine.stopPublishingStream();
      publishedRef.current = false;
      setIsPublishing(false);
      setLocalSpeaking(false);
    } catch {
      // non-critical
    }
  }, []);

  /* ══════════════════════════════════════════════
     MIC / SPEAKER
  ══════════════════════════════════════════════ */

  const toggleMic = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      // RC6 fix: call native SDK method OUTSIDE the state setter.
      // Calling engine.muteMicrophone() inside a setState updater is an
      // anti-pattern: if the native call throws, the exception escapes the
      // try/catch and propagates through React's reconciler, crashing the
      // ErrorBoundary. Use the ref for synchronous current-value tracking.
      const newMuted = !mutedRef.current;
      mutedRef.current = newMuted;
      engine.muteMicrophone(newMuted);
      setMuted(newMuted);
    } catch {
      // non-critical
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      // RC6 fix: same pattern — native call outside state setter to prevent
      // exception propagation through React's reconciler (crash source for
      // the speaker button crash reported in Issue 3).
      const newSpeaker = !speakerOnRef.current;
      speakerOnRef.current = newSpeaker;
      engine.enableSpeaker(newSpeaker);
      setSpeakerOn(newSpeaker);
    } catch {
      // non-critical
    }
  }, []);

  /* ══════════════════════════════════════════════
     REMOTE STREAM CONTROL (host/admin use)
  ══════════════════════════════════════════════ */

  const setMicMuted = useCallback((shouldMute: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.muteMicrophone(shouldMute);
      setMuted(shouldMute);
      mutedRef.current = shouldMute;
    } catch { /* non-critical */ }
  }, []);

  const muteRemoteUser = useCallback((userID: string) => {
    const sid = `${options.roomID}_${userID}`;
    try { engineRef.current?.stopPlayingStream(sid); } catch { /* non-critical */ }
  }, [options.roomID]);

  const playUserStream = useCallback((userID: string) => {
    const sid = `${options.roomID}_${userID}`;
    try { engineRef.current?.startPlayingStream(sid); } catch { /* non-critical */ }
  }, [options.roomID]);

  const stopUserStream = useCallback((userID: string) => {
    const sid = `${options.roomID}_${userID}`;
    try { engineRef.current?.stopPlayingStream(sid); } catch { /* non-critical */ }
  }, [options.roomID]);

  return {
    joined,
    muted,
    speakerOn,
    isPublishing,
    localSpeaking,
    speakingUsers,
    error,
    wasRestored,
    startPublishing,
    stopPublishing,
    toggleMic,
    toggleSpeaker,
    setMicMuted,
    muteRemoteUser,
    playUserStream,
    stopUserStream,
  };
}
