/**
 * AudioCallScreen — RC6 Issue 8 fix
 *
 * Real 1-to-1 voice call using ZEGOCLOUD Express Engine.
 * Replaces the previous "coming soon" placeholder.
 *
 * Flow:
 *   Caller → navigates here → ZEGO join → initiateCall() → show "Ringing..."
 *   Callee → accepts IncomingCallModal → navigates here → ZEGO join
 *   Both   → roomStreamUpdate ADD fires → call connected → timer starts
 *   Either → taps End → ZEGO cleanup + Firebase signal removed → router.back()
 *   Either → remote disconnects → roomStreamUpdate DELETE → auto end after 1.5s
 *
 * Safety rules (same pattern as useZegoVoiceRoom RC6 fix):
 *   • Native SDK calls (muteMicrophone, enableSpeaker) happen OUTSIDE setState
 *     callbacks — never inside updater functions.
 *   • Cleanup guard (cleaningUpRef) prevents double-destroy crashes.
 *   • All state setters guard on mountedRef before executing.
 */

import React, {
  useEffect, useRef, useState, useCallback,
} from 'react';
import {
  View, Text, Pressable, Image, StatusBar,
  Platform, PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ZEGO_CONFIG, isZegoConfigured } from '@/src/config/zegocloud';
import { initiateCall, removeCallSignal } from './services/firebaseCallService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isExpoGo(): boolean {
  try {
    return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  } catch {
    return false;
  }
}

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (already) return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'Vee needs microphone access for voice calls.',
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

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CallState = 'ringing' | 'connecting' | 'connected' | 'ended';

type ZegoStream = { streamID: string; user: { userID: string } };

// Minimal ZEGO engine type surface needed for 1-to-1 audio
type ZegoEngine = {
  loginRoom(
    roomID: string,
    user: { userID: string; userName: string },
    config?: { isUserStatusNotify?: boolean },
  ): Promise<{ errorCode: number }>;
  logoutRoom(roomID?: string): Promise<void>;
  startPublishingStream(streamID: string): void;
  stopPublishingStream(): void;
  startPlayingStream(streamID: string): void;
  stopPlayingStream(streamID: string): void;
  muteMicrophone(mute: boolean): void;
  enableSpeaker(enable: boolean): void;
  setSoundLevelDelegate(intervalMs: number): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback?: (...args: unknown[]) => void): void;
};

type ZegoSDKType = {
  createEngineWithProfile(profile: {
    appID: number;
    appSign: string;
    scenario: number;
  }): ZegoEngine;
  destroyEngine(): Promise<void>;
};

// ─── Props ────────────────────────────────────────────────────────────────────

export type AudioCallProps = {
  /** Deterministic room ID shared by both parties: buildCallRoomId(uidA, uidB) */
  roomId: string;
  /** 'caller' = initiated the call; 'callee' = accepted the call */
  role: 'caller' | 'callee';
  remoteUid: string;
  remoteName: string;
  remotePhotoURL?: string;
  /** Firebase UID of the call recipient — used to remove the signaling node */
  calleeUid: string;
  myUid: string;
  myName: string;
  /** Caller's own photo URL — sent in the Firebase signal so callee's
   *  IncomingCallModal can show the caller's avatar. */
  myPhotoURL?: string;
};

// ─── Component ───────────────────────────────────────────────────────────────

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.55)',
  green: '#22C55E',
  red: '#EF4444',
  border: 'rgba(139,92,246,0.3)',
} as const;

