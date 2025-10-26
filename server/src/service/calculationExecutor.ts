import { FAM } from '../fam/fam';
import type {
  CalculationJobResult,
  CalculationJobStore,
} from '../model/calculation';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, Period, RefInput, RuleInput } from '@/model/types.js';
import { logger } from '../logger';
import { transformToFinancialData } from './financialDataMapper';
import type { CalculationDataResult } from './calculationDataLoader';

interface LoadCalculationInputsParams {
  modelId: number;
  scenarioId: number;
}

type CalculationInputs = CalculationDataResult;

type AccountMasterEntry = CalculationInputs['accountsMaster'][number];

const KNOWN_GAIDS = new Set<string>(Object.values(GAID));

type AccountLookup = {
  byId: Map<string, Account>;
  byUaId: Map<number, Account>;
  byUaCode: Map<string, Account>;
  byGaId: Map<string, Account>;
  byGaCode: Map<string, Account>;
};

const expandGaidCandidates = (value?: string | null): string[] => {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const candidates = [trimmed];
  const upper = trimmed.toUpperCase();
  if (!candidates.includes(upper)) candidates.push(upper);
  const slug = upper.replace(/[^A-Z0-9]+/g, '_');
  if (!candidates.includes(slug)) candidates.push(slug);
  return candidates;
};

const resolveGaIdFromAccount = (account: AccountMasterEntry): string | null => {
  const candidateSources = [
    account.ga?.id,
    account.ga?.ga_code,
    account.parent_ga_id,
  ];

  for (const source of candidateSources) {
    for (const candidate of expandGaidCandidates(source)) {
      if (KNOWN_GAIDS.has(candidate)) {
        return candidate;
      }
    }
  }

  for (const source of candidateSources) {
    const trimmed = source?.trim();
    if (trimmed) return trimmed;
  }

  return null;
};

const DEFAULT_SAME_PERIOD: Period = {
  Period_type: 'Yearly',
  AF_type: 'Forecast',
  Period_val: null,
  offset: 0,
};

const PREV_PERIOD: Period = {
  Period_type: 'Yearly',
  AF_type: 'Actual',
  Period_val: null,
  offset: -1,
};

const normalizePeriod = (raw?: string | null): Period => {
  if (!raw) return DEFAULT_SAME_PERIOD;
  const token = raw.trim().toUpperCase();
  if (token === 'PREV' || token === 'PREVIOUS' || token === 'PRIOR') {
    return PREV_PERIOD;
  }
  if (token === 'ACTUAL') {
    return PREV_PERIOD;
  }
  return DEFAULT_SAME_PERIOD;
};

const buildAccountLookup = (accounts: Account[]): AccountLookup => {
  const byId = new Map<string, Account>();
  const byUaId = new Map<number, Account>();
  const byUaCode = new Map<string, Account>();
  const byGaId = new Map<string, Account>();
  const byGaCode = new Map<string, Account>();

  for (const account of accounts) {
    byId.set(account.id, account);
    const numericId = Number(account.id);
    if (!Number.isNaN(numericId)) {
      if (!byUaId.has(numericId)) byUaId.set(numericId, account);
    }
    if (account.ua_code) {
      const code = account.ua_code.toLowerCase();
      if (!byUaCode.has(code)) byUaCode.set(code, account);
    }
    if (account.parent_ga_id) {
      const gaId = account.parent_ga_id;
      if (!byGaId.has(gaId)) byGaId.set(gaId, account);
    }
    if (account.ga_code) {
      const gaCode = account.ga_code.toLowerCase();
      if (!byGaCode.has(gaCode)) byGaCode.set(gaCode, account);
    }
  }

  return { byId, byUaId, byUaCode, byGaId, byGaCode };
};

const resolveAccountFromReference = (
  reference: any,
  lookup: AccountLookup
): Account => {
  const candidates: (Account | undefined)[] = [];
  if (reference?.userAccountId != null) {
    const ua = lookup.byUaId.get(Number(reference.userAccountId));
    if (ua) candidates.push(ua);
  }
  if (reference?.userAccountCode) {
    const ua = lookup.byUaCode.get(
      String(reference.userAccountCode).toLowerCase()
    );
    if (ua) candidates.push(ua);
  }
  if (reference?.globalAccountId) {
    const ga = lookup.byGaId.get(String(reference.globalAccountId));
    if (ga) candidates.push(ga);
  }
  if (reference?.globalAccountCode) {
    const ga = lookup.byGaCode.get(
      String(reference.globalAccountCode).toLowerCase()
    );
    if (ga) candidates.push(ga);
  }

  const account = candidates.find(Boolean);
  if (account) return account;

  throw new Error(
    `Rule reference could not be resolved (ref=${JSON.stringify(reference)})`
  );
};

