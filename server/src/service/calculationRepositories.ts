import pool from '../api/db';
import type {
  RawUserAccount,
  RawGlobalAccount,
  RawPeriod,
  RawCalculationRule,
} from './calculationDataTransforms.js';

export type IntegratedAccountViewRow = {
  source: 'USER_ACCOUNT' | 'GLOBAL_ONLY';
  user_account_id: number | null;
  ua_name: string | null;
  ua_code: string | null;
  ua_fs_type: string | null;
  is_credit: boolean | null;
  is_kpi: boolean | null;
  parent_ua_id: number | null;
  global_account_id: string;
  ga_name: string;
  ga_code: string;
  ga_type: 'super_calc' | 'aggregate';
  ga_fs_type: string;
  ga_is_credit: boolean | null;
  sort_num: number;
  indent_num: number;
  ga_parent_ga_id: string | null;
};

const mapUserAccount = (row: any): RawUserAccount => ({
  id: row.id,
  ua_name: row.ua_name,
  ua_code: row.ua_code,
  fs_type: row.fs_type,
  is_credit: row.is_credit,
  is_kpi: row.is_kpi,
  parent_ga_id: row.parent_ga_id,
  parent_ga_type: row.parent_ga_type,
  parent_ua_id: row.parent_ua_id,
});

const mapGlobalAccount = (row: any): RawGlobalAccount => ({
  id: row.id,
  ga_name: row.ga_name,
  ga_code: row.ga_code,
  ga_type: row.ga_type,
  fs_type: row.fs_type,
  is_credit: row.is_credit,
  parent_ga_id: row.parent_ga_id,
  sort_num: row.sort_num,
  indent_num: row.indent_num,
});

const mapPeriod = (row: any): RawPeriod => ({
  id: row.id,
  scenario_id: row.scenario_id,
  period_label: row.period_label,
  display_order: row.display_order,
  period_val: row.period_val,
  period_type: row.period_type,
  af_type: row.af_type,
});

const mapCalculationRule = (row: any): RawCalculationRule => ({
  id: row.id,
  target_user_account_id: row.target_user_account_id,
  scenario_id: row.scenario_id,
  period_id: row.period_id,
  rule_type: row.rule_type,
  rule_definition: row.rule_definition,
});

const mapIntegratedAccount = (row: any): IntegratedAccountViewRow => ({
  source: row.source,
  user_account_id: row.user_account_id,
  ua_name: row.ua_name,
  ua_code: row.ua_code,
  ua_fs_type: row.ua_fs_type,
  is_credit: row.is_credit,
  is_kpi: row.is_kpi,
  parent_ua_id: row.parent_ua_id,
  global_account_id: row.global_account_id,
  ga_name: row.ga_name,
  ga_code: row.ga_code,
  ga_type: row.ga_type,
  ga_fs_type: row.ga_fs_type,
  ga_is_credit: row.ga_is_credit,
  sort_num: row.sort_num,
  indent_num: row.indent_num,
  ga_parent_ga_id: row.ga_parent_ga_id,
});

export const fetchUserAccounts = async (
  modelId: number
): Promise<RawUserAccount[]> => {
  const sql = `
    SELECT ua.id,
           ua.ua_name,
           ua.ua_code,
           ua.fs_type,
           ua.is_credit,
           ua.is_kpi,
           ua.parent_ga_id,
           ua.parent_ga_type,
           ua.parent_ua_id
    FROM user_accounts ua
    INNER JOIN import_df idf ON idf.model_id = $1
  `;
  const result = await pool.query(sql, [modelId]);
  return result.rows.map(mapUserAccount);
};

export const fetchGlobalAccounts = async (): Promise<RawGlobalAccount[]> => {
  const sql = `
    SELECT id,
           ga_name,
           ga_code,
           ga_type,
           fs_type,
           is_credit,
           parent_ga_id,
           sort_num,
           indent_num
    FROM global_accounts
  `;
  const result = await pool.query(sql);
  return result.rows.map(mapGlobalAccount);
};

export const fetchPeriods = async (
  scenarioId: number
): Promise<RawPeriod[]> => {
  const sql = `
    SELECT id,
           scenario_id,
           period_label,
           display_order,
           period_val,
           period_type,
           af_type
    FROM periods
    WHERE scenario_id = $1
    ORDER BY display_order
  `;
  const result = await pool.query(sql, [scenarioId]);
  return result.rows.map(mapPeriod);
};

export const fetchImportDf = async (
  modelId: number
): Promise<{ df_json: Array<Record<string, number>> }> => {
  const sql = `
    SELECT df_json
    FROM import_df
    WHERE model_id = $1
    ORDER BY id DESC
    LIMIT 1
  `;
  const result = await pool.query(sql, [modelId]);
  if (result.rows.length === 0) {
    throw new Error('import_df が見つかりません');
  }
  let dfJson = result.rows[0].df_json;

  if (Buffer.isBuffer(dfJson)) {
    dfJson = dfJson.toString('utf-8');
  }

  if (typeof dfJson === 'string') {
    try {
      dfJson = JSON.parse(dfJson);
    } catch (error) {
      throw new Error('import_df.df_json の解析に失敗しました');
    }
  }

  return { df_json: dfJson };
};

export const fetchCalculationRules = async (
  scenarioId: number
): Promise<RawCalculationRule[]> => {
  const sql = `
    SELECT id,
           target_user_account_id,
           scenario_id,
           period_id,
           rule_type,
           rule_definition
    FROM calculation_rules
    WHERE scenario_id = $1
  `;
  const result = await pool.query(sql, [scenarioId]);
  return result.rows.map(mapCalculationRule);
};

export const fetchIntegratedAccountsView = async (): Promise<
  IntegratedAccountViewRow[]
> => {
  const sql = `
      SELECT source,
             user_account_id,
             ua_name,
             ua_code,
             ua_fs_type,
             is_credit,
             is_kpi,
             parent_ua_id,
             global_account_id,
             ga_name,
             ga_code,
             ga_type,
             ga_fs_type,
             ga_is_credit,
             sort_num,
             indent_num,
             ga_parent_ga_id
        FROM integrated_accounts_view
    `;
  const result = await pool.query(sql);
  return result.rows.map(mapIntegratedAccount);
};

export const calculationRepositories = {
  fetchUserAccounts,
  fetchGlobalAccounts,
  fetchPeriods,
  fetchImportDf,
  fetchCalculationRules,
  fetchIntegratedAccountsView,
};
