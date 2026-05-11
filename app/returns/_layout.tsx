import { Redirect, Stack } from 'expo-router';
import { LoadingView } from '@/components/LoadingView';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { colors } from '@/theme';

/**
 * Returns-group layout. Guards behind auth + a selected branch (RETURN /
 * ADJUSTMENT movements are posted to the branch's warehouse).
 */
export default function ReturnsLayout() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { isLoading: branchLoading, selected } = useBranch();

  if (authLoading || branchLoading) return <LoadingView />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (!selected) return <Redirect href="/branch/select" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface[0] },
        headerTintColor: colors.ink[900],
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.surface[0] },
      }}
    >
      <Stack.Screen name="batch" options={{ title: 'Returns & damages' }} />
    </Stack>
  );
}
