/**
 * Root index — shows loading while AuthGuard in _layout.tsx
 * determines where to redirect (login or home).
 */
import { View, ActivityIndicator } from 'react-native';

export default function RootIndex() {
  return (
    <View style={{ flex: 1, backgroundColor: '#07020F', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#7C3AED" size="large" />
    </View>
  );
}
