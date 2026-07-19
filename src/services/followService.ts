/**
 * Follow Service — Firebase Realtime Database
 *
 * DB Structure:
 *   following/{uid}/{targetUid} → true
 *   followers/{uid}/{followerUid} → true
 *
 * NOTE: There is no denormalized `users/{uid}/following|followers` counter.
 * A denormalized counter used to be written here via
 * `update(ref(database, 'users/{otherUid}'), { followers: increment(1) })`,
 * but `database.rules.json` only allows a user to write their OWN
 * `users/$uid` node (`auth.uid === $uid`) — writing a follower's counter
 * onto the *target* user's node is a different uid and was always rejected
 * with PERMISSION_DENIED. That is why follow used to throw an error.
 * Nothing in the app reads that denormalized field (subscribeFollowCounts()
 * below counts live keys instead), so the fix is to drop those writes
 * entirely rather than relax security rules.
 *
 * Counter strategy:
 *   runTransaction() on the canonical following/{myUid}/{targetUid} edge makes
 *   follow/unfollow idempotent — the edge is only set/cleared when it
 *   actually changes (null→true or true→null), so duplicate taps or retried
 *   network calls can't create inconsistent state.
 *
 *   subscribeFollowCounts() counts actual keys in following/followers nodes
 *   and is the sole, authoritative source for displayed counts.
 */

import {
  ref, set, remove, get, onValue, runTransaction,
} from 'firebase/database';
import { database } from '../config/firebase';

/** Follow a user. Idempotent — repeated calls while already following are no-ops. */
export async function followUser(myUid: string, targetUid: string): Promise<void> {
  const followingRef = ref(database, `following/${myUid}/${targetUid}`);

  // runTransaction is atomic: if the edge already exists the transaction aborts
  // and we skip all writes, making repeated calls fully idempotent.
  const txResult = await runTransaction(followingRef, (current) => {
    if (current !== null) return undefined; // already following — abort
    return true;                            // not following — set edge
  });

  if (!txResult.committed) return; // already following — nothing to do

  // Edge was newly created — mirror the symmetric entry so the target user's
  // followers/{targetUid}/{myUid} list picks it up. Per database.rules.json,
  // `followers/$uid/$followerUid` is writable by auth.uid === $followerUid,
  // i.e. by me — so this write (unlike the removed users/{targetUid} write) is allowed.
  await set(ref(database, `followers/${targetUid}/${myUid}`), true);
}

/** Unfollow a user. Idempotent — repeated calls while not following are no-ops. */
export async function unfollowUser(myUid: string, targetUid: string): Promise<void> {
  const followingRef = ref(database, `following/${myUid}/${targetUid}`);

  const txResult = await runTransaction(followingRef, (current) => {
    if (current === null) return undefined; // not following — abort
    return null;                            // following — remove edge
  });

  if (!txResult.committed) return; // not following — nothing to do

  await remove(ref(database, `followers/${targetUid}/${myUid}`));
}

/** Check if myUid follows targetUid (one-time read). */
export async function isFollowing(myUid: string, targetUid: string): Promise<boolean> {
  const snap = await get(ref(database, `following/${myUid}/${targetUid}`));
  return snap.exists();
}

/**
 * Subscribe to following/followers counts for a user.
 * Counts actual keys in the following/followers nodes — this is the
 * authoritative source, independent of the denormalized user counters.
 */
export function subscribeFollowCounts(
  uid: string,
  callback: (counts: { followers: number; following: number }) => void,
): () => void {
  let followers = 0;
  let following = 0;
  let fired = false;

  const emit = () => callback({ followers, following });

  const unsubFollowers = onValue(ref(database, `followers/${uid}`), (snap) => {
    followers = snap.exists() ? Object.keys(snap.val()).length : 0;
    if (fired) emit();
  });

  const unsubFollowing = onValue(ref(database, `following/${uid}`), (snap) => {
    following = snap.exists() ? Object.keys(snap.val()).length : 0;
    fired = true;
    emit();
  });

  return () => {
    unsubFollowers();
    unsubFollowing();
  };
}

/** Subscribe to whether myUid follows targetUid. */
export function subscribeIsFollowing(
  myUid: string,
  targetUid: string,
  callback: (following: boolean) => void,
): () => void {
  return onValue(ref(database, `following/${myUid}/${targetUid}`), (snap) => {
    callback(snap.exists());
  });
}
