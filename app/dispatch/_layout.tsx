import { Redirect, Stack } from 'expo-router';
import { LoadingView } from '@/components/LoadingView';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';
import { colors } from '@/theme';

/**
 * Dispatch-group layout. Staff sort shipping orders for AAJ pickup, then
 * scan each order's barcode to mark it dispatched. Guarded behind auth + a
 * selected branch.
 */
export default function DispatchLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Dispatch' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan to dispatch' }} />
    </Stack>
  );
}
