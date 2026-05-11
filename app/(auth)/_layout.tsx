import { Redirect, Stack } from 'expo-router';
import { LoadingView } from '@/components/LoadingView';
import { useAuth } from '@/lib/auth-context';

/**
 * Auth-group layout. Routes authenticated users away to the boot router,
 * which decides between /branch/select and /(home).
 */
export default function AuthLayout() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <LoadingView />;
  if (isAuthenticated) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
