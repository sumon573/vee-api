/**
 * PlanetScreen — Public Story Feed
 * Shows all stories with privacy='public' from every user.
 * Instagram Explore + Facebook Story Feed hybrid style.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, Image, ActivityIndicator,
  FlatList, Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';
import {
  subscribePlanetStories,
  deleteStory,
} from '../chat/services/firebaseStoryService';
import { UserStories } from '../chat/types';
import StoryViewer from '../chat/screens/StoryViewer';
import ScalePress from '@/components/ScalePress';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_W = (width - 48) / 2;

const C = {
  bg: '#07020F',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  text: '#FFFFFF',
  muted: '#B8A6D9',
  dim: '#4A3D6E',
  border: '#1E1830',
} as const;

function StoryCard({
  userStory,
  onPress,
}: {
  userStory: UserStories;
  onPress: () => void;
}) {
  const latestStory = userStory.stories[0];
  const isImage = latestStory?.type === 'image';
  const bgColor = latestStory?.bgGradient?.[0] ?? '#1a1a2e';

  return (
    <ScalePress onPress={onPress} scaleTo={0.96}>
      <View style={{
        width: CARD_W,
        height: CARD_W * 1.5,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: bgColor,
        borderWidth: 1, borderColor: C.border,
      }}>
        {isImage && latestStory?.content ? (
          <Image
            source={{ uri: latestStory.content }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <Text
              style={{ color: latestStory?.textColor ?? '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center', lineHeight: 20 }}
              numberOfLines={4}
            >
              {latestStory?.content ?? ''}
            </Text>
          </View>
        )}

        {/* Author info overlay */}
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingHorizontal: 10, paddingVertical: 8,
          backgroundColor: 'rgba(0,0,0,0.52)',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {userStory.userAvatar ? (
              <Image
                source={{ uri: userStory.userAvatar }}
                style={{ width: 20, height: 20, borderRadius: 10 }}
              />
            ) : (
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: C.primary + '66',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                  {userStory.userName[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 11, fontWeight: '700', flex: 1 }}>
              {userStory.userName}
            </Text>
          </View>
        </View>

        {/* Story count badge when user has more than one */}
        {userStory.stories.length > 1 && (
          <View style={{
            position: 'absolute', top: 8, right: 8,
            backgroundColor: C.primary,
            borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
              {userStory.stories.length}
            </Text>
          </View>
        )}
      </View>
    </ScalePress>
  );
}

export default function PlanetScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stories, setStories] = useState<UserStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);

  useEffect(() => {
    const unsub = subscribePlanetStories((groups) => {
      setStories(groups);
      setLoading(false);
    });
    // Safety timeout so the screen never stays in spinner state indefinitely
    const timeout = setTimeout(() => setLoading(false), 5000);
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  const handleDeleteStory = (storyId: string, userId: string) => {
    deleteStory(userId, storyId).catch(() => {});
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: C.border,
      }}>
        <Text style={{ fontSize: 22, marginRight: 8 }}>🌍</Text>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '900', flex: 1 }}>
          {t('planet.title', { defaultValue: 'Planet' })}
        </Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>
          {t('planet.publicStories', { defaultValue: 'Public stories' })}
        </Text>
      </View>

      {stories.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={{ fontSize: 48 }}>🌏</Text>
          <Text style={{ color: C.muted, fontSize: 16, fontWeight: '700' }}>
            {t('planet.empty', { defaultValue: 'No public stories yet' })}
          </Text>
          <Text style={{ color: C.dim, fontSize: 13, textAlign: 'center', maxWidth: 240 }}>
            {t('planet.emptyHint', { defaultValue: 'Post a story with "Public" visibility to appear here.' })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(item) => item.userId}
          numColumns={2}
          contentContainerStyle={{ padding: 16, gap: CARD_GAP }}
          columnWrapperStyle={{ gap: CARD_GAP }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <StoryCard
              userStory={item}
              onPress={() => {
                setViewerIdx(index);
                setViewerOpen(true);
              }}
            />
          )}
        />
      )}

      <StoryViewer
        visible={viewerOpen}
        startUserIndex={viewerIdx}
        stories={stories}
        onClose={() => setViewerOpen(false)}
        currentUserId={user?.uid}
        onDelete={handleDeleteStory}
      />
    </View>
  );
}
