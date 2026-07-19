/**
 * Audio Call Route — RC6 Issue 8 fix
 *
 * Reads search-param props and renders the AudioCallScreen.
 * Both caller and callee land on this route (role param distinguishes them).
 *
 * Required params:
 *   roomId         — deterministic ZEGO room shared by both parties
 *   role           — 'caller' | 'callee'
 *   remoteUid      — UID of the other party
 *   remoteName     — display name of the other party
 *   calleeUid      — UID used for Firebase signaling cleanup
 *   myUid          — UID of the local user
 *   myName         — display name of the local user
 *
 * Optional params:
 *   remotePhotoURL — photo URL of the other party (for avatar display)
 */

import { useLocalSearchParams } from 'expo-router';
import AudioCallScreen from '@/src/features/audio-call/AudioCallScreen';

export default function AudioCallPage() {
  const {
    roomId,
    role,
    remoteUid,
    remoteName,
    remotePhotoURL,
    calleeUid,
    myUid,
    myName,
    myPhotoURL,
  } = useLocalSearchParams<{
    roomId: string;
    role: 'caller' | 'callee';
    remoteUid: string;
    remoteName: string;
    remotePhotoURL?: string;
    calleeUid: string;
    myUid: string;
    myName: string;
    myPhotoURL?: string;
  }>();

  return (
    <AudioCallScreen
      roomId={roomId ?? ''}
      role={role === 'callee' ? 'callee' : 'caller'}
      remoteUid={remoteUid ?? ''}
      remoteName={remoteName ?? 'Unknown'}
      remotePhotoURL={remotePhotoURL}
      calleeUid={calleeUid ?? ''}
      myUid={myUid ?? ''}
      myName={myName ?? 'Vee User'}
      myPhotoURL={myPhotoURL}
    />
  );
}
