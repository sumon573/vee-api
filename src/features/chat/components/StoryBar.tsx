import { View, Text, Pressable, Image } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { UserStories } from '../types';

const C = {
  text: '#FFFFFF',
  muted: '#B8A6D9',
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  unseen: '#8B5CF6',      // purple ring = unseen
  seen: '#2A2542',         // dim ring = seen
  onlineGreen: '#22C55E',
} as const;

const AVATAR_SIZE = 62;
const RING = 3;

/** Gradient ring for unseen / flat ring for seen */
function AvatarRing({
  seen, size, children,
}: {
  seen: boolean;
  size: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{
      width: size + RING * 2 + 4,
      height: size + RING * 2 + 4,
      borderRadius: (size + RING * 2 + 4) / 2,
      padding: RING,
      backgroundColor: seen ? C.seen : C.unseen,
      shadowColor: seen ? 'transparent' : C.glow,
      shadowOpacity: seen ? 0 : 0.7,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: seen ? 0 : 8,
    }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 2, borderColor: C.bg,
        overflow: 'hidden',
      }}>
        {children}
      </View>
    </View>
  );
}

/** Fallback avatar: coloured circle with initials */
function InitialsAvatar({ name, size, color }: { name: string; size: number; color: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={{
      width: size, height: size, backgroundColor: color,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#fff', fontSize: size * 0.32, fontWeight: '900' }}>
        {initials}
      </Text>
    </View>
  );
}

const AVATAR_COLORS = [
  '#7C3AED', '#0EA5E9', '#EC4899', '#F97316',
  '#22C55E', '#EAB308', '#8B5CF6', '#06B6D4',
];
function colorFor(userId: string): string {
  let n = 0;
  for (let i = 0; i < userId.length; i++) n += userId.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// AddStory tile
// ─────────────────────────────────────────────────────────────────────────────
function AddStoryTile({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', marginRight: 16, width: 70 }}>
      <View style={{ position: 'relative' }}>
        <View style={{
          width: AVATAR_SIZE + 6,
          height: AVATAR_SIZE + 6,
          borderRadius: (AVATAR_SIZE + 6) / 2,
          backgroundColor: '#1A1535',
          borderWidth: 1.5,
          borderColor: '#2A2542',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Feather name="camera" size={24} color={C.muted} />
        </View>
        {/* Blue + badge */}
        <View style={{
          position: 'absolute', bottom: 2, right: 2,
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: '#0EA5E9',
          borderWidth: 2, borderColor: C.bg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Feather name="plus" size={12} color="#fff" />
        </View>
      </View>
      <Text numberOfLines={1} style={{
        color: C.muted, fontSize: 11, fontWeight: '600',
        marginTop: 6, width: 70, textAlign: 'center',
      }}>
        {t('chat.addStory')}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Story tile
// ─────────────────────────────────────────────────────────────────────────────
function StoryTile({
  userStory, onPress,
}: {
  userStory: UserStories;
  onPress: () => void;
}) {
  const name = userStory.userName;
  const seen = userStory.allSeen;
  const unseenCount = seen ? 0 : userStory.stories.length;

  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', marginRight: 16, width: 70 }}>
      <View style={{ position: 'relative' }}>
        <AvatarRing seen={seen} size={AVATAR_SIZE}>
          {userStory.userAvatar ? (
            <Image
              source={{ uri: userStory.userAvatar }}
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
            />
          ) : (
            <InitialsAvatar name={name} size={AVATAR_SIZE} color={colorFor(userStory.userId)} />
          )}
        </AvatarRing>
        {/* Unseen count badge */}
        {unseenCount > 1 && (
          <View style={{
            position: 'absolute', top: 0, right: 0,
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: C.primary,
            borderWidth: 2, borderColor: C.bg,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
              {unseenCount}
            </Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{
        color: seen ? C.muted : C.text,
        fontSize: 11, fontWeight: seen ? '500' : '700',
        marginTop: 6, width: 70, textAlign: 'center',
      }}>
        {name}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Planet tile — at the end of the story row
// ─────────────────────────────────────────────────────────────────────────────
function PlanetTile({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', marginLeft: 0, width: 70 }}>
      <View style={{
        width: AVATAR_SIZE + 6,
        height: AVATAR_SIZE + 6,
        borderRadius: (AVATAR_SIZE + 6) / 2,
        backgroundColor: 'rgba(139,92,246,0.16)',
        borderWidth: 2,
        borderColor: '#7C3AED',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8B5CF6',
        shadowOpacity: 0.55,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
        elevation: 6,
      }}>
        <Feather name="globe" size={26} color="#8B5CF6" />
      </View>
      <Text numberOfLines={1} style={{
        color: C.muted, fontSize: 11, fontWeight: '700',
        marginTop: 6, width: 70, textAlign: 'center',
      }}>
        Planet
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────────────────────
type Props = {
  stories: UserStories[];
  loading?: boolean;
  onOpenCreator: () => void;
  onOpenStory: (userIndex: number) => void;
  /** Called when the user taps the Planet bubble — opens the public story feed. */
  onOpenPlanet?: () => void;
};

export default function StoryBar({ stories, loading, onOpenCreator, onOpenStory, onOpenPlanet }: Props) {
  return (
    <View style={{ marginBottom: 4 }}>
      <GHScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 10 }}
        scrollEventThrottle={16}
        bounces={false}
      >
        <AddStoryTile onPress={onOpenCreator} />
        {!loading && stories.map((us, idx) => (
          <StoryTile
            key={us.userId}
            userStory={us}
            onPress={() => onOpenStory(idx)}
          />
        ))}
        {/* Planet bubble — always last in the row */}
        {onOpenPlanet && <PlanetTile onPress={onOpenPlanet} />}
      </GHScrollView>
      {/* Divider */}
      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 20 }} />
    </View>
  );
}