const buildExpressionSignMap = (expression: string | undefined) => {
  const signMap = new Map<string, number>();
  if (!expression) return signMap;
  const pattern = /([+\-])?\s*@(?:(ga:)?([A-Za-z0-9_-]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(expression))) {
    const operator = match[1];
    const scope = match[2];
    const identifier = match[3];
    if (!identifier) continue;
    const key = scope === 'ga:' ? `ga:${identifier}` : identifier;
    const sign = operator === '-' ? -1 : 1;
    // 最初の登場を優先。再登場時は上書きしない。
    if (!signMap.has(key)) {
      signMap.set(key, sign);
    }
  }
  return signMap;
};

const normalizeCustomCalcRule = (
  definition: any,
  lookup: AccountLookup
): RuleInput => {
  const references = definition?.formula?.references ?? [];
  if (!Array.isArray(references) || references.length === 0) {
    return { type: 'CALCULATION', refs: [] };
  }

  const expression = definition?.formula?.expression as string | undefined;
  const signMap = buildExpressionSignMap(expression);

  const refs: RefInput[] = references.map((ref: any) => {
    const account = resolveAccountFromReference(ref, lookup);
    const key = ref?.globalAccountId
      ? `ga:${ref.globalAccountId}`
      : String(ref?.userAccountId ?? account.id);
    const operator =
      typeof ref?.operator === 'string' ? ref.operator : undefined;
    const explicitSign =
      operator === '-' ? -1 : operator === '+' ? 1 : undefined;
    const derivedSign = signMap.get(key);
    const sign = explicitSign ?? derivedSign ?? 1;
    return {
      account,
      period: normalizePeriod(ref?.period),
      sign: sign === -1 ? -1 : 1,
    } satisfies RefInput;
  });

  return { type: 'CALCULATION', refs } satisfies RuleInput;
};

const normalizeRatioRule = (
  definition: any,
  targetAccountId: string,
  lookup: AccountLookup
): RuleInput | null => {
  const refAccount = resolveAccountFromReference(definition?.ref, lookup);
  if (refAccount.id === targetAccountId) {
    logger.warn('Ratio rule references itself; falling back to INPUT', {
      targetAccountId,
    });
    return null;
  }
  const value = typeof definition?.value === 'number' ? definition.value : 0;
  return {
    type: 'PERCENTAGE',
    value,
    ref: {
      account: refAccount,
      period: normalizePeriod(definition?.ref?.period),
    },
  } satisfies RuleInput;
};

const normalizeGrowthRateRule = (
  definition: any,
  targetAccount: Account
): RuleInput => {
  const value = typeof definition?.value === 'number' ? definition.value : 0;
  return {
    type: 'GROWTH_RATE',
    value,
    refs: [
      {
        account: targetAccount,
        period: PREV_PERIOD,
      },
    ],
  } satisfies RuleInput;
};

const normalizeInputRule = (definition: any): RuleInput => {
  const value = typeof definition?.value === 'number' ? definition.value : 0;
  return {
    type: 'INPUT',
    value,
  } satisfies RuleInput;
};

const normalizeRuleDefinition = (
  definition: any,
  targetAccountId: string,
  lookup: AccountLookup
): RuleInput | null => {
  if (!definition || typeof definition !== 'object') {
    return null;
  }

  const rawType = definition.type;
  const normalizedType =
    typeof rawType === 'string' ? rawType.trim() : undefined;

  const targetAccount = lookup.byId.get(targetAccountId);

  if (!normalizedType) {
    return null;
  }

  switch (normalizedType) {
    case 'INPUT':
    case 'FIXED_VALUE':
    case 'REFERENCE':
    case 'GROWTH_RATE':
    case 'PERCENTAGE':
    case 'PROPORTIONATE':
    case 'CHILDREN_SUM':
      return definition as RuleInput;

    case 'input':
      return normalizeInputRule(definition);
    case 'growth_rate':
      if (!targetAccount) {
        throw new Error(
          `Target account ${targetAccountId} not found for growth_rate rule`
        );
      }
      return normalizeGrowthRateRule(definition, targetAccount);
    case 'ratio':
      return normalizeRatioRule(definition, targetAccountId, lookup);
    case 'sum_children':
      return { type: 'CHILDREN_SUM' } satisfies RuleInput;
    case 'custom_calc':
      return normalizeCustomCalcRule(definition, lookup);
    case 'calculation':
      return {
        type: 'CALCULATION',
        refs: [],
      } satisfies RuleInput;
    default:
      throw new Error(`Unsupported rule type: ${normalizedType}`);
  }
};

