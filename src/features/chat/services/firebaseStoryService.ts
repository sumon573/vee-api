/**
 * Firebase Story Service — ধাপ ৫
 * Stories: 24 ঘণ্টা পর auto-expire।
 *
 * DB Structure (RC8-A):
 *   stories/{uid}/{storyId}        → PUBLIC stories (privacy === 'public')
 *   contactStories/{uid}/{storyId} → CONTACTS-ONLY stories (privacy === 'contacts')
 *   publicStoryIndex/{uid}         → true (flag: user has ≥1 active public story)
 *
 * RC8-A security changes:
 *   - Contacts-only stories are now written to a separate `contactStories/` path
 *     that has friend-gated read rules in database.rules.json. Previously, all
 *     stories lived in `stories/` with only client-side privacy filtering, meaning
 *     any authenticated user could read contacts-only content by querying the DB
 *     directly. The new path provides true server-side enforcement.
 *
 *   - `subscribeAllStories` now maintains subscriptions to both `stories/` (public,
 *     via publicStoryIndex) and `contactStories/` (per-contact, dynamic).
 *
 * RC8-B2 scalability improvements:
 *   - subscribeAllStories: replaced `stories/` root subscription with per-UID
 *     subscriptions driven by `publicStoryIndex/`. Reduces downloaded data from
 *     O(all_stories) to O(stories_by_users_with_active_stories). Also replaced
 *     static contact snapshot at subscription time with a live `friends/{viewerUid}`
 *     subscription so newly-added friends' contact stories appear immediately.
 *
 *   - subscribePlanetStories: same publicStoryIndex-driven optimization.
 *
 *   - Story comments: changed from array [] anti-pattern to map {} structure with
 *     Firebase push keys. parseStory now correctly parses from map. addStoryComment()
 *     and subscribeStoryComments() added.
 */

import {
  ref, push, set, update, remove,
  onValue, get, serverTimestamp, runTransaction,
} from 'firebase/database';
import { database } from '@/src/config/firebase';
import { Story, StoryComment, UserStories } from '../types';

// ─── Publish ─────────────────────────────────────────────────────────────────

export interface PublishPayload {
  type: 'text' | 'image';
  content: string;                 // text string or Cloudinary URL
  bgGradient: [string, string];
  mentions: string[];
  cloudinaryId?: string;
  textColor?: string;
  /** 'public' → visible to everyone in Planet feed; 'contacts' → only friends can see */
  privacy?: 'public' | 'contacts';
}

