import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { BranchProvider, useBranch } from '@/lib/branch-context';
import { colors } from '@/theme';

// Keep the native splash up until the persisted session AND the initial
// branch fetch have resolved. This eliminates the flash of an empty home
// screen on cold start.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden / already initialised */
});

function SplashGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const branch = useBranch();

  useEffect(() => {
    // Hide as soon as:
    //   - auth has finished bootstrapping AND
    //   - either the user is unauthenticated (login screen ready) OR the
    //     branch fetch has settled (loading flipped to false).
    const authReady = !auth.isLoading;
    const branchReady = !auth.isAuthenticated || !branch.isLoading;
    if (authReady && branchReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [auth.isLoading, auth.isAuthenticated, branch.isLoading]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <BranchProvider>
            <SplashGate>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.surface[0] },
                  headerTintColor: colors.ink[900],
                  headerTitleStyle: { fontWeight: '600' },
                  contentStyle: { backgroundColor: colors.surface[0] },
                }}
              >
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(home)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="branch/select"
                  options={{
                    title: 'Select branch',
                    headerBackVisible: false,
                  }}
                />
                <Stack.Screen name="lookup" options={{ headerShown: false }} />
                <Stack.Screen name="restock" options={{ headerShown: false }} />
                <Stack.Screen name="returns" options={{ headerShown: false }} />
              </Stack>
            </SplashGate>
          </BranchProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
