// src/model/ids.ts
//
// 目的:
// - 表（Grid）のセルID・期間キーの生成を集約。可読名に日本語や空白が入っても、
//   保存・比較に耐える安定キーを用意する。
// 前後関係:
// - fam.ts 内のテーブルMapのキーとして利用。
// - accountIdは英数想定だが、念のため全体をハッシュ化して安全なキーに変換する。
import { stableHash } from '@/utils/hash.js';

export function cellId(
  fs: string,
  periodKey: string,
  accountId: string
): string {
  const basis = `${fs}|${periodKey}|${accountId}`;
  return `cell:${stableHash(basis)}`; // 日本語名を避け、英数16進固定
}

export function periodKey(year: number | string): string {
  return `FY:${year}`;
}