export async function publishStory(
  uid: string,
  userName: string,
  userAvatar: string | undefined,
  payload: PublishPayload,
): Promise<string> {
  const privacy = payload.privacy ?? 'public';
  // RC8-A: contacts-only stories go to a separate secured path
  const basePath = privacy === 'contacts' ? 'contactStories' : 'stories';
  const storiesRef = ref(database, `${basePath}/${uid}`);
  const newRef = push(storiesRef);

  const now = Date.now();
  const story: Omit<Story, 'id' | 'createdAt'> & { createdAt: object } = {
    userId: uid,
    userName,
    ...(userAvatar ? { userAvatar } : {}),
    type: payload.type,
    content: payload.content,
    bgGradient: payload.bgGradient,
    textColor: payload.textColor ?? '#FFFFFF',
    mentions: payload.mentions,
    createdAt: serverTimestamp() as object,
    expiresAt: now + 24 * 60 * 60 * 1000,   // 24h
    viewCount: 0,
    reactions: {},
    // RC8-B2: comments stored as map {} not array [] to support Firebase push keys
    comments: {} as unknown as StoryComment[],
    privacy,
    ...(payload.cloudinaryId ? { cloudinaryId: payload.cloudinaryId } : {}),
  };

  await set(newRef, story);

  // Update hasActiveStory flag for story-ring avatar
  const metaUpdates: Record<string, unknown> = { hasActiveStory: true };
  await update(ref(database, `users/${uid}`), metaUpdates);

  // RC8-A: maintain publicStoryIndex for Planet feed optimisation.
  // Only written for public stories; contacts stories are never indexed here.
  if (privacy !== 'contacts') {
    await set(ref(database, `publicStoryIndex/${uid}`), true);
  }

  return newRef.key!;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a raw Firebase story snapshot value into a Story object. */
function parseStory(storySnap: { key: string | null; val(): unknown }): Story | null {
  const v = storySnap.val() as Record<string, unknown>;
  const expiresAt = (v.expiresAt as number) ?? 0;
  if (expiresAt < Date.now()) return null; // expired

  // RC8-B2: parse comments from map structure (was hardcoded [])
  const rawComments = v.comments as Record<string, unknown> | null;
  const comments: StoryComment[] = [];
  if (rawComments && typeof rawComments === 'object' && !Array.isArray(rawComments)) {
    Object.entries(rawComments).forEach(([id, c]) => {
      if (c && typeof c === 'object') {
        const comment = c as Record<string, unknown>;
        comments.push({
          id,
          userId: comment.userId as string,
          userName: comment.userName as string,
          userAvatar: comment.userAvatar as string | undefined,
          text: comment.text as string,
          ts: (comment.ts as number) ?? 0,
        });
      }
    });
    comments.sort((a, b) => a.ts - b.ts);
  }

  return {
    id: storySnap.key!,
    userId: v.userId as string,
    userName: v.userName as string,
    userAvatar: v.userAvatar as string | undefined,
    type: (v.type as 'text' | 'image') ?? 'text',
    content: (v.content as string) ?? '',
    bgGradient: (v.bgGradient as [string, string]) ?? ['#7C3AED', '#A855F7'],
    textColor: (v.textColor as string) ?? '#FFFFFF',
    mentions: (v.mentions as string[]) ?? [],
    createdAt: (v.createdAt as number) ?? Date.now(),
    expiresAt,
    viewCount: (v.viewCount as number) ?? 0,
    reactions: (v.reactions as Record<string, string>) ?? {},
    comments,
    cloudinaryId: v.cloudinaryId as string | undefined,
    privacy: ((v.privacy as string) === 'contacts' ? 'contacts' : 'public'),
  };
}

/** Determine which DB path a story lives in (for operations that need to write back). */
async function resolveStoryPath(
  authorUid: string,
  storyId: string,
): Promise<'stories' | 'contactStories' | null> {
  const [pubSnap, conSnap] = await Promise.all([
    get(ref(database, `stories/${authorUid}/${storyId}`)),
    get(ref(database, `contactStories/${authorUid}/${storyId}`)),
  ]);
  if (pubSnap.exists()) return 'stories';
  if (conSnap.exists()) return 'contactStories';
  return null;
}

// ─── Subscribe ────────────────────────────────────────────────────────────────

/**
 * Real-time subscription to ALL active (non-expired) stories.
 *
 * RC8-B2 optimization: instead of subscribing to the entire `stories/` root
 * (which downloads data for every user who ever posted a story), this function:
 *
 *   PUBLIC PART — subscribes to `publicStoryIndex/` (a tiny metadata node) and
 *   then sets up per-UID `stories/{uid}` listeners ONLY for users who currently
 *   have active public stories. Firebase listeners are added/removed dynamically
 *   as the index changes. Previously this was one listener on the entire tree.
 *
 *   CONTACT PART — subscribes to `friends/{viewerUid}` in real-time so newly-
 *   added friends' contact stories appear immediately without a component re-mount.
 *   Previously the contact UID list was a static snapshot taken at subscription
 *   time, so new friends' stories were missed until the screen was re-opened.
 *
 * @param options.viewerUid  The uid of the current viewer.
 * @param options.getContactUids  A *getter* returning the current set of contact
 *   uids — called on each public-stories update so privacy filtering uses the
 *   live contact list for grandfathered contacts-only stories in `stories/`.
 */
export function subscribeAllStories(
  callback: (groups: UserStories[]) => void,
  options?: { viewerUid?: string; getContactUids?: () => Set<string> },
): () => void {
  const { viewerUid, getContactUids } = options ?? {};

  // ── State shared between both subscriptions ──────────────────────────────
  const publicGroupsMap  = new Map<string, UserStories>();
  const contactGroupsMap = new Map<string, UserStories>();

  function mergeAndEmit() {
    // Merge public and contact maps, deduplicating stories by id
    const merged = new Map<string, UserStories>(publicGroupsMap);
    contactGroupsMap.forEach((contactGroup, uid) => {
      const existing = merged.get(uid);
      if (existing) {
        const seen = new Set(existing.stories.map((s) => s.id));
        const extra = contactGroup.stories.filter((s) => !seen.has(s.id));
        if (extra.length > 0) {
          const combined = [...existing.stories, ...extra];
          combined.sort((a, b) => b.createdAt - a.createdAt);
          merged.set(uid, { ...existing, stories: combined });
        }
      } else if (contactGroup.stories.length > 0) {
        merged.set(uid, contactGroup);
      }
    });

    const groups = Array.from(merged.values())
      .filter((g) => g.stories.length > 0)
      .sort((a, b) => (b.stories[0]?.createdAt ?? 0) - (a.stories[0]?.createdAt ?? 0));

    callback(groups);
  }

  // ── Part 1: public stories via publicStoryIndex (RC8-B2 optimization) ────
  //
  // Subscribe to publicStoryIndex/ (tiny metadata) rather than stories/ (full data).
  // Per-UID listeners are created/destroyed dynamically as the index changes.
  const perUidPublicUnsubs = new Map<string, () => void>();

  const indexUnsub = onValue(ref(database, 'publicStoryIndex'), (indexSnap) => {
    const activeUids = new Set<string>();
    if (indexSnap.exists()) {
      indexSnap.forEach((child) => { if (child.key) activeUids.add(child.key); });
    }

    // Remove subscriptions for UIDs no longer in index
    for (const [uid, unsub] of perUidPublicUnsubs) {
      if (!activeUids.has(uid)) {
        unsub();
        perUidPublicUnsubs.delete(uid);
        publicGroupsMap.delete(uid);
      }
    }

    // Add subscriptions for new UIDs
    for (const uid of activeUids) {
      if (!perUidPublicUnsubs.has(uid)) {
        const unsub = onValue(ref(database, `stories/${uid}`), (userSnap) => {
          const stories: Story[] = [];
          if (userSnap.exists()) {
            userSnap.forEach((storySnap) => {
              const story = parseStory(storySnap);
              if (!story) return;
              // Client-side filter for grandfathered contacts stories still in stories/
              if (story.privacy === 'contacts') {
                const isOwn = viewerUid && uid === viewerUid;
                const isContact = getContactUids?.().has(uid);
                if (!isOwn && !isContact) return;
              }
              stories.push(story);
            });
          }
          stories.sort((a, b) => b.createdAt - a.createdAt);
          if (stories.length > 0) {
            publicGroupsMap.set(uid, {
              userId: uid,
              userName: stories[0].userName,
              userAvatar: stories[0].userAvatar,
              stories,
              allSeen: false,
            });
          } else {
            publicGroupsMap.delete(uid);
          }
          mergeAndEmit();
        });
        perUidPublicUnsubs.set(uid, unsub);
      }
    }

    mergeAndEmit();
  });

  // ── Part 2: dynamic friends subscription for contact stories (RC8-B2) ────
  //
  // Subscribe to friends/{viewerUid} so new friends' contact stories appear
  // immediately (was: static snapshot taken once at subscription time).
  const contactUnsubs = new Map<string, () => void>();
  let friendsUnsub: (() => void) | null = null;

  if (viewerUid) {
    friendsUnsub = onValue(ref(database, `friends/${viewerUid}`), (friendsSnap) => {
      // Always include the viewer's own contact stories
      const currentUids = new Set<string>([viewerUid]);
      if (friendsSnap.exists()) {
        friendsSnap.forEach((child) => { if (child.key) currentUids.add(child.key); });
      }

      // Remove subscriptions for UIDs no longer in friends list
      for (const [uid, unsub] of contactUnsubs) {
        if (!currentUids.has(uid)) {
          unsub();
          contactUnsubs.delete(uid);
          contactGroupsMap.delete(uid);
        }
      }

      // Add subscriptions for new UIDs
      for (const uid of currentUids) {
        if (!contactUnsubs.has(uid)) {
          const unsub = onValue(ref(database, `contactStories/${uid}`), (snap) => {
            if (!snap.exists()) {
              contactGroupsMap.delete(uid);
            } else {
              const stories: Story[] = [];
              snap.forEach((storySnap) => {
                const story = parseStory(storySnap);
                if (story) stories.push(story);
              });
              stories.sort((a, b) => b.createdAt - a.createdAt);
              if (stories.length > 0) {
                contactGroupsMap.set(uid, {
                  userId: uid,
                  userName: stories[0].userName,
                  userAvatar: stories[0].userAvatar,
                  stories,
                  allSeen: false,
                });
              } else {
                contactGroupsMap.delete(uid);
              }
            }
            mergeAndEmit();
          });
          contactUnsubs.set(uid, unsub);
        }
      }

      mergeAndEmit();
    });
  }

  return () => {
    indexUnsub();
    for (const unsub of perUidPublicUnsubs.values()) unsub();
    friendsUnsub?.();
    for (const unsub of contactUnsubs.values()) unsub();
  };
}

/**
 * Real-time subscription to public-only stories (for the Planet feed).
 *
 * RC8-B2 optimization: uses publicStoryIndex/-driven per-UID subscriptions
 * instead of subscribing to the entire `stories/` tree.
 */
export function subscribePlanetStories(
  callback: (groups: UserStories[]) => void,
): () => void {
  const perUidUnsubs = new Map<string, () => void>();
  const storiesMap   = new Map<string, UserStories>();

  function emit() {
    const groups = Array.from(storiesMap.values())
      .filter((g) => g.stories.length > 0)
      .sort((a, b) => (b.stories[0]?.createdAt ?? 0) - (a.stories[0]?.createdAt ?? 0));
    callback(groups);
  }

  const indexUnsub = onValue(ref(database, 'publicStoryIndex'), (indexSnap) => {
    const activeUids = new Set<string>();
    if (indexSnap.exists()) {
      indexSnap.forEach((child) => { if (child.key) activeUids.add(child.key); });
    }

    // Remove subscriptions for UIDs no longer in index
    for (const [uid, unsub] of perUidUnsubs) {
      if (!activeUids.has(uid)) {
        unsub();
        perUidUnsubs.delete(uid);
        storiesMap.delete(uid);
      }
    }

    // Add subscriptions for new UIDs
    for (const uid of activeUids) {
      if (!perUidUnsubs.has(uid)) {
        const unsub = onValue(ref(database, `stories/${uid}`), (userSnap) => {
          const stories: Story[] = [];
          if (userSnap.exists()) {
            userSnap.forEach((storySnap) => {
              const story = parseStory(storySnap);
              if (!story || story.privacy === 'contacts') return; // planet = public only
              stories.push(story);
            });
          }
          stories.sort((a, b) => b.createdAt - a.createdAt);
          if (stories.length > 0) {
            storiesMap.set(uid, {
              userId: uid,
              userName: stories[0].userName,
              userAvatar: stories[0].userAvatar,
              stories,
              allSeen: false,
            });
          } else {
            storiesMap.delete(uid);
          }
          emit();
        });
        perUidUnsubs.set(uid, unsub);
      }
    }

    emit();
  });

  return () => {
    indexUnsub();
    for (const unsub of perUidUnsubs.values()) unsub();
  };
}

/** Subscribe to a single user's stories (both public and contacts paths). */
export function subscribeMyStories(
  uid: string,
  callback: (stories: Story[]) => void,
): () => void {
  let publicStories:  Story[] = [];
  let contactStories: Story[] = [];

  function emitMerged() {
    const seen = new Set<string>();
    const merged: Story[] = [];
    [...publicStories, ...contactStories].forEach((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        merged.push(s);
      }
    });
    merged.sort((a, b) => b.createdAt - a.createdAt);
    callback(merged);
  }

  const publicUnsub = onValue(ref(database, `stories/${uid}`), (snap) => {
    const now = Date.now();
    publicStories = [];
    if (snap.exists()) {
      snap.forEach((s) => {
        const v = s.val() as Record<string, unknown>;
        const expiresAt = (v.expiresAt as number) ?? 0;
        if (expiresAt < now) return;
        publicStories.push({
          id: s.key!,
          userId: v.userId as string,
          userName: v.userName as string,
          userAvatar: v.userAvatar as string | undefined,
          type: (v.type as 'text' | 'image') ?? 'text',
          content: (v.content as string) ?? '',
          bgGradient: (v.bgGradient as [string, string]) ?? ['#7C3AED', '#A855F7'],
          textColor: (v.textColor as string) ?? '#FFFFFF',
          mentions: (v.mentions as string[]) ?? [],
          createdAt: (v.createdAt as number) ?? Date.now(),
          expiresAt,
          viewCount: (v.viewCount as number) ?? 0,
          reactions: (v.reactions as Record<string, string>) ?? {},
          comments: [],
          cloudinaryId: v.cloudinaryId as string | undefined,
          privacy: ((v.privacy as string) === 'contacts' ? 'contacts' : 'public'),
        });
      });
    }
    emitMerged();
  });

  const contactUnsub = onValue(ref(database, `contactStories/${uid}`), (snap) => {
    const now = Date.now();
    contactStories = [];
    if (snap.exists()) {
      snap.forEach((s) => {
        const v = s.val() as Record<string, unknown>;
        const expiresAt = (v.expiresAt as number) ?? 0;
        if (expiresAt < now) return;
        contactStories.push({
          id: s.key!,
          userId: v.userId as string,
          userName: v.userName as string,
          userAvatar: v.userAvatar as string | undefined,
          type: (v.type as 'text' | 'image') ?? 'text',
          content: (v.content as string) ?? '',
          bgGradient: (v.bgGradient as [string, string]) ?? ['#7C3AED', '#A855F7'],
          textColor: (v.textColor as string) ?? '#FFFFFF',
          mentions: (v.mentions as string[]) ?? [],
          createdAt: (v.createdAt as number) ?? Date.now(),
          expiresAt,
          viewCount: (v.viewCount as number) ?? 0,
          reactions: (v.reactions as Record<string, string>) ?? {},
          comments: [],
          cloudinaryId: v.cloudinaryId as string | undefined,
          privacy: 'contacts',
        });
      });
    }
    emitMerged();
  });

  return () => {
    publicUnsub();
    contactUnsub();
  };
}

