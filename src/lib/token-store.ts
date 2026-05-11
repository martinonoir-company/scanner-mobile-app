import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Native: expo-secure-store (Keychain / Keystore).
// Web: SecureStore isn't supported — fall back to AsyncStorage so the web
// preview isn't broken during development. Production deployment is native.
//
// Different storage keys from user-mobile-app so both apps can coexist on
// the same device without trampling each other's session.
const ACCESS_KEY = 'mn_scanner_access_token';
const REFRESH_KEY = 'mn_scanner_refresh_token';

const isNative = Platform.OS !== 'web';

async function get(key: string): Promise<string | null> {
  if (isNative) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

async function set(key: string, value: string): Promise<void> {
  if (isNative) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

async function remove(key: string): Promise<void> {
  if (isNative) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await AsyncStorage.removeItem(key);
}

export const tokenStore = {
  async load(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    const [accessToken, refreshToken] = await Promise.all([
      get(ACCESS_KEY),
      get(REFRESH_KEY),
    ]);
    return { accessToken, refreshToken };
  },
  async save(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([set(ACCESS_KEY, accessToken), set(REFRESH_KEY, refreshToken)]);
  },
  async clear(): Promise<void> {
    await Promise.all([remove(ACCESS_KEY), remove(REFRESH_KEY)]);
  },
};
