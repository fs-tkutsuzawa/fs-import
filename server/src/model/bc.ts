// src/model/bc.ts
//
// Balance & Change（B&C）の命令インターフェイスを定義。
// - 何をやっているか: コア計算と現金連動が終わった後に、特定勘定に増減を加える。
// - 目的: 設備投資/償却/配当/借入/返済など、フロー起点でBS残高に影響を与える操作の表現。
// - 繋がり: fam.ts の applyBalanceChangeForFY() でこの型を受け取り、テーブルへ反映する。
// - API勘所: target/counter は GAID または accountId を受け付ける（内部で primary accountId に正規化）。
export type BCSign = 'PLUS' | 'MINUS';

/** CFI: Balance & Change Instruction (PoC)
 * - target:  対象のBS科目（例: 建物・機械等）の accountId
 * - isCredit: 対象BS科目の貸借性（PoCでは bool）
 * - driver?:  原因勘定（PL科目など、nameにaccountID指定でFAMからFY+1の値を引く）
 * - value?:   非PLの固定フロー（設備投資など、直接数値指定）
 * - counter:  相手方勘定（例: 現金 or 利益剰余金）
 * - sign:     PLUS/MINUS（対象BS科目を増やすか減らすか）
 */
export interface CFI {
  target: string;
  isCredit: boolean | null;
  sign: BCSign;
  driver?: { name: string }; // 例: { name: '減価償却費' } → PLからFY+1の値を参照
  value?: number; // 例: 200（設備投資）
  counter: string; // 例: '現金' or '利益剰余金'
  cf_category?: 'CFO' | 'CFI' | 'CFF'; // このB&CがどのCF区分に影響を与えるか
}
