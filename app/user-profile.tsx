/**
 * /user-profile?uid=xxx&name=xxx
 * Route wrapper for UserProfileScreen
 */

import { useLocalSearchParams } from 'expo-router';
import UserProfileScreen from '@/src/features/user-profile/UserProfileScreen';

export default function UserProfileRoute() {
  const { uid, name } = useLocalSearchParams<{ uid: string; name: string }>();
  return <UserProfileScreen uid={uid ?? ''} name={name ?? 'User'} />;
}
