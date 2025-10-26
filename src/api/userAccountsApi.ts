import { getApiUrl } from '../config/api';

export interface CreateNewAccountRequest {
  ua_name: string;
  fs_type: string;
  parent_ga_id: string;
  is_kpi?: boolean;
  is_credit?: boolean | null;
  parent_ua_id?: number | null;
  ua_code?: string | null;
}

export interface GlobalAccount {
  id: string;
  ga_name: string;
  ga_code: string;
  ga_type: string;
  fs_type: string;
}

/**
 * UAD-008: Get all fs_types available in the system
 */
export const getAllFsTypes = async (): Promise<string[]> => {
  const response = await fetch(getApiUrl('/api/fs-types'));
  if (!response.ok) {
    throw new Error('Failed to fetch fs_types');
  }
  const data = await response.json();
  return data.fsTypes;
};

/**
 * UAD-008: Get global accounts (集約科目) for a given fs_type
 */
export const getGlobalAccountsByFsType = async (
  fsType: string
): Promise<GlobalAccount[]> => {
  const response = await fetch(getApiUrl(`/api/global-accounts/${fsType}`));
  if (!response.ok) {
    throw new Error(`Failed to fetch global accounts for fs_type: ${fsType}`);
  }
  const data = await response.json();
  return data.accounts;
};

/**
 * UAD-008-1 & UAD-008-2: Create a new user account
 * This endpoint handles both scenarios:
 * - Adding to existing sheet (existing fs_type)
 * - Creating new sheet (new fs_type)
 */
export const createNewUserAccount = async (
  account: CreateNewAccountRequest
) => {
  const response = await fetch(getApiUrl('/api/user-accounts/upsert'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(account),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to create new user account');
  }

  return response.json();
};
