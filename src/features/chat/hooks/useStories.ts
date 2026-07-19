/**
 * useStories — ধাপ ৫ + Story Seen State (Firebase-persisted)
 * Firebase real-time stories subscription + publish.
 * app/chat/index.tsx এ ব্যবহার করা হয়।
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { ref, onValue, get } from 'firebase/database';
import { database } from '@/src/config/firebase';
import { UserStories, Story } from '../types';
import {
  subscribeAllStories,
  subscribeMyStories,
  publishStory,
  recordStoryView,
  reactToStory,
  deleteStory,
  cleanExpiredStories,
  markStorySeen,
  subscribeStorySeen,
  PublishPayload,
} from '../services/firebaseStoryService';

export interface UseStoriesResult {
  stories: UserStories[];          // all users' stories (for StoryBar)
  myStories: Story[];              // current user's own stories
  loading: boolean;
  publish: (payload: PublishPayload) => Promise<void>;
  recordView: (authorUid: string, storyId: string) => void;
  react: (authorUid: string, storyId: string, emoji: string) => Promise<void>;
  remove: (storyId: string) => Promise<void>;
  markGroupSeen: (userId: string) => void;
}

export function useStories(): UseStoriesResult {
  const { user } = useAuth();
  const [stories, setStories] = useState<UserStories[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  // Firebase-persisted seen UIDs
  const seenRef = useRef<Set<string>>(new Set());
  // Contact UIDs for privacy filtering
  const contactUidsRef = useRef<Set<string>>(new Set());

  // Subscribe to Firebase-persisted seen state
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeStorySeen(user.uid, (seenUids) => {
      seenRef.current = seenUids;
      // Update allSeen for already-loaded stories
      setStories((prev) => prev.map((g) => ({
        ...g,
        allSeen: seenUids.has(g.userId),
      })));
    });
    return unsub;
  }, [user?.uid]);

  // Subscribe to contact UIDs (for privacy='contacts' filtering in StoryBar)
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onValue(ref(database, `userChats/${user.uid}`), (snap) => {
      const uids = new Set<string>();
      if (snap.exists()) {
        snap.forEach((child) => {
          const v = child.val() as { participantId?: string };
          if (v.participantId) uids.add(v.participantId);
        });
      }
      contactUidsRef.current = uids;
    });
    return unsub;
  }, [user?.uid]);

  // Subscribe to all stories — privacy-filtered using a getter so the contact
  // list is always read fresh on every Firebase update (no stale-closure bug).
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    const unsub = subscribeAllStories((groups) => {
      setStories(groups.map((g) => ({
        ...g,
        allSeen: seenRef.current.has(g.userId),
      })));
      setLoading(false);
    }, {
      viewerUid: uid,
      // Getter — called on every stories update, always returns the live set
      getContactUids: () => contactUidsRef.current,
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Subscribe to own stories + clean expired on mount
  useEffect(() => {
    if (!user?.uid) return;
    cleanExpiredStories(user.uid).catch(() => {});
    const unsub = subscribeMyStories(user.uid, setMyStories);
    return unsub;
  }, [user?.uid]);

  const publish = useCallback(async (payload: PublishPayload) => {
    if (!user?.uid) throw new Error('Not authenticated');
    // Issue 8: Prefer RTDB photoURL over Firebase Auth photoURL.
    // Auth photoURL is only set for Google sign-in; profile photo edits inside
    // Vee go to RTDB (users/{uid}/photoURL) and do NOT update Auth photoURL.
    let avatarUrl: string | undefined = user.photoURL ?? undefined;
    try {
      const snap = await get(ref(database, `users/${user.uid}/photoURL`));
      if (snap.exists() && snap.val()) {
        avatarUrl = snap.val() as string;
      }
    } catch { /* non-critical — fallback to Auth photoURL */ }
    await publishStory(user.uid, user.displayName ?? 'You', avatarUrl, payload);
  }, [user]);

  const recordView = useCallback((authorUid: string, storyId: string) => {
    recordStoryView(authorUid, storyId);
  }, []);

  const react = useCallback(async (authorUid: string, storyId: string, emoji: string) => {
    if (!user?.uid) return;
    await reactToStory(authorUid, storyId, user.uid, emoji);
  }, [user?.uid]);

  const remove = useCallback(async (storyId: string) => {
    if (!user?.uid) return;
    await deleteStory(user.uid, storyId);
  }, [user?.uid]);

  /** Mark a story group as seen — saves to Firebase so it persists across app restarts */
  const markGroupSeen = useCallback((userId: string) => {
    if (!user?.uid) return;
    seenRef.current.add(userId);
    setStories((prev) => prev.map((g) =>
      g.userId === userId ? { ...g, allSeen: true } : g,
    ));
    // Persist to Firebase (fire-and-forget)
    markStorySeen(user.uid, userId).catch(() => {});
  }, [user?.uid]);

  return { stories, myStories, loading, publish, recordView, react, remove, markGroupSeen };
}
