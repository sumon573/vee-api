import {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, Modal, Pressable, TextInput,
  Animated, Dimensions, Alert, Image,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { UserStories, Story } from '../types';
import { STORY_REACTIONS } from '../data/mockStories';

const { width, height } = Dimensions.get('window');
const STORY_DURATION = 5000;

const C = {
  bg: '#000000',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.65)',
  dim: 'rgba(255,255,255,0.38)',
  primary: '#7C3AED',
  glow: '#8B5CF6',
  glass: 'rgba(255,255,255,0.12)',
  glassBorder: 'rgba(255,255,255,0.18)',
  inputBg: 'rgba(255,255,255,0.08)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Progress bars
// ─────────────────────────────────────────────────────────────────────────────
function ProgressBars({
  total, current, progress,
}: {
  total: number; current: number; progress: Animated.Value;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 8 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{
          flex: 1, height: 2.5, borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden',
        }}>
          {i < current && <View style={{ flex: 1, backgroundColor: '#fff' }} />}
          {i === current && (
            <Animated.View style={{
              height: '100%', backgroundColor: '#fff',
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }} />
          )}
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single story slide
// ─────────────────────────────────────────────────────────────────────────────
type StoryCardProps = {
  story: Story;
  userStories: UserStories;
  storyIndex: number;
  totalStories: number;
  progressAnim: Animated.Value;
  onTapLeft: () => void;
  onTapRight: () => void;
  onClose: () => void;
  currentUserId?: string;
  onDelete?: (storyId: string, userId: string) => void;
};

function StoryCard({
  story, userStories, storyIndex, totalStories,
  progressAnim, onTapLeft, onTapRight, onClose,
  currentUserId, onDelete,
}: StoryCardProps) {
  const { t } = useTranslation();
  const [reactionOpen, setReactionOpen] = useState(false);
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(story.comments);
  const isOwn = !!currentUserId && story.userId === currentUserId;

  const timeAgo = (ts: number): string => {
    const diff = Date.now() - ts;
    const min = 60_000;
    const h = 3_600_000;
    if (diff < min) return t('chat.storyJustNow');
    if (diff < h) return t('chat.storyMinutesAgo', { count: Math.floor(diff / min) });
    return t('chat.storyHoursAgo', { count: Math.floor(diff / h) });
  };

  const submitReaction = (emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUserReaction((prev) => (prev === emoji ? null : emoji));
    setReactionOpen(false);
  };

  const submitComment = () => {
    const trimmed = reply.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setComments((c) => [
      ...c,
      { id: `cmt_${Date.now()}`, userId: 'me', userName: 'You', text: trimmed, createdAt: Date.now() },
    ]);
    setReply('');
  };

  const shareToInbox = () => {
    Alert.alert(t('chat.storyShareTitle'), t('chat.storyShareMsg'), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('chat.storyShare'),
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(t('chat.storyShareSuccess'), t('chat.storySharedToInbox'));
        },
      },
    ]);
  };

  const bg = story.bgGradient ? story.bgGradient[0] : '#1a1a2e';

  return (
    <View style={{ width, height, backgroundColor: bg }}>
      {/* Overlay tint */}
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.15)' }} />

      {/* Progress + header */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <View style={{ paddingTop: Platform.OS === 'web' ? 67 : 0 }}>
          <ProgressBars total={totalStories} current={storyIndex} progress={progressAnim} />
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
          }}>
            {/* RC6 fix Issue 7: show userAvatar photo when available */}
            <View style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder,
              alignItems: 'center', justifyContent: 'center', marginRight: 10,
              overflow: 'hidden',
            }}>
              {userStories.userAvatar ? (
                <Image
                  source={{ uri: userStories.userAvatar }}
                  style={{ width: 38, height: 38, borderRadius: 19 }}
                />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
                  {userStories.userName[0]?.toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
                {userStories.userName}
              </Text>
              <Text style={{ color: C.muted, fontSize: 11 }}>{timeAgo(story.createdAt)}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={16}>
              <Feather name="x" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Story content */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        {story.type === 'text' ? (
          <Text style={{
            color: story.textColor ?? '#fff', fontSize: 28, fontWeight: '900',
            textAlign: 'center', lineHeight: 40,
            textShadowColor: 'rgba(0,0,0,0.4)',
            textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
          }}>
            {story.content}
          </Text>
        ) : story.content ? (
          // RC6 fix Issue 7: render actual Cloudinary image URL stored in story.content
          <Image
            source={{ uri: story.content }}
            style={{
              width: width - 40, height: (width - 40) * 1.4, borderRadius: 20,
            }}
            resizeMode="cover"
          />
        ) : (
          // Fallback: content missing (shouldn't happen with Cloudinary upload)
          <View style={{
            width: width - 40, height: (width - 40) * 1.4, borderRadius: 20,
            backgroundColor: '#222', alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather name="image" size={48} color="rgba(255,255,255,0.3)" />
          </View>
        )}
      </View>

      {/* Left / Right tap zones — sit above content but below UI overlays */}
      <View style={{ position: 'absolute', left: 0, top: 120, bottom: 160, width: width * 0.4 }}>
        <Pressable style={{ flex: 1 }} onPress={onTapLeft} />
      </View>
      <View style={{ position: 'absolute', right: 0, top: 120, bottom: 160, width: width * 0.6 }}>
        <Pressable style={{ flex: 1 }} onPress={onTapRight} />
      </View>

      {/* Reactions picker */}
      {reactionOpen && (
        <View style={{
          position: 'absolute', bottom: 170, left: 16, right: 16,
          flexDirection: 'row', justifyContent: 'space-evenly',
          backgroundColor: 'rgba(0,0,0,0.85)',
          borderRadius: 40, paddingVertical: 12,
          borderWidth: 1, borderColor: C.glassBorder, zIndex: 20,
        }}>
          {STORY_REACTIONS.map((emoji) => (
            <Pressable key={emoji} onPress={() => submitReaction(emoji)} style={{ padding: 6 }}>
              <Text style={{
                fontSize: 28,
                transform: [{ scale: userReaction === emoji ? 1.35 : 1 }],
              }}>
                {emoji}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Comments list */}
      {showComments && (
        <View style={{
          position: 'absolute', bottom: 170, left: 16, right: 16,
          backgroundColor: 'rgba(0,0,0,0.85)',
          borderRadius: 20, maxHeight: 220, padding: 12,
          borderWidth: 1, borderColor: C.glassBorder, zIndex: 20,
        }}>
          <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
            {t('chat.storyComments')}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 150 }}>
            {comments.length === 0
              ? <Text style={{ color: C.dim, fontSize: 13, textAlign: 'center' }}>{t('chat.storyNoComments')}</Text>
              : comments.map((cmt) => (
                  <View key={cmt.id} style={{ marginBottom: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{cmt.userName}</Text>
                    <Text style={{ color: C.muted, fontSize: 13 }}>{cmt.text}</Text>
                  </View>
                ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}
      >
        <SafeAreaView edges={['bottom']}>
          <View style={{
            paddingHorizontal: 16, paddingVertical: 12,
            paddingBottom: Platform.OS === 'web' ? 34 : 12,
          }}>
            {/* Reply input */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: C.inputBg, borderRadius: 30,
              paddingHorizontal: 16, paddingVertical: 10,
              borderWidth: 1, borderColor: C.glassBorder, marginBottom: 10,
            }}>
              <TextInput
                style={{ flex: 1, color: '#fff', fontSize: 14 }}
                placeholder={t('chat.storyReplyPlaceholder', { name: userStories.userName })}
                placeholderTextColor={C.muted}
                value={reply}
                onChangeText={setReply}
                onSubmitEditing={submitComment}
              />
              {reply.length > 0 && (
                <Pressable onPress={submitComment}>
                  <Feather name="send" size={20} color={C.glow} />
                </Pressable>
              )}
            </View>

            {/* Action row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <Pressable onPress={() => setReactionOpen((v) => !v)} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 20 }}>{userReaction ?? '❤️'}</Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 11 }}>{t('chat.storyReact')}</Text>
              </Pressable>

              <Pressable onPress={() => setShowComments((v) => !v)} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name="message-circle" size={20} color="#fff" />
                </View>
                <Text style={{ color: C.muted, fontSize: 11 }}>{t('chat.storyComment')}</Text>
              </Pressable>

              <Pressable onPress={shareToInbox} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name="share-2" size={20} color="#fff" />
                </View>
                <Text style={{ color: C.muted, fontSize: 11 }}>{t('chat.storyShare')}</Text>
              </Pressable>

              <View style={{ alignItems: 'center', gap: 4 }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Feather name="eye" size={20} color="#fff" />
                </View>
                <Text style={{ color: C.muted, fontSize: 11 }}>{story.viewCount}</Text>
              </View>

              {/* Delete button — only visible to the story owner */}
              {isOwn && (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      t('chat.storyDeleteTitle', { defaultValue: 'Delete Story' }),
                      t('chat.storyDeleteMsg', { defaultValue: 'Remove this story for everyone?' }),
                      [
                        { text: t('chat.cancel'), style: 'cancel' },
                        {
                          text: t('chat.storyDeleteConfirm', { defaultValue: 'Delete' }),
                          style: 'destructive',
                          onPress: () => {
                            onDelete?.(story.id, story.userId);
                            onClose();
                          },
                        },
                      ],
                    );
                  }}
                  style={{ alignItems: 'center', gap: 4 }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: 'rgba(239,68,68,0.15)',
                    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name="trash-2" size={20} color="#EF4444" />
                  </View>
                  <Text style={{ color: '#EF4444', fontSize: 11 }}>
                    {t('chat.storyDelete', { defaultValue: 'Delete' })}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StoryViewer — public component
// Timer uses refs so callbacks never capture stale index state.
// ─────────────────────────────────────────────────────────────────────────────
type Props = {
  visible: boolean;
  startUserIndex: number;
  stories: UserStories[];
  onClose: () => void;
  currentUserId?: string;
  onDelete?: (storyId: string, userId: string) => void;
};

export default function StoryViewer({ visible, startUserIndex, stories, onClose, currentUserId, onDelete }: Props) {
  const [userIndex, setUserIndex]   = useState(startUserIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Refs always hold the latest indices — used inside timer callback
  // so we never have stale closure issues.
  const userIndexRef  = useRef(userIndex);
  const storyIndexRef = useRef(storyIndex);
  useEffect(() => { userIndexRef.current  = userIndex;  }, [userIndex]);
  useEffect(() => { storyIndexRef.current = storyIndex; }, [storyIndex]);

  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const stopTimer = useCallback(() => {
    animRef.current?.stop();
    animRef.current = null;
    progressAnim.setValue(0);
  }, [progressAnim]);

  /**
   * Advance to next story or next user's stories.
   * Reads from refs to avoid stale closures.
   */
  const advance = useCallback(() => {
    const ui = userIndexRef.current;
    const si = storyIndexRef.current;
    const currentUser = stories[ui];
    if (!currentUser) { onClose(); return; }

    if (si < currentUser.stories.length - 1) {
      // next story within same user
      storyIndexRef.current = si + 1;
      setStoryIndex(si + 1);
    } else if (ui < stories.length - 1) {
      // next user
      userIndexRef.current  = ui + 1;
      storyIndexRef.current = 0;
      setUserIndex(ui + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  }, [stories, onClose]);

  const startTimer = useCallback(() => {
    stopTimer();
    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) advance();
    });
  }, [progressAnim, stopTimer, advance]);

  const goPrev = useCallback(() => {
    const ui = userIndexRef.current;
    const si = storyIndexRef.current;
    if (si > 0) {
      storyIndexRef.current = si - 1;
      setStoryIndex(si - 1);
    } else if (ui > 0) {
      userIndexRef.current  = ui - 1;
      storyIndexRef.current = 0;
      setUserIndex(ui - 1);
      setStoryIndex(0);
    }
    // timer restarts via the useEffect below
  }, []);

  // Restart timer whenever the story changes (index or user changes)
  useEffect(() => {
    if (!visible) { stopTimer(); return; }
    const user  = stories[userIndex];
    const story = user?.stories[storyIndex];
    if (!user || !story) { onClose(); return; }
    startTimer();
    return () => stopTimer();
  }, [visible, userIndex, storyIndex]);

  // Reset indices when viewer is (re-)opened
  useEffect(() => {
    if (visible) {
      userIndexRef.current  = startUserIndex;
      storyIndexRef.current = 0;
      setUserIndex(startUserIndex);
      setStoryIndex(0);
    } else {
      stopTimer();
    }
  }, [visible, startUserIndex]);

  const currentUser  = stories[userIndex];
  const currentStory = currentUser?.stories[storyIndex];

  if (!currentUser || !currentStory) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StoryCard
          story={currentStory}
          userStories={currentUser}
          storyIndex={storyIndex}
          totalStories={currentUser.stories.length}
          progressAnim={progressAnim}
          onTapLeft={goPrev}
          onTapRight={advance}
          onClose={onClose}
          currentUserId={currentUserId}
          onDelete={onDelete}
        />
      </View>
    </Modal>
  );
}
