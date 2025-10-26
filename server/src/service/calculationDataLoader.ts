import {
  joinAccounts,
  buildOrderedPeriods,
  convertImportDfToPrevs,
  partitionCalculationRules,
  type JoinedAccount,
  type OrderedPeriod,
  type RawCalculationRule,
  type RawGlobalAccount,
  type RawPeriod,
  type RawUserAccount,
} from './calculationDataTransforms';
import type { ExistingPeriodRecord } from './timeline/timelineReconciler.ts';

import type { IntegratedAccountViewRow } from './calculationRepositories.js';

type CustomCalcReference = {
  userAccountId?: number;
  operator?: '+' | '-' | '*' | '/';
};

type CustomCalcRuleDefinition = {
  type?: string;
  formula?: {
    references?: CustomCalcReference[];
  };
};

interface FetchDependencies {
  fetchUserAccounts: (modelId: number) => Promise<RawUserAccount[]>;
  fetchGlobalAccounts: () => Promise<RawGlobalAccount[]>;
  fetchPeriods: (scenarioId: number) => Promise<RawPeriod[]>;
  fetchImportDf: (
    modelId: number
  ) => Promise<{ df_json: Array<Record<string, number>> }>;
  fetchCalculationRules: (scenarioId: number) => Promise<RawCalculationRule[]>;
  fetchIntegratedAccountsView?: () => Promise<IntegratedAccountViewRow[]>;
  ensureScenarioTimeline?: (params: {
    modelId: number;
    scenarioId: number;
    importDf: unknown;
    projectionYears?: number;
  }) => Promise<ExistingPeriodRecord[]>;
}

const normalizePrevsAccountIds = (
  snapshots: Array<Record<string, number>>,
  accounts: JoinedAccount[],
  integratedRows?: IntegratedAccountViewRow[] | null
) => {
  if (!snapshots.length) return snapshots;

  const accountIdLookup = new Map<string, string>();
  const setLookup = (key: string | null | undefined, value: string) => {
    if (!key) return;
    const trimmed = key.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (!accountIdLookup.has(trimmed)) {
      accountIdLookup.set(trimmed, value);
    }
    if (!accountIdLookup.has(lower)) {
      accountIdLookup.set(lower, value);
    }
  };

  for (const account of accounts) {
    const uaId = String(account.ua_id);
    setLookup(uaId, uaId);
    if (account.id) setLookup(String(account.id), uaId);
    setLookup(account.ua_name, uaId);
    setLookup(account.ua_code, uaId);
    if (account.ga?.ga_name) setLookup(account.ga.ga_name, uaId);
    if (account.ga?.ga_code) setLookup(account.ga.ga_code, uaId);
  }

  if (integratedRows) {
    for (const row of integratedRows) {
      if (row.source !== 'USER_ACCOUNT') continue;
      const uaId =
        row.user_account_id != null ? String(row.user_account_id) : null;
      if (!uaId) continue;
      setLookup(row.ua_name, uaId);
      setLookup(row.ua_code, uaId);
      setLookup(row.ga_name, uaId);
      setLookup(row.ga_code, uaId);
    }
  }

  const missingKeys = new Set<string>();
  const numericPattern = /^\d+$/;

  const normalizedSnapshots = snapshots.map((snapshot) => {
    const normalized: Record<string, number> = {};

    for (const [rawKey, value] of Object.entries(snapshot)) {
      if (value == null) continue;
      const trimmedKey = rawKey.trim();

      const resolvedKey = numericPattern.test(trimmedKey)
        ? trimmedKey
        : (accountIdLookup.get(trimmedKey) ??
          accountIdLookup.get(trimmedKey.toLowerCase()));

      if (!resolvedKey) {
        missingKeys.add(trimmedKey);
        continue;
      }

      normalized[resolvedKey] = value;
    }

    return normalized;
  });

  if (missingKeys.size > 0) {
    const missingList = Array.from(missingKeys).join(', ');
    throw new Error(
      `PREVS に未解決の勘定キーがあります: ${missingList}. ` +
        'UA を同期するには「npm run sync:ua」を実行してください。'
    );
  }

  return normalizedSnapshots;
};

const applyOperator = (
  accumulator: number,
  operator: CustomCalcReference['operator'],
  value: number
): number | null => {
  switch (operator) {
    case '-':
      return accumulator - value;
    case '*':
      return accumulator * value;
    case '/':
      if (value === 0) return null;
      return accumulator / value;
    case '+':
    default:
      return accumulator + value;
  }
};

const extractReferenceId = (reference: CustomCalcReference): string | null => {
  const id = reference.userAccountId;
  if (id == null) return null;
  return String(id);
};

