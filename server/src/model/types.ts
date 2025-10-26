// src/model/types.ts
//
// 目的:
// - AST/セル/ルール/会計期間/勘定等の型定義を集中管理。
export type Op = 'ADD' | 'SUB' | 'MUL';

export type PeriodType = 'Yearly' | 'Monthly' | null;
export type AFType = 'Actual' | 'Forecast' | null;
export type NormalSide = 'DEBIT' | 'CREDIT' | 'NONE';
export type FsType = 'PL' | 'BS' | 'CF' | 'PP&E' | 'OTHER';

export interface Period {
  Period_type: PeriodType; // MVP: Yearly
  AF_type: AFType; // Actual / Forecast
  Period_val: string | number | null; // FY表記や数値年
  offset?: number | null; // 実績基点からの相対参照（prev: -1）
}

export type Account = {
  id: string;
  AccountName: string;
  GlobalAccountID: string | null;
  fs_type: 'PL' | 'BS' | 'CF';
  is_credit?: boolean; // true for credit, false/undefined for debit
  parent_id?: string | null;
  parent_ua_id?: number | null;
  parent_ga_id?: string | null;
  parent_ga_type?: 'super_calc' | 'aggregate' | null;
  ga_name?: string | null;
  ga_code?: string | null;
  ga_type?: 'super_calc' | 'aggregate' | null;
  sort_num?: number | null;
  indent_num?: number | null;
  ua_code?: string | null;
  is_kpi?: boolean;
};

// Updated Ref type to match calculation rules specification
export interface Ref {
  userAccountId: number;
  userAccountName: string;
  period?: 'PREV' | 'SAME';
}

export type ParamType =
  | 'INPUT'
  | 'CALCULATION'
  | 'CHILDREN_SUM'
  | 'FIXED_VALUE'
  | 'REFERENCE'
  | 'GROWTH_RATE'
  | 'PROPORTIONATE'
  | 'PERCENTAGE'
  | null;

export type NodeId = string;

export interface Node {
  id: NodeId; // ASTノードID（内部用：任意、外部露出しない）
  paramType?: ParamType;
  value?: number; // FF: valueあり, TT: undefined
  ref1?: NodeId | null;
  ref2?: NodeId | null;
  operator?: Op | null;
  kind?: 'FF' | 'TT';
  label?: string; // DOT/デバッグ用
}

export interface Cell extends Node {
  account?: Account | null; // 表ビュー・依存解決のために保持
  period?: Period | null;
}

export interface RefInput {
  period: Period; // 参照する期間（現期/前期）
  account: Account; // 参照先の勘定（accountId主義）
  sign?: 1 | -1; // CALCULATIONでの符号
}

export type RuleInput =
  | { type: 'INPUT'; value: number }
  | { type: 'CALCULATION'; refs: RefInput[] }
  | { type: 'CHILDREN_SUM' }
  | { type: 'FIXED_VALUE'; value: number }
  | { type: 'REFERENCE'; ref: RefInput }
  | { type: 'GROWTH_RATE'; value: number; refs: [RefInput] }
  | {
      type: 'PROPORTIONATE';
      driverCurr: RefInput;
      driverPrev: RefInput;
      base?: RefInput; // 省略時: 自科目 PREV
      coeff?: number; // 追加係数（任意）
    }
  | { type: 'PERCENTAGE'; value: number; ref: RefInput };

// Re-export CFI from bc.ts for convenience
export type { CFI } from './bc.js';
