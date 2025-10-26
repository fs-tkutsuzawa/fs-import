// Types for calculation rules and parameter configurations

export type RuleType = 'PARAMETER' | 'BALANCE_AND_CHANGE';

export type ParameterType =
  | 'input'
  | 'growth_rate'
  | 'ratio'
  | 'link'
  | 'sum_children'
  | 'custom_calc';

// Configuration objects for different parameter types
export interface BaseConfig {
  type?: string;
}

export interface GrowthRateConfig extends BaseConfig {
  rate: number; // Percentage value (e.g., 5 for 5%)
}

export interface RatioConfig extends BaseConfig {
  targetAccountId: string;
  targetAccountName?: string;
  ratio: number; // Percentage value
  period?: 'PREV' | 'SAME';
}

export interface LinkConfig extends BaseConfig {
  targetAccountId: string;
  targetAccountName?: string;
  period?: 'PREV' | 'SAME';
}

export interface CustomCalcConfig extends BaseConfig {
  operators?: string[]; // Array of operators between children
}

export interface FlowInstruction {
  flowAccountId: string;
  flowAccountSheet?: string;
  sign: '+' | '-';
  counterAccountId: string;
}

export interface PrevEndPlusChangeConfig extends BaseConfig {
  flows: FlowInstruction[];
}

export type ParameterConfig =
  | BaseConfig
  | GrowthRateConfig
  | RatioConfig
  | LinkConfig
  | CustomCalcConfig
  | PrevEndPlusChangeConfig;

// Database record structure
export interface CalculationRule {
  id?: number;
  target_user_account_id: number;
  scenario_id: number;
  period_id?: number | null;
  rule_type: RuleType;
  rule_definition: RuleDefinitionJSON;
  created_at?: string;
  updated_at?: string;
}

// JSON structures for rule_definition column
export interface RefObject {
  userAccountId: number;
  userAccountName: string;
  period?: 'PREV' | 'SAME';
}

export interface FormulaObject {
  expression: string;
  references: RefObject[];
}

// PARAMETER type JSON definitions
export interface InputJSON {
  type: 'input';
}

export interface GrowthRateJSON {
  type: 'growth_rate';
  value: number; // Decimal value (e.g., 0.05 for 5%)
}

export interface RatioJSON {
  type: 'ratio';
  value: number; // Decimal value
  ref: RefObject;
}

export interface LinkJSON {
  type: 'link';
  ref: RefObject;
}

export interface SumChildrenJSON {
  type: 'sum_children';
}

export interface CustomCalcJSON {
  type: 'custom_calc';
  formula: FormulaObject;
}

export type ParameterRuleDefinition =
  | InputJSON
  | GrowthRateJSON
  | RatioJSON
  | LinkJSON
  | SumChildrenJSON
  | CustomCalcJSON;

// BALANCE_AND_CHANGE type JSON definition
export interface BalanceChangeInstruction {
  driver?: RefObject;
  value?: number;
  counter: RefObject;
  effect: 'INCREASE' | 'DECREASE';
}

export interface BalanceAndChangeJSON {
  instructions: BalanceChangeInstruction[];
}

export type RuleDefinitionJSON = ParameterRuleDefinition | BalanceAndChangeJSON;

// API request/response types
export interface CreateCalculationRuleRequest {
  targetAccountId: string;
  scenarioId: string | number;
  periodId?: string | number | null;
  type: ParameterType;
  config: ParameterConfig;
}

export interface UpdateCalculationRuleRequest {
  id: number;
  type: ParameterType;
  config: ParameterConfig;
}

export interface GetCalculationRulesQuery {
  targetAccountId?: string;
  scenarioId?: string | number;
  periodId?: string | number;
}

// Helper function to identify config type
export function isGrowthRateConfig(
  config: ParameterConfig
): config is GrowthRateConfig {
  return 'rate' in config;
}

export function isRatioConfig(config: ParameterConfig): config is RatioConfig {
  return 'ratio' in config && 'targetAccountId' in config;
}

export function isLinkConfig(config: ParameterConfig): config is LinkConfig {
  return 'targetAccountId' in config && !('ratio' in config);
}

export function isCustomCalcConfig(
  config: ParameterConfig
): config is CustomCalcConfig {
  return 'operators' in config;
}

export function isPrevEndPlusChangeConfig(
  config: ParameterConfig
): config is PrevEndPlusChangeConfig {
  return 'flows' in config;
}