interface CalculationRequest {
  modelId: number;
  scenarioId: number;
  projectionYears: number;
  baseProfitAccountId?: string;
}

interface CalculationExecutorDeps {
  jobStore: CalculationJobStore;
  loadCalculationInputs: (
    params: LoadCalculationInputsParams
  ) => Promise<CalculationInputs>;
  createFam?: () => FAM;
}

const toFamAccount = (account: AccountMasterEntry) => ({
  id: String(account.ua_id ?? account.id),
  AccountName: account.ua_name,
  GlobalAccountID: resolveGaIdFromAccount(account),
  fs_type: account.fs_type,
  is_credit: account.is_credit ?? undefined,
  parent_id: account.parent_ua_id ? String(account.parent_ua_id) : null,
  parent_ua_id: account.parent_ua_id,
  parent_ga_id: account.parent_ga_id,
  parent_ga_type: account.parent_ga_type,
  ga_name: account.ga?.ga_name ?? null,
  ga_code: account.ga?.ga_code ?? null,
  ga_type: account.ga?.ga_type ?? null,
  sort_num: account.ga?.sort_num ?? null,
  indent_num: account.ga?.indent_num ?? null,
  ua_code: account.ua_code ?? null,
  is_kpi: account.is_kpi ?? false,
});

const deriveActualYears = (
  periods: CalculationInputs['periods'],
  length: number
): number[] => {
  const sorted = [...periods].sort((a, b) => a.display_order - b.display_order);
  const candidates = sorted
    .map((p) => {
      const match = p.period_label.match(/(\d{4})$/);
      return match ? Number(match[1]) : undefined;
    })
    .filter((y): y is number => Number.isFinite(y));

  if (candidates.length >= length) {
    return candidates.slice(0, length);
  }

  const base = candidates[0] ?? new Date().getFullYear();
  return Array.from({ length }, (_, i) => base + i);
};

const extractYearFromLabel = (label: string): number | null => {
  const match = label.match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
};

const deriveDisplayYears = (
  periods: CalculationInputs['periods'],
  actualYears: number[],
  projectionYears: number
): number[] => {
  // docs/[PLAN]_phase7_impl_tasks.md: 1.計画期(Projection)の可視化 対応コード
  const sorted = [...periods].sort((a, b) => a.display_order - b.display_order);
  const uniqueActualYears = Array.from(new Set(actualYears)).sort(
    (a, b) => a - b
  );
  const forecastCandidates: number[] = [];

  for (const period of sorted) {
    const year = extractYearFromLabel(period.period_label);
    if (year == null) continue;
    if (period.af_type === 'Forecast' && !forecastCandidates.includes(year)) {
      forecastCandidates.push(year);
    }
  }

  const years: number[] = [...uniqueActualYears];
  const maxTotal = years.length + Math.max(projectionYears, 0);

  for (const year of forecastCandidates) {
    if (years.length >= maxTotal) break;
    if (!years.includes(year)) {
      years.push(year);
    }
  }

  if (!years.length) {
    for (const period of sorted) {
      const year = extractYearFromLabel(period.period_label);
      if (year == null || years.includes(year)) continue;
      years.push(year);
      if (years.length >= Math.max(projectionYears, 0)) break;
    }
  }

  const targetLength = uniqueActualYears.length + Math.max(projectionYears, 0);
  if (targetLength > years.length) {
    let lastYear =
      uniqueActualYears[uniqueActualYears.length - 1] ??
      new Date().getFullYear();
    while (years.length < targetLength) {
      lastYear += 1;
      if (!years.includes(lastYear)) {
        years.push(lastYear);
      }
    }
  }

  years.sort((a, b) => a - b);

  return years;
};

const inferBaseProfitAccount = (
  accounts: CalculationInputs['accountsMaster']
): string | undefined => {
  const preferred = [
    GAID.ORDINARY_INCOME,
    GAID.PROFIT,
    GAID.PROFIT_ATTRIBUTABLE_TO_OWNERS,
    GAID.OPERATING_INCOME,
  ];

  for (const gaid of preferred) {
    const match = accounts.find(
      (account) => resolveGaIdFromAccount(account) === gaid
    );
    if (match) return String(match.ua_id ?? match.id);
  }
  const firstPl = accounts.find((account) => account.fs_type === 'PL');
  return firstPl ? String(firstPl.ua_id ?? firstPl.id) : undefined;
};