export default function AudioCallScreen({
  roomId, role,
  remoteUid, remoteName, remotePhotoURL,
  calleeUid, myUid, myName, myPhotoURL,
}: AudioCallProps) {
  const router = useRouter();

  // ── Refs ──────────────────────────────────────────────────────────────────
  const engineRef      = useRef<ZegoEngine | null>(null);
  const zegoRef        = useRef<ZegoSDKType | null>(null);
  const mountedRef     = useRef(true);
  const publishedRef   = useRef(false);
  const cleaningUpRef  = useRef(false);
  const callStateRef   = useRef<CallState>(role === 'caller' ? 'ringing' : 'connecting');
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedRef       = useRef(false);
  const speakerOnRef   = useRef(true);

  // ── State ──────────────────────────────────────────────────────────────────
  const [callState, setCallState] = useState<CallState>(callStateRef.current);
  const [muted,     setMuted]     = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [elapsed,   setElapsed]   = useState(0);

  const myStreamId     = `${roomId}_${myUid}`;
  const remoteStreamId = `${roomId}_${remoteUid}`;

  // ── Safe state setters (guard on mountedRef) ──────────────────────────────
  const updateCallState = useCallback((state: CallState) => {
    callStateRef.current = state;
    if (mountedRef.current) setCallState(state);
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      if (mountedRef.current) setElapsed(e => e + 1);
    }, 1000);
  }, []);

  // ── End call (cleanup + navigate back) ───────────────────────────────────
  const endCall = useCallback((goBack = true) => {
    if (cleaningUpRef.current) return;
    cleaningUpRef.current = true;

    // Stop timers
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

    // Remove Firebase signaling (caller removes it; callee already removed on accept)
    if (role === 'caller') {
      removeCallSignal(calleeUid).catch(() => {});
    }

    // ZEGO teardown
    const engine = engineRef.current;
    const zego   = zegoRef.current;
    engineRef.current = null;
    zegoRef.current   = null;
    mountedRef.current = false;

    if (engine) {
      try { engine.off('roomStreamUpdate'); }   catch { /* non-critical */ }
      try { engine.off('remoteSoundLevelUpdate'); } catch { /* non-critical */ }
      if (publishedRef.current) {
        try { engine.stopPublishingStream(); } catch { /* non-critical */ }
        publishedRef.current = false;
      }
      (async () => {
        try { await engine.logoutRoom(roomId); }  catch { /* non-critical */ }
        try { await zego?.destroyEngine(); }      catch { /* non-critical */ }
      })();
    }

    if (goBack) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.back();
    }
  }, [role, calleeUid, roomId, router]);

  // ── ZEGO engine init ──────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current   = true;
    cleaningUpRef.current = false;

    if (!isZegoConfigured() || isExpoGo()) return;

    (async () => {
      await requestMicPermission();
      if (!mountedRef.current) return;

      let ZegoSDK: ZegoSDKType;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('zego-express-engine-reactnative') as { default: ZegoSDKType };
        ZegoSDK = mod.default;
      } catch {
        return;
      }

      if (!mountedRef.current) return;

      let engine: ZegoEngine;
      try {
        engine = ZegoSDK.createEngineWithProfile({
          appID:    ZEGO_CONFIG.appID,
          appSign:  ZEGO_CONFIG.appSign,
          scenario: 1,
        });
        engineRef.current = engine;
        zegoRef.current   = ZegoSDK;

        engine.setSoundLevelDelegate(300);

        // ── Remote stream events ─────────────────────────────────────────
        engine.on('roomStreamUpdate', ((
          _rid: unknown,
          updateType: 'ADD' | 'DELETE',
          streamList: ZegoStream[],
        ) => {
          if (!mountedRef.current || !engineRef.current) return;
          if (updateType === 'ADD') {
            streamList.forEach(s => {
              if (s.user?.userID !== myUid) {
                try { engineRef.current?.startPlayingStream(s.streamID); } catch { /* non-critical */ }
                // Call connected — start timer
                updateCallState('connected');
                startTimer();
                // Cancel ringing timeout now that connection is established
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                  timeoutRef.current = null;
                }
              }
            });
          } else if (updateType === 'DELETE') {
            // Remote party left — show 'ended', then navigate back
            streamList.forEach(s => {
              if (s.user?.userID !== myUid) {
                updateCallState('ended');
                // Short delay so user can read "Call Ended" before dismissal
                timeoutRef.current = setTimeout(() => {
                  if (mountedRef.current) endCall(true);
                }, 1500);
              }
            });
          }
        }) as (...args: unknown[]) => void);

        // ── Login room ───────────────────────────────────────────────────
        const result = await engine.loginRoom(
          roomId,
          { userID: myUid, userName: myName },
          { isUserStatusNotify: true },
        );

        if (!mountedRef.current) return;
        if (result.errorCode !== 0) { endCall(true); return; }

        engine.enableSpeaker(true);

        // Start publishing (begin transmitting audio)
        engine.startPublishingStream(myStreamId);
        engine.muteMicrophone(false); // calls start unmuted
        publishedRef.current = true;

        // Caller: write Firebase signal so callee receives IncomingCallModal
        if (role === 'caller') {
          try {
            await initiateCall(calleeUid, {
              callerId:        myUid,
              callerName:      myName,
              // RC6 fix Issue 8: include caller's photo so callee's
              // IncomingCallModal shows the caller's avatar, not just initials.
              ...(myPhotoURL ? { callerPhotoURL: myPhotoURL } : {}),
              roomId,
            });
          } catch { /* non-critical — ZEGO is already joined */ }

          // Ringing timeout: if callee never joins within 45 s, hang up
          timeoutRef.current = setTimeout(() => {
            if (mountedRef.current && callStateRef.current !== 'connected') {
              endCall(true);
            }
          }, 45_000);
        }

      } catch {
        if (mountedRef.current) endCall(true);
      }
    })();

    return () => {
      if (!cleaningUpRef.current) endCall(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUid, myName]);

  // ── Mic toggle ────────────────────────────────────────────────────────────
  // RC6 fix pattern: native SDK call OUTSIDE setState callback
  const handleToggleMic = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const newMuted = !mutedRef.current;
      mutedRef.current = newMuted;
      engine.muteMicrophone(newMuted);
      setMuted(newMuted);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { /* non-critical */ }
  }, []);

  // ── Speaker toggle ────────────────────────────────────────────────────────
  const handleToggleSpeaker = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const newSpeaker = !speakerOnRef.current;
      speakerOnRef.current = newSpeaker;
      engine.enableSpeaker(newSpeaker);
      setSpeakerOn(newSpeaker);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { /* non-critical */ }
  }, []);

  // ── End call button ───────────────────────────────────────────────────────
  const handleEndCall = useCallback(() => {
    endCall(true);
  }, [endCall]);

  // ── Status text ───────────────────────────────────────────────────────────
  const statusText =
    callState === 'ringing'    ? 'Ringing...'
    : callState === 'connecting' ? 'Connecting...'
    : callState === 'ended'      ? 'Call Ended'
    : formatElapsed(elapsed);

  const statusColor =
    callState === 'connected' ? C.green
    : callState === 'ended'   ? C.red
    : C.muted;

  const topPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView
        style={{
          flex: 1, alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: topPad + 20, paddingBottom: 48,
        }}
        edges={['top', 'bottom']}
      >

        {/* ── Remote party info ── */}
        <View style={{ alignItems: 'center', marginTop: 32 }}>
          {/* Avatar */}
          <View style={{
            width: 120, height: 120, borderRadius: 60,
            backgroundColor: 'rgba(124,58,237,0.25)',
            borderWidth: 3, borderColor: C.glow,
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            shadowColor: C.glow, shadowOpacity: 0.45,
            shadowRadius: 28, shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}>
            {remotePhotoURL ? (
              <Image
                source={{ uri: remotePhotoURL }}
                style={{ width: 120, height: 120, borderRadius: 60 }}
              />
            ) : (
              <Text style={{ color: C.text, fontSize: 44, fontWeight: '900' }}>
                {remoteName[0]?.toUpperCase() ?? '?'}
              </Text>
            )}
          </View>

          {/* Name */}
          <Text style={{
            color: C.text, fontSize: 28, fontWeight: '900',
            marginTop: 22, letterSpacing: 0.2,
          }}>
            {remoteName}
          </Text>

          {/* Status / timer */}
          <Text style={{
            color: statusColor, fontSize: 15,
            fontWeight: callState === 'connected' ? '700' : '500',
            marginTop: 8,
          }}>
            {statusText}
          </Text>
        </View>

        {/* ── Call controls ── */}
        <View style={{ alignItems: 'center', gap: 36, width: '100%' }}>
          {/* Mic + Speaker row */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 32 }}>
            {/* Mute / Unmute */}
            <Pressable
              onPress={handleToggleMic}
              hitSlop={10}
              style={{
                width: 68, height: 68, borderRadius: 34,
                backgroundColor: muted
                  ? C.primary
                  : 'rgba(255,255,255,0.10)',
                borderWidth: 1.5,
                borderColor: muted ? C.glow : 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: muted ? C.glow : 'transparent',
                shadowOpacity: 0.5, shadowRadius: 14,
              }}
            >
              <Feather name={muted ? 'mic-off' : 'mic'} size={26} color={C.text} />
            </Pressable>

            {/* Speaker toggle */}
            <Pressable
              onPress={handleToggleSpeaker}
              hitSlop={10}
              style={{
                width: 68, height: 68, borderRadius: 34,
                backgroundColor: !speakerOn
                  ? C.primary
                  : 'rgba(255,255,255,0.10)',
                borderWidth: 1.5,
                borderColor: !speakerOn ? C.glow : 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: !speakerOn ? C.glow : 'transparent',
                shadowOpacity: 0.5, shadowRadius: 14,
              }}
            >
              <Feather name={speakerOn ? 'volume-2' : 'volume-x'} size={26} color={C.text} />
            </Pressable>
          </View>

          {/* End call */}
          <Pressable
            onPress={handleEndCall}
            hitSlop={8}
            style={{
              width: 76, height: 76, borderRadius: 38,
              backgroundColor: C.red,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: C.red, shadowOpacity: 0.65,
              shadowRadius: 22, shadowOffset: { width: 0, height: 6 },
              elevation: 12,
            }}
          >
            <Feather name="phone-off" size={30} color={C.text} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
