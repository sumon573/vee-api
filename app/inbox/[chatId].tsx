import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import InboxScreen from '@/src/features/chat/screens/InboxScreen';

export default function InboxRoute() {
  const { t } = useTranslation();
  const { chatId, participantId, participantName } = useLocalSearchParams<{
    chatId: string;
    participantId: string;
    participantName: string;
  }>();

  return (
    <InboxScreen
      chatId={chatId ?? ''}
      participantId={participantId ?? ''}
      participantName={decodeURIComponent(participantName ?? t('chat.unknownUser'))}
    />
  );
}
