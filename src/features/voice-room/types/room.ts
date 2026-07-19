export type RoomCategory = 'trending' | 'nearby' | 'ludo' | 'game' | 'music' | 'adda' | 'discussion' | 'talk' | 'study' | 'new';

export type MemberPreview = {
  initials: string;
  color: string;
};

export type VoiceRoom = {
  id: string;
  name: string;
  topic: string;
  themeColor: string;
  memberCount: number;
  maxMembers: number;
  isLive: boolean;
  isTrending?: boolean;
  category: RoomCategory;
  tags: string[];
  ownerId: string;
  ownerName: string;
  allowGifts: boolean;
  createdAt: number;
  memberPreviews?: MemberPreview[];
  coverImageUrl?: string;
  isPublic?: boolean;
};

/* ─── Types added from VoiceRoomScreen ─── */

export type Role = 'host' | 'admin' | 'member';

export type Participant = {
  id: string;
  name: string;
  initials: string;
  color: string;
  photoURL?: string;   // profile picture URL (optional, falls back to initials)
  speaking: boolean; // true ONLY when ZEGOCLOUD signals real audio — no fake pulse
  muted: boolean;
  role: Role;
};

export type BlockRecord = {
  id: string;
  name: string;
  initials: string;
  color: string;
  action: 'room-block' | 'comment-block';
  actionBy: string;
  timestamp: number;
  isActive: boolean;
};

export type ChatMsg = {
  id: string;
  sender: string;
  color: string;
  text: string;
  isMe: boolean;
  ts: number;
  replyTo?: { sender: string; text: string; color: string };
};

import { Animated } from 'react-native';

export type SeatReaction = {
  emoji: string;
  translateY: Animated.Value;
  opacity: Animated.Value;
};
