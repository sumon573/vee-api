export type StoryComment = {
  id: string;
  userId: string;
  userName: string;
  /** RC8-B2: added for comment avatar display in UI */
  userAvatar?: string;
  text: string;
  /** RC8-B2: renamed from createdAt to ts to match Firebase push-key storage format */
  ts: number;
};

export type StoryPrivacy = 'public' | 'contacts';

export type Story = {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: 'text' | 'image';
  /** For text stories: the display text. For image stories: Cloudinary URL (or local URI during mock). */
  content: string;
  bgGradient?: [string, string]; // for text stories
  textColor?: string;
  mentions?: string[];            // userIds mentioned
  createdAt: number;
  expiresAt: number;
  viewCount: number;
  reactions: Record<string, string>; // userId → emoji
  comments: StoryComment[];
  cloudinaryId?: string;
  /** 'public' → visible to everyone; 'contacts' → visible only to friends */
  privacy?: StoryPrivacy;
};

export type UserStories = {
  userId: string;
  userName: string;
  userAvatar?: string;
  stories: Story[];
  allSeen: boolean;
};

export type ChatMessageType = 'text' | 'image' | 'video' | 'voice' | 'story_share' | 'sticker';

export type Chat = {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar?: string;
  lastMessage: string;
  lastMessageType: ChatMessageType;
  lastMessageTime: number;
  unreadCount: number;
  isOnline: boolean;
  hasStory: boolean;
  storySeen: boolean;
  isPinned?: boolean;
  isTyping?: boolean;
};
