import { Redirect, Stack } from 'expo-router';
import { LoadingView } from '@/components/LoadingView';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';

/**
 * Home-group layout. Guards the home screen behind:
 *   - an authenticated session AND
 *   - a selected branch.
 *
 * On either failing condition, route back to /(auth)/login or
 * /branch/select via the boot index router.
 */
export default function HomeLayout() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { isLoading: branchLoading, selected } = useBranch();

  if (authLoading || branchLoading) return <LoadingView />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (!selected) return <Redirect href="/branch/select" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