// ─── View ─────────────────────────────────────────────────────────────────────

/**
 * Increment view count (fire-and-forget).
 * RC8-A: tries the transaction on both paths.
 */
export function recordStoryView(authorUid: string, storyId: string): void {
  const tryPath = (basePath: string) =>
    runTransaction(
      ref(database, `${basePath}/${authorUid}/${storyId}/viewCount`),
      (current) => {
        if (current === null) return undefined;
        return (typeof current === 'number' ? current : 0) + 1;
      },
    ).catch(() => {/* non-critical */});

  tryPath('stories');
  tryPath('contactStories');
}

// ─── React ────────────────────────────────────────────────────────────────────

export async function reactToStory(
  authorUid: string,
  storyId: string,
  reactorUid: string,
  emoji: string,
): Promise<void> {
  const basePath = await resolveStoryPath(authorUid, storyId);
  if (!basePath) return;

  const reactionRef = ref(database, `${basePath}/${authorUid}/${storyId}/reactions/${reactorUid}`);
  const snap = await get(reactionRef);
  if (snap.exists() && snap.val() === emoji) {
    await set(reactionRef, null);
  } else {
    await set(reactionRef, emoji);
  }
}

// ─── Comments (RC8-B2) ────────────────────────────────────────────────────────

/**
 * Add a comment to a story.
 * RC8-B2: comments are stored as a map with Firebase push keys, not an array.
 * Requires database.rules.json to allow comment writes under $storyId/comments/$commentId.
 */
