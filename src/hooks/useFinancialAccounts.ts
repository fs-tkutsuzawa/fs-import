import { useState, useEffect } from 'react';
import { getApiUrl } from '../config/api';

export interface Account {
  id: string;
  parent_id: string | null;
  fs_type: 'PL' | 'BS' | 'CF';
  account_name: string;
  account_code: string;
  account_type: 'aggregate' | 'super_calc' | 'standard';
  sort_num: number;
  indent_num: number;
  is_optional: boolean;
  isCalculated: boolean;
  children: Account[];
  // GA specific fields
  ga_name?: string;
  ga_code?: string;
  ga_type?: string;
  [key: string]: any; // Allow other properties
}

export const useFinancialAccounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFinancialAccounts = async () => {
      try {
        setLoading(true);
        const response = await fetch(getApiUrl('/api/financial-accounts'));
        if (!response.ok) {
          throw new Error('Failed to fetch financial accounts');
        }
        const data = await response.json();

        const transformedData: Account[] = data.map((item: any) => ({
          ...item,
          parent_id: item.parent_ga_id,
          account_name: item.ga_name,
          account_code: item.ga_code,
          account_type: item.ga_type,
          sort_num: item.sort_num,
          indent_num: item.indent_num,
          is_optional: item.is_optional || false,
          isCalculated: item.ga_type === 'super_calc',
          children: [],
          // Add fields needed by FinancialStatementPreview
          order: item.sort_num,
          mapping_type:
            item.ga_type === 'super_calc'
              ? 'calculated'
              : item.ga_type === 'aggregate'
                ? 'sum_of_children'
                : item.ga_type === 'standard'
                  ? 'reference'
                  : item.ga_type,
        }));

        setAccounts(transformedData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchFinancialAccounts();
  }, []);

  const updateAccountName = async (id: string, newName: string) => {
    const originalAccounts = accounts;
    const updatedAccounts = originalAccounts.map((acc) =>
      acc.id === id ? { ...acc, account_name: newName } : acc
    );
    setAccounts(updatedAccounts);

    try {
      const response = await fetch(getApiUrl('/api/financial-accounts'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, newName }),
      });

      if (!response.ok) {
        throw new Error('Failed to update account name');
      }

      const data = await response.json();
      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === data.id ? { ...acc, account_name: data.ga_name } : acc
        )
      );
    } catch (error) {
      console.error('Error updating account name:', error);
      setAccounts(originalAccounts); // Revert on error
      throw error; // Re-throw to allow components to handle it
    }
  };

  return { accounts, loading, error, setAccounts, updateAccountName };
};
