import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/Ui';

const AVATAR = require('@/assets/images/mizizi-avatar.png');

export default function FloatingMizizi() {
  const c = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/mizizi')}
      accessibilityRole="button"
      accessibilityLabel="Open Mizizi voice assistant"
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: c.surface,
          borderColor: c.accent,
          shadowColor: c.shadow,
          opacity: pressed ? 0.82 : 1,
        },
      ]}>
      <Image source={AVATAR} style={styles.avatar} />
      <View style={[styles.mic, { backgroundColor: c.tint, borderColor: c.surface }]}>
        <Ionicons name="mic" size={12} color="#FFF" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 18,
    bottom: 78,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    padding: 2,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.23,
    shadowRadius: 7,
    zIndex: 999,
  },
  avatar: { width: '100%', height: '100%', borderRadius: 26 },
  mic: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