export async function addStoryComment(
  authorUid: string,
  storyId: string,
  comment: Pick<StoryComment, 'userId' | 'userName' | 'text' | 'userAvatar'>,
): Promise<string> {
  const basePath = await resolveStoryPath(authorUid, storyId);
  if (!basePath) throw new Error('Story not found');

  const commentsRef = ref(database, `${basePath}/${authorUid}/${storyId}/comments`);
  const newRef = push(commentsRef);
  await set(newRef, {
    userId: comment.userId,
    userName: comment.userName,
    text: comment.text,
    ...(comment.userAvatar ? { userAvatar: comment.userAvatar } : {}),
    ts: Date.now(),
  });
  return newRef.key!;
}

/**
 * Subscribe to comments on a story in real-time.
 * Subscribes to both `stories/` and `contactStories/` paths and merges results.
 */
export function subscribeStoryComments(
  authorUid: string,
  storyId: string,
  callback: (comments: StoryComment[]) => void,
): () => void {
  let pubComments: StoryComment[] = [];
  let conComments: StoryComment[] = [];

  function emit() {
    const seen = new Set<string>();
    const all: StoryComment[] = [];
    [...pubComments, ...conComments].forEach((c) => {
      if (!seen.has(c.id)) { seen.add(c.id); all.push(c); }
    });
    all.sort((a, b) => a.ts - b.ts);
    callback(all);
  }

  const parseComments = (snap: { exists(): boolean; forEach(cb: (child: { key: string | null; val(): unknown }) => void): void }): StoryComment[] => {
    const result: StoryComment[] = [];
    if (!snap.exists()) return result;
    snap.forEach((child) => {
      const v = child.val() as { userId: string; userName: string; userAvatar?: string; text: string; ts: number };
      if (child.key) {
        result.push({ id: child.key, userId: v.userId, userName: v.userName, userAvatar: v.userAvatar, text: v.text, ts: v.ts ?? 0 });
      }
    });
    return result;
  };

  const pubUnsub = onValue(
    ref(database, `stories/${authorUid}/${storyId}/comments`),
    (snap) => { pubComments = parseComments(snap); emit(); },
  );
  const conUnsub = onValue(
    ref(database, `contactStories/${authorUid}/${storyId}/comments`),
    (snap) => { conComments = parseComments(snap); emit(); },
  );

  return () => { pubUnsub(); conUnsub(); };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteStory(
  uid: string,
  storyId: string,
): Promise<void> {
  await Promise.all([
    remove(ref(database, `stories/${uid}/${storyId}`)),
    remove(ref(database, `contactStories/${uid}/${storyId}`)),
  ]);

  const [pubSnap, conSnap] = await Promise.all([
    get(ref(database, `stories/${uid}`)),
    get(ref(database, `contactStories/${uid}`)),
  ]);

  const hasAny = pubSnap.exists() || conSnap.exists();
  if (!hasAny) {
    await update(ref(database, `users/${uid}`), { hasActiveStory: false });
  }

  if (!pubSnap.exists()) {
    await remove(ref(database, `publicStoryIndex/${uid}`));
  }
}

// ─── Story Seen State (Firebase-persisted) ────────────────────────────────────

export async function markStorySeen(viewerUid: string, authorUid: string): Promise<void> {
  await set(ref(database, `storySeen/${viewerUid}/${authorUid}`), Date.now());
}

export function subscribeStorySeen(
  viewerUid: string,
  callback: (seenUids: Set<string>) => void,
): () => void {
  return onValue(ref(database, `storySeen/${viewerUid}`), (snap) => {
    const seenUids = new Set<string>();
    if (snap.exists()) {
      snap.forEach((child) => {
        if (child.key) seenUids.add(child.key);
      });
    }
    callback(seenUids);
  });
}

// ─── Cleanup (call once on auth state change, current user only) ──────────────

/**
 * Remove expired stories for a given user (client-side cleanup).
 * RC8-B2: Called with the current user's UID only. Global cleanup is done by
 * the server-side job in artifacts/api-server/src/jobs/scheduler.ts.
 */
export async function cleanExpiredStories(uid: string): Promise<void> {
  const now = Date.now();

  const [pubSnap, conSnap] = await Promise.all([
    get(ref(database, `stories/${uid}`)),
    get(ref(database, `contactStories/${uid}`)),
  ]);

  const deletions: Promise<void>[] = [];

  if (pubSnap.exists()) {
    pubSnap.forEach((s) => {
      const v = s.val() as { expiresAt?: number };
      if ((v.expiresAt ?? 0) < now) {
        deletions.push(remove(ref(database, `stories/${uid}/${s.key}`)));
      }
    });
  }
  if (conSnap.exists()) {
    conSnap.forEach((s) => {
      const v = s.val() as { expiresAt?: number };
      if ((v.expiresAt ?? 0) < now) {
        deletions.push(remove(ref(database, `contactStories/${uid}/${s.key}`)));
      }
    });
  }

  await Promise.all(deletions);

  // After deletions, recheck and clean up publicStoryIndex if needed
  const remaining = await get(ref(database, `stories/${uid}`));
  if (!remaining.exists()) {
    await remove(ref(database, `publicStoryIndex/${uid}`));
  }
}

/**
 * @deprecated RC8-B2: Use cleanExpiredStories(uid) for current user cleanup.
 * Global cleanup is now handled by the server-side scheduler job.
 * Kept for backward compatibility only.
 */
export async function cleanAllExpiredStories(): Promise<void> {
  // RC8-B2: Global cleanup has been moved to the server-side scheduler job
  // (artifacts/api-server/src/jobs/scheduler.ts). This function is a no-op
  // on the client to avoid downloading all stories on every app start.
  // The scheduler runs every 60 minutes and handles cleanup for all users.
}