export const createCalculationExecutor = ({
  jobStore,
  loadCalculationInputs,
  createFam,
}: CalculationExecutorDeps) => {
  const famFactory = createFam ?? (() => new FAM());

  return async (jobId: string, request: CalculationRequest) => {
    jobStore.update(jobId, { status: 'RUNNING', startedAt: new Date() });

    try {
      const inputs = await loadCalculationInputs({
        modelId: request.modelId,
        scenarioId: request.scenarioId,
        projectionYears: request.projectionYears,
      });

      const fam = famFactory();
      const accounts = inputs.accountsMaster.map(toFamAccount);
      const lookup = buildAccountLookup(accounts);
      const actualYears = deriveActualYears(
        inputs.periods,
        inputs.prevs.length
      );

      fam.importActuals(inputs.prevs, accounts, { actualYears });

      const ruleMap: Record<string, RuleInput> = {};
      for (const rule of inputs.parameterRules) {
        const targetId = String(rule.target_user_account_id);
        try {
          const normalized = normalizeRuleDefinition(
            rule.rule_definition,
            targetId,
            lookup
          );
          if (normalized) {
            ruleMap[targetId] = normalized;
          }
        } catch (error) {
          logger.warn(
            'Failed to normalize parameter rule',
            {
              modelId: request.modelId,
              scenarioId: request.scenarioId,
              targetAccountId: targetId,
            },
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      const latestActualSnapshot = inputs.prevs.at(-1) ?? {};
      const fallbackAccounts: string[] = [];
      for (const account of accounts) {
        const id = account.id;
        if (ruleMap[id]) continue;
        const rawValue = latestActualSnapshot[id];
        const fallbackValue =
          typeof rawValue === 'number' && Number.isFinite(rawValue)
            ? rawValue
            : 0;
        ruleMap[id] = {
          type: 'INPUT',
          value: fallbackValue,
        } satisfies RuleInput;
        fallbackAccounts.push(id);
      }

      if (fallbackAccounts.length) {
        logger.debug('Applied fallback INPUT rules for accounts', {
          accounts: fallbackAccounts,
        });
      }

      fam.setRules(ruleMap);
      fam.setBalanceChange(inputs.balanceChanges as any);

      const cashAccountExists = accounts.some(
        (account) => account.GlobalAccountID === GAID.CASH
      );
      const baseProfitAccount =
        request.baseProfitAccountId ??
        inferBaseProfitAccount(inputs.accountsMaster);

      if (request.projectionYears > 0 && cashAccountExists) {
        try {
          // docs/[PLAN]_phase7_impl_tasks.md: 1.計画期(Projection)の可視化 対応コード
          fam.compute({
            years: request.projectionYears,
            baseProfitAccount: baseProfitAccount ?? '',
            cashAccount: GAID.CASH,
          });
        } catch (error) {
          logger.warn(
            'FAM.compute failed; forecast projection skipped',
            {
              modelId: request.modelId,
              scenarioId: request.scenarioId,
            },
            error instanceof Error ? error.message : String(error)
          );
        }
      } else if (request.projectionYears > 0) {
        logger.warn('FAM.compute skipped because GAID.CASH account not found', {
          modelId: request.modelId,
          scenarioId: request.scenarioId,
        });
      }

      const years = deriveDisplayYears(
        inputs.periods,
        actualYears,
        request.projectionYears
      );

      const yearsForTables = years.length ? years : actualYears.slice();
      const fsPriority: Array<'PL' | 'BS' | 'CF'> = ['PL', 'BS', 'CF'];
      const availableFs = new Set(
        inputs.accountsMaster
          .map((account) => account.fs_type)
          .filter((fs): fs is 'PL' | 'BS' | 'CF' =>
            ['PL', 'BS', 'CF'].includes(fs as string)
          )
      );
      const calculationTimestamp = new Date().toISOString();
      let payload: CalculationJobResult | null = null;

      for (const fs of fsPriority) {
        if (fs !== 'PL' && !availableFs.has(fs)) continue;

        const table = fam.getTable({
          fs,
          years: yearsForTables,
        });

        if (!table.rows.length) {
          continue;
        }

        const result = transformToFinancialData({
          table,
          periods: inputs.periods,
          modelId: request.modelId,
          scenarioId: request.scenarioId,
          calculationTimestamp,
        });

        const filteredData = result.financialData.filter(
          (entry) => entry.fs_type === fs
        );

        if (!filteredData.length) continue;

        if (!payload) {
          payload = {
            ...result,
            financialData: filteredData,
          };
        } else {
          payload.financialData.push(...filteredData);
        }
      }

      const finalPayload =
        payload ??
        ({
          metadata: {
            modelId: request.modelId,
            scenarioId: request.scenarioId,
            currency: null,
            calculationTimestamp,
          },
          financialData: [],
        } satisfies CalculationJobResult);

      jobStore.setResult(jobId, finalPayload);
      jobStore.update(jobId, {
        status: 'COMPLETED',
        completedAt: new Date(),
      });
    } catch (error) {
      jobStore.update(jobId, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      });
    }
  };
};
