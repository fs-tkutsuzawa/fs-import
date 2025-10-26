import {
  CalculationRule,
  CreateCalculationRuleRequest,
  UpdateCalculationRuleRequest,
  GetCalculationRulesQuery,
} from '../types/calculationRules';
import { getApiUrl } from '../config/api';

const API_BASE_URL = getApiUrl('/api/calculation-rules');

export class CalculationRulesAPI {
  /**
   * Get calculation rules based on query parameters
   */
  static async getCalculationRules(
    query?: GetCalculationRulesQuery
  ): Promise<CalculationRule[]> {
    const params = new URLSearchParams();

    if (query?.targetAccountId) {
      params.append('targetAccountId', query.targetAccountId);
    }
    if (query?.scenarioId) {
      params.append('scenarioId', String(query.scenarioId));
    }
    if (query?.periodId) {
      params.append('periodId', String(query.periodId));
    }

    const queryString = params.toString();
    const url = queryString ? `${API_BASE_URL}?${queryString}` : API_BASE_URL;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch calculation rules: ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Get a single calculation rule for a specific account, scenario, and period
   */
  static async getCalculationRule(
    targetAccountId: string,
    scenarioId: string | number,
    periodId?: string | number | null
  ): Promise<CalculationRule | null> {
    const rules = await this.getCalculationRules({
      targetAccountId,
      scenarioId,
      periodId: periodId || undefined,
    });

    return rules.length > 0 ? rules[0] : null;
  }

  /**
   * Create or update a calculation rule
   */
  static async saveCalculationRule(
    request: CreateCalculationRuleRequest
  ): Promise<CalculationRule> {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to save calculation rule');
    }

    return response.json();
  }

  /**
   * Update an existing calculation rule by ID
   */
  static async updateCalculationRule(
    request: UpdateCalculationRuleRequest
  ): Promise<CalculationRule> {
    const response = await fetch(API_BASE_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to update calculation rule');
    }

    return response.json();
  }

  /**
   * Delete a calculation rule
   */
  static async deleteCalculationRule(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}?id=${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to delete calculation rule');
    }
  }

  /**
   * Save multiple calculation rules in a batch
   */
  static async saveCalculationRulesBatch(
    requests: CreateCalculationRuleRequest[]
  ): Promise<CalculationRule[]> {
    const results: CalculationRule[] = [];
    const errors: string[] = [];

    // Process rules sequentially to maintain order and handle dependencies
    for (const request of requests) {
      try {
        const result = await this.saveCalculationRule(request);
        results.push(result);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(
          `Failed to save rule for account ${request.targetAccountId}: ${errorMessage}`
        );
      }
    }

    if (errors.length > 0) {
      console.error('Batch save errors:', errors);
    }

    return results;
  }

  /**
   * Helper function to get account name from ID
   * This would typically call another API to get account details
   */
  static async getAccountName(accountId: string): Promise<string> {
    // This is a placeholder - implement actual API call to get account name
    try {
      const response = await fetch(
        getApiUrl(`/api/user-accounts/${accountId}`)
      );
      if (response.ok) {
        const account = await response.json();
        return account.ua_name || account.account_name || '';
      }
    } catch (error) {
      console.error('Failed to fetch account name:', error);
    }
    return '';
  }

  /**
   * Helper function to convert UI parameter config to API request format
   */
  static prepareCalculationRuleRequest(
    targetAccountId: string,
    scenarioId: string | number,
    parameterType: string,
    config: any,
    periodId?: string | number | null
  ): CreateCalculationRuleRequest {
    // Handle account name enrichment for references
    const enrichedConfig = { ...config };

    // For ratio and link types, ensure we have account names
    if (
      (parameterType === 'ratio' || parameterType === 'link') &&
      config.targetAccountId
    ) {
      enrichedConfig.targetAccountName = enrichedConfig.targetAccountName || '';
    }

    return {
      targetAccountId,
      scenarioId,
      periodId: periodId || undefined,
      type: parameterType as any,
      config: enrichedConfig,
    };
  }
}