const fillMissingSuperCalcActuals = (
  snapshots: Array<Record<string, number>>,
  parameterRules: RawCalculationRule[]
) => {
  if (!snapshots.length || !parameterRules.length) return;

  const ruleMap = new Map<string, CustomCalcReference[]>();

  for (const rule of parameterRules) {
    const definition = rule.rule_definition as
      | CustomCalcRuleDefinition
      | undefined;
    if (definition?.type !== 'custom_calc') continue;
    const refs = definition.formula?.references ?? [];
    const normalizedRefs = refs
      .map((reference) => ({
        operator: reference.operator ?? '+',
        userAccountId: reference.userAccountId,
      }))
      .filter((reference) => reference.userAccountId != null);
    if (normalizedRefs.length === 0) continue;
    ruleMap.set(String(rule.target_user_account_id), normalizedRefs);
  }

  if (ruleMap.size === 0) return;

  snapshots.forEach((snapshot) => {
    const memo = new Map<string, number>();

    const evaluate = (
      targetId: string,
      visiting: Set<string>
    ): number | undefined => {
      const currentValue = snapshot[targetId];
      if (typeof currentValue === 'number') return currentValue;
      if (memo.has(targetId)) return memo.get(targetId);
      const references = ruleMap.get(targetId);
      if (!references) return undefined;
      if (visiting.has(targetId)) return undefined;

      visiting.add(targetId);

      let total = 0;
      let seen = false;

      for (const reference of references) {
        const refId = extractReferenceId(reference);
        if (!refId) {
          visiting.delete(targetId);
          return undefined;
        }
        const refValue = evaluate(refId, visiting);
        if (refValue == null) {
          visiting.delete(targetId);
          return undefined;
        }
        if (
          !seen &&
          (reference.operator === '*' || reference.operator === '/')
        ) {
          total = refValue;
          seen = true;
          continue;
        }
        const next = applyOperator(total, reference.operator, refValue);
        if (next == null) {
          visiting.delete(targetId);
          return undefined;
        }
        total = next;
        seen = true;
      }

      visiting.delete(targetId);

      if (!seen) return undefined;

      memo.set(targetId, total);
      return total;
    };

    for (const targetId of ruleMap.keys()) {
      if (snapshot[targetId] != null) continue;
      const value = evaluate(targetId, new Set<string>());
      if (value != null) {
        snapshot[targetId] = value;
      }
    }
  });
};

export interface CalculationDataResult {
  accountsMaster: JoinedAccount[];
  periods: OrderedPeriod[];
  prevs: Array<Record<string, number>>;
  parameterRules: RawCalculationRule[];
  balanceChanges: RawCalculationRule[];
}

export interface CalculationDataParams {
  modelId: number;
  scenarioId: number;
  projectionYears?: number;
}

export const createCalculationDataLoader = (deps: FetchDependencies) => {
  return async ({
    modelId,
    scenarioId,
    projectionYears,
  }: CalculationDataParams) => {
    const [userAccounts, globalAccounts, importDf, rules, integratedRows] =
      await Promise.all([
        deps.fetchUserAccounts(modelId),
        deps.fetchGlobalAccounts(),
        deps.fetchImportDf(modelId),
        deps.fetchCalculationRules(scenarioId),
        deps.fetchIntegratedAccountsView
          ? deps.fetchIntegratedAccountsView()
          : Promise.resolve(null),
      ]);

    if (integratedRows) {
      const missingGlobalOnly = integratedRows.filter(
        (row) => row.source === 'GLOBAL_ONLY'
      );
      if (missingGlobalOnly.length > 0) {
        const missingCodes = missingGlobalOnly
          .slice(0, 10)
          .map((row) => row.ga_code)
          .join(', ');
        throw new Error(
          `ユーザー勘定が未登録のグローバル勘定があります: ${missingCodes}. ` +
            '「npm run sync:ua」で user_accounts を同期してください。'
        );
      }
    }

    let rawPeriods: RawPeriod[] | null = null;
    if (deps.ensureScenarioTimeline) {
      try {
        const ensured = await deps.ensureScenarioTimeline({
          modelId,
          scenarioId,
          importDf: importDf.df_json,
          projectionYears,
        });
        rawPeriods = ensured.map(
          (entry) =>
            ({
              id: entry.id,
              scenario_id: entry.scenario_id,
              period_label: entry.period_label,
              display_order: entry.display_order,
              period_val: entry.period_val,
              period_type: entry.period_type,
              af_type: entry.af_type,
            }) satisfies RawPeriod
        );
      } catch (error) {
        console.warn(
          `タイムライン同期に失敗しました (scenarioId=${scenarioId}):`,
          error
        );
      }
    }

    if (!rawPeriods) {
      rawPeriods = await deps.fetchPeriods(scenarioId);
    }

    if (!rawPeriods.length) {
      throw new Error(
        `シナリオID ${scenarioId} に対応する期間情報が存在しません。import_df を同期し、管理APIまたは CLI でタイムラインを登録してください。`
      );
    }

    const accountsMaster = joinAccounts(userAccounts, globalAccounts);
    const orderedPeriods = buildOrderedPeriods(rawPeriods);
    const prevs = normalizePrevsAccountIds(
      convertImportDfToPrevs(importDf),
      accountsMaster,
      integratedRows
    );
    const { parameterRules, balanceChanges } = partitionCalculationRules(rules);
    fillMissingSuperCalcActuals(prevs, parameterRules);

    return {
      accountsMaster,
      periods: orderedPeriods,
      prevs,
      parameterRules,
      balanceChanges,
    } satisfies CalculationDataResult;
  };
};
