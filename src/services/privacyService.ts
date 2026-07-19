/**
 * Privacy Service
 * Reads users/{uid}/privacy settings and provides helper functions to
 * enforce them before performing messaging, presence, and invite actions.
 *
 * Default: all settings ON (most permissive) so new/missing privacy nodes
 * never accidentally lock users out.
 */

import { get, ref } from 'firebase/database';
import { database } from '../config/firebase';

export type PrivacySettings = {
  /** Whether other users can see this user's online dot. Default: true */
  showOnlineStatus: boolean;
  /** Whether other users can see this user's last-seen timestamp. Default: true */
  showLastSeen: boolean;
  /** Whether any user can send a direct message. Default: true */
  allowMessageFromAll: boolean;
  /** Whether any user can send a room invite. Default: true */
  allowRoomInvites: boolean;
  /** Who can view the full profile. Default: 'everyone' */
  profileVisibility: 'everyone' | 'followers' | 'none';
};

const DEFAULT_PRIVACY: PrivacySettings = {
  showOnlineStatus: true,
  showLastSeen: true,
  allowMessageFromAll: true,
  allowRoomInvites: true,
  profileVisibility: 'everyone',
};

/**
 * Fetch the privacy settings for a user. Returns defaults on any error or
 * when the node doesn't exist (new users start fully open).
 */
export async function getUserPrivacy(uid: string): Promise<PrivacySettings> {
  try {
    const snap = await get(ref(database, `users/${uid}/privacy`));
    if (!snap.exists()) return { ...DEFAULT_PRIVACY };
    const raw = snap.val() as Partial<PrivacySettings>;
    return { ...DEFAULT_PRIVACY, ...raw };
  } catch {
    return { ...DEFAULT_PRIVACY };
  }
}

/**
 * True if callers may display this user's online status.
 * Always returns true for the user themselves (self-view).
 */
export async function canViewOnlineStatus(targetUid: string): Promise<boolean> {
  const p = await getUserPrivacy(targetUid);
  return p.showOnlineStatus;
}

/**
 * True if callers may display this user's last-seen timestamp.
 */
export async function canViewLastSeen(targetUid: string): Promise<boolean> {
  const p = await getUserPrivacy(targetUid);
  return p.showLastSeen;
}

/**
 * True if the target allows incoming direct messages from any user.
 */
export async function canSendMessage(targetUid: string): Promise<boolean> {
  const p = await getUserPrivacy(targetUid);
  return p.allowMessageFromAll;
}

/**
 * True if the target allows incoming room invites.
 */
export async function canReceiveRoomInvite(targetUid: string): Promise<boolean> {
  const p = await getUserPrivacy(targetUid);
  return p.allowRoomInvites;
}
