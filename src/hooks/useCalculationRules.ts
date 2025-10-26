import { useState, useCallback, useEffect } from 'react';
import { CalculationRulesAPI } from '../api/calculationRules';
import {
  CalculationRule,
  ParameterType,
  ParameterConfig,
} from '../types/calculationRules';

interface UseCalculationRulesProps {
  scenarioId?: string | number;
  periodId?: string | number | null;
}

interface UseCalculationRulesReturn {
  rules: Map<string, CalculationRule>;
  loading: boolean;
  error: string | null;
  saveParameterSetting: (
    targetAccountId: string,
    parameterType: ParameterType,
    config: ParameterConfig
  ) => Promise<void>;
  loadRuleForAccount: (
    targetAccountId: string
  ) => Promise<CalculationRule | null>;
  deleteRule: (targetAccountId: string) => Promise<void>;
  refreshRules: () => Promise<void>;
}

export function useCalculationRules({
  scenarioId,
  periodId = null,
}: UseCalculationRulesProps): UseCalculationRulesReturn {
  const [rules, setRules] = useState<Map<string, CalculationRule>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all rules for the scenario
  const loadRules = useCallback(async () => {
    if (!scenarioId) return;

    setLoading(true);
    setError(null);

    try {
      const fetchedRules = await CalculationRulesAPI.getCalculationRules({
        scenarioId,
        periodId: periodId || undefined,
      });

      const rulesMap = new Map<string, CalculationRule>();
      fetchedRules.forEach((rule: CalculationRule) => {
        const key = `ua-${rule.target_user_account_id}`;
        rulesMap.set(key, rule);
      });

      setRules(rulesMap);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load calculation rules'
      );
      console.error('Error loading calculation rules:', err);
    } finally {
      setLoading(false);
    }
  }, [scenarioId, periodId]);

  // Load rule for a specific account
  const loadRuleForAccount = useCallback(
    async (targetAccountId: string): Promise<CalculationRule | null> => {
      if (!scenarioId) return null;

      try {
        const rule = await CalculationRulesAPI.getCalculationRule(
          targetAccountId,
          scenarioId,
          periodId
        );

        if (rule) {
          setRules((prev) => {
            const newRules = new Map(prev);
            newRules.set(targetAccountId, rule);
            return newRules;
          });
        }

        return rule;
      } catch (err) {
        console.error('Error loading rule for account:', err);
        return null;
      }
    },
    [scenarioId, periodId]
  );

  // Save parameter setting
  const saveParameterSetting = useCallback(
    async (
      targetAccountId: string,
      parameterType: ParameterType,
      config: ParameterConfig
    ) => {
      if (!scenarioId) {
        throw new Error('Scenario ID is required to save calculation rules');
      }

      setError(null);

      try {
        // Check if this is an 'input' type - if so, delete the rule instead
        if (parameterType === 'input') {
          const existingRule = rules.get(targetAccountId);
          if (existingRule?.id) {
            await CalculationRulesAPI.deleteCalculationRule(existingRule.id);
            setRules((prev) => {
              const newRules = new Map(prev);
              newRules.delete(targetAccountId);
              return newRules;
            });
          }
          return;
        }

        // Validate config for types that require reference account
        if (parameterType === 'ratio' || parameterType === 'link') {
          const refId =
            (config as any).targetAccountId || (config as any).referenceId;
          if (
            !refId ||
            refId === '' ||
            refId === 'ua-null' ||
            refId === 'null'
          ) {
            throw new Error(
              '参照科目が選択されていません。科目を選択してください。'
            );
          }
        }

        // Prepare the request
        const request = CalculationRulesAPI.prepareCalculationRuleRequest(
          targetAccountId,
          scenarioId,
          parameterType,
          config,
          periodId
        );

        // Save the rule
        const savedRule =
          await CalculationRulesAPI.saveCalculationRule(request);

        // Update local state
        setRules((prev) => {
          const newRules = new Map(prev);
          newRules.set(targetAccountId, savedRule);
          return newRules;
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to save parameter setting';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [scenarioId, periodId, rules]
  );

  // Delete a rule
  const deleteRule = useCallback(
    async (targetAccountId: string) => {
      const rule = rules.get(targetAccountId);
      if (!rule?.id) return;

      try {
        await CalculationRulesAPI.deleteCalculationRule(rule.id);
        setRules((prev) => {
          const newRules = new Map(prev);
          newRules.delete(targetAccountId);
          return newRules;
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to delete rule';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [rules]
  );

  // Refresh all rules
  const refreshRules = useCallback(async () => {
    await loadRules();
  }, [loadRules]);

  // Load rules on mount and when dependencies change
  useEffect(() => {
    if (scenarioId) {
      loadRules();
    }
  }, [scenarioId, periodId, loadRules]);

  return {
    rules,
    loading,
    error,
    saveParameterSetting,
    loadRuleForAccount,
    deleteRule,
    refreshRules,
  };
}

// Helper function to normalize period value (default to 'SAME' if undefined)
function normalizePeriod(period: string | undefined): 'PREV' | 'SAME' {
  if (period === 'PREV') return 'PREV';
  return 'SAME';
}

// Helper function to convert stored rule back to UI config format
export function convertRuleToUIConfig(rule: CalculationRule | null): {
  type: ParameterType | 'prev_end_plus_change';
  config: ParameterConfig;
} | null {
  if (!rule) return null;

  const definition = rule.rule_definition as any;

  // Handle BALANCE_AND_CHANGE type
  if (rule.rule_type === 'BALANCE_AND_CHANGE') {
    const flows = (definition.instructions || []).map((inst: any) => {
      const flow: any = {};

      // New schema: driver/value + counter + effect
      if (inst.driver || inst.value !== undefined || inst.counter) {
        // Handle counter (can be GA or UA)
        flow.counterAccountId = inst.counter?.globalAccountId
          ? inst.counter.globalAccountId
          : inst.counter?.userAccountId
            ? `ua-${inst.counter.userAccountId}`
            : '';

        // Handle driver or value
        if (inst.driver) {
          // Handle driver (can be GA or UA)
          flow.flowAccountId = inst.driver.globalAccountId
            ? inst.driver.globalAccountId
            : inst.driver.userAccountId
              ? `ua-${inst.driver.userAccountId}`
              : '';
          flow.period = normalizePeriod(inst.driver.period);
        } else if (inst.value !== undefined) {
          flow.value = inst.value;
        }

        // Convert effect to sign for UI
        flow.sign = inst.effect === 'INCREASE' ? '+' : '-';
      }
      // Old schema: flow_user_account_id + sign + counter_user_account_id
      else {
        flow.flowAccountId = inst.flow_user_account_id
          ? `ua-${inst.flow_user_account_id}`
          : '';
        flow.sign = inst.sign || '+';
        flow.counterAccountId = inst.counter_user_account_id
          ? `ua-${inst.counter_user_account_id}`
          : '';
      }

      return flow;
    });

    return {
      type: 'prev_end_plus_change',
      config: { flows },
    };
  }

  // Handle PARAMETER types (including old 'formula' type as 'custom_calc')
  let type = definition.type as ParameterType;

  // Map old 'formula' type to 'custom_calc'
  if (type === ('formula' as any)) {
    type = 'custom_calc';
  }

  let config: ParameterConfig = {};

  switch (type) {
    case 'input':
      config = {};
      break;

    case 'growth_rate':
      config = {
        rate: (definition.value || 0) * 100, // Convert decimal to percentage
      };
      break;

    case 'ratio':
      config = {
        targetAccountId: definition.ref?.globalAccountId
          ? definition.ref.globalAccountId
          : definition.ref?.userAccountId
            ? `ua-${definition.ref.userAccountId}`
            : '',
        targetAccountName:
          definition.ref?.accountName || definition.ref?.userAccountName || '',
        ratio: (definition.value || 0) * 100, // Convert decimal to percentage
        period: normalizePeriod(definition.ref?.period),
      };
      break;

    case 'link':
      config = {
        targetAccountId: definition.ref?.globalAccountId
          ? definition.ref.globalAccountId
          : definition.ref?.userAccountId
            ? `ua-${definition.ref.userAccountId}`
            : '',
        targetAccountName:
          definition.ref?.accountName || definition.ref?.userAccountName || '',
        period: normalizePeriod(definition.ref?.period),
      };
      break;

    case 'sum_children':
      config = {};
      break;

    case 'custom_calc':
      // Extract operators from the formula expression
      if (definition.formula?.expression) {
        const expression = definition.formula.expression;
        const operators: string[] = [];

        // Parse expression to extract operators
        const operatorMatches = expression.match(/[+\-*/]/g) || [];
        operatorMatches.forEach((op: string) => {
          const uiOp = op === '*' ? '×' : op === '/' ? '÷' : op;
          operators.push(uiOp);
        });

        config = { operators };
      } else {
        config = {};
      }
      break;

    default:
      console.warn(`Unknown parameter type: ${type}`);
  }

  return { type, config };
}
