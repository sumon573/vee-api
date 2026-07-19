import { ReactNode } from 'react';
import { View } from 'react-native';

export default function AuroraBackground({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#07020F' }}>
      <View
        style={{
          position: 'absolute',
          width: 280, height: 280,
          borderRadius: 140,
          backgroundColor: '#8B5CF6',
          opacity: 0.07,
          top: -80, left: -80,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 300, height: 300,
          borderRadius: 150,
          backgroundColor: '#A855F7',
          opacity: 0.07,
          bottom: -100, right: -80,
        }}
      />
      {children}
    </View>
  );
}
