/**
 * Branch context — the scanner is always scoped to a single branch.
 *
 * Lifecycle:
 *   1. On user login → fetch /branches (server returns only branches the
 *      caller can see).
 *   2. 0 branches → no-branches state. Show a clear "contact your admin" UI.
 *   3. 1 branch → auto-select; skip the picker.
 *   4. N branches → show /branch/select once. Persist the selection in
 *      expo-secure-store so the next app launch lands on the same branch.
 *
 * Switching branches resets selection in storage and re-prompts.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { Branch } from './api-types';
import { useAuth } from './auth-context';

const SELECTED_BRANCH_KEY = 'mn_scanner_selected_branch_id';

const isNative = Platform.OS !== 'web';

async function readSelectedBranchId(): Promise<string | null> {
  if (isNative) return SecureStore.getItemAsync(SELECTED_BRANCH_KEY);
  return AsyncStorage.getItem(SELECTED_BRANCH_KEY);
}
async function writeSelectedBranchId(id: string): Promise<void> {
  if (isNative) {
    await SecureStore.setItemAsync(SELECTED_BRANCH_KEY, id);
    return;
  }
  await AsyncStorage.setItem(SELECTED_BRANCH_KEY, id);
}
async function clearSelectedBranchId(): Promise<void> {
  if (isNative) {
    await SecureStore.deleteItemAsync(SELECTED_BRANCH_KEY);
    return;
  }
  await AsyncStorage.removeItem(SELECTED_BRANCH_KEY);
}

interface BranchContextValue {
  /** All branches available to the signed-in user. */
  branches: Branch[];
  /** The currently selected branch, or null if none has been chosen yet. */
  selected: Branch | null;
  /** True while the initial /branches fetch is in flight after login. */
  isLoading: boolean;
  /** Last error encountered while loading branches, if any. */
  error: string | null;
  /** Select a branch (idempotent — same id is a no-op). */
  selectBranch: (id: string) => Promise<void>;
  /** Clear the current selection (used when switching). */
  clearSelection: () => Promise<void>;
  /** Re-fetch the branch list (e.g. pull-to-refresh on the picker). */
  refresh: () => Promise<void>;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<Branch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setBranches([]);
      setSelected(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.listBranches();
      const active = res.data.filter((b) => b.isActive);
      setBranches(active);

      // Apply auto-selection / restore-from-storage logic.
      if (active.length === 0) {
        setSelected(null);
        await clearSelectedBranchId();
      } else if (active.length === 1) {
        const only = active[0]!;
        setSelected(only);
        await writeSelectedBranchId(only.id);
      } else {
        const previousId = await readSelectedBranchId();
        const previous = previousId
          ? active.find((b) => b.id === previousId) ?? null
          : null;
        setSelected(previous);
      }
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? Array.isArray((err as { message: unknown }).message)
            ? ((err as { message: string[] }).message[0] ?? 'Failed to load branches')
            : String((err as { message: unknown }).message)
          : 'Failed to load branches';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Refresh whenever auth state flips. On logout, clear local state too.
  useEffect(() => {
    if (isAuthenticated) {
      void refresh();
    } else {
      setBranches([]);
      setSelected(null);
      setError(null);
      void clearSelectedBranchId();
    }
  }, [isAuthenticated, refresh]);

  const selectBranch = useCallback(
    async (id: string) => {
      const match = branches.find((b) => b.id === id);
      if (!match) return;
      setSelected(match);
      await writeSelectedBranchId(match.id);
    },
    [branches],
  );

  const clearSelection = useCallback(async () => {
    setSelected(null);
    await clearSelectedBranchId();
  }, []);

  const value: BranchContextValue = {
    branches,
    selected,
    isLoading,
    error,
    selectBranch,
    clearSelection,
    refresh,
  };

  return (
    <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within BranchProvider');
  return ctx;
}
