import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/Ui';
import type { MiziziStatus } from '@/hooks/miziziVoiceTypes';

type Props = {
  status: MiziziStatus;
  inputLevel?: number;
  size?: number;
};

const AVATAR = require('@/assets/images/mizizi-avatar.png');

export default function MiziziAvatar({ status, inputLevel = 0, size = 144 }: Props) {
  const c = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulse.stopAnimation();
    if (status === 'idle' || status === 'error') {
      Animated.spring(pulse, { toValue: 0, useNativeDriver: true }).start();
      return;
    }
    const duration = status === 'speaking' ? 520 : status === 'thinking' ? 900 : 1300;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, status]);

  const activityScale = status === 'listening' ? inputLevel * 0.09 : 0;
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1 + activityScale, 1.1 + activityScale],
  });
  const portraitScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, status === 'speaking' ? 1.025 : 1.012],
  });

  return (
    <View
      style={[styles.wrap, { width: size + 32, height: size + 32 }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Mizizi voice assistant is ${status}`}>
      <Animated.View
        style={[
          styles.activityRing,
          {
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            borderColor: status === 'error' ? c.danger : c.accent,
            backgroundColor: status === 'speaking' ? c.accent + '18' : c.tint + '18',
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.imageFrame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: c.surface,
            transform: [{ scale: portraitScale }],
          },
        ]}>
        <Image source={AVATAR} style={styles.image} resizeMode="cover" />
      </Animated.View>
      <View
        style={[
          styles.presence,
          {
            backgroundColor:
              status === 'error' ? c.danger : status === 'idle' ? c.textMuted : c.success,
            borderColor: c.surface,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  imageFrame: {
    overflow: 'hidden',
    borderWidth: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  presence: {
    position: 'absolute',
    right: 12,
    bottom: 15,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
  },
});
