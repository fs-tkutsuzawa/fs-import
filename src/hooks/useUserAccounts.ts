import { useState, useEffect } from 'react';
import { getApiUrl } from '../config/api';

export interface UserAccount {
  id: number;
  ua_name: string;
  ua_code: string;
  fs_type: 'PL' | 'BS' | 'CF';
  is_credit: boolean | null;
  is_kpi: boolean;
  parent_ga_id: string;
  parent_ua_id: number | null;
  // GA関連の追加フィールド（APIから取得）
  ga_id?: string;
  parent_ga_name?: string;
  parent_ga_code?: string;
  ga_type?: string;
}

export interface UseUserAccountsOptions {
  /**
   * UAD-007-X: If true, only return accounts where is_kpi = TRUE
   */
  kpiOnly?: boolean;
}

export const useUserAccounts = (options?: UseUserAccountsOptions) => {
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserAccounts = async () => {
      try {
        setLoading(true);
        const response = await fetch(getApiUrl('/api/user-accounts'));
        if (!response.ok) {
          throw new Error('Failed to fetch user accounts');
        }
        const data = await response.json();

        if (data.success && data.accounts) {
          let accounts = data.accounts;

          // UAD-007-X: Filter for KPI accounts if requested
          if (options?.kpiOnly) {
            accounts = accounts.filter(
              (acc: UserAccount) => acc.is_kpi === true
            );
          }

          setUserAccounts(accounts);
        } else {
          setUserAccounts([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setUserAccounts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAccounts();
  }, [options?.kpiOnly]);

  return { userAccounts, loading, error };
};
