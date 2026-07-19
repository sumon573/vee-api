import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  color?: string;
  bgColor?: string;
  height?: number;
  title?: string;
  subtitle?: string;
};

export default function WaveTopHeader({
  color = '#7C3AED',
  bgColor = '#07020F',
  height = 190,
  title,
  subtitle,
}: Props) {
  return (
    <View style={{ height, overflow: 'hidden', position: 'relative' }}>
      <View
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: height + 80,
          backgroundColor: color,
        }}
      />
      {(title || subtitle) && (
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={{ paddingHorizontal: 26, paddingTop: 18 }}>
            {!!title && (
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{title}</Text>
            )}
            {!!subtitle && (
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6 }}>
                {subtitle}
              </Text>
            )}
          </View>
        </SafeAreaView>
      )}
      <View
        style={{
          position: 'absolute',
          top: -60, left: -40,
          width: 240, height: 160,
          borderRadius: 120,
          backgroundColor: 'rgba(255,255,255,0.07)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -72, left: -50,
          width: 200, height: 160,
          borderRadius: 100,
          backgroundColor: bgColor,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -100, left: 110,
          width: 220, height: 180,
          borderRadius: 110,
          backgroundColor: bgColor,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -64, right: -50,
          width: 200, height: 150,
          borderRadius: 100,
          backgroundColor: bgColor,
        }}
      />
    </View>
  );
}
