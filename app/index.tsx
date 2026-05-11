import { Redirect } from 'expo-router';
import { LoadingView } from '@/components/LoadingView';
import { useAuth } from '@/lib/auth-context';
import { useBranch } from '@/lib/branch-context';

/**
 * Boot router. Routes the user based on (auth, branch) state:
 *
 *   not authenticated                  → /(auth)/login
 *   authenticated, no branch chosen    → /branch/select
 *   authenticated, branch chosen       → /(home)
 *
 * Held by the SplashGate until both states have settled, so this never
 * runs with stale data.
 */
export default function BootIndex() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { isLoading: branchLoading, selected } = useBranch();

  if (authLoading || (isAuthenticated && branchLoading)) {
    return <LoadingView />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!selected) {
    return <Redirect href="/branch/select" />;
  }

  return <Redirect href="/(home)" />;
}
