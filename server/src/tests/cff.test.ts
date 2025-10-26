import { FAM } from '@/fam/fam.js';
import type { CFI } from '@/model/bc.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, RuleInput } from '@/model/types.js';

// 標準的な勘定科目ファクトリ
const ACC = (
  id: string,
  name: string,
  gaid: GAID,
  fs: 'PL' | 'BS',
  is_credit: boolean
): Account => ({
  id,
  AccountName: name,
  GlobalAccountID: gaid,
  fs_type: fs,
  is_credit,
});

// CFFテスト用の勘定科目セット
const A = {
  現金: ACC('cash', '現金', GAID.CASH, 'BS', false),
  長期借入金: ACC(
    'long_term_debt',
    '長期借入金',
    GAID.LONG_TERM_DEBT,
    'BS',
    true
  ),
  資本金: ACC('capital', '資本金', GAID.CAPITAL_STOCK, 'BS', true),
  利益剰余金: ACC('re', '利益剰余金', GAID.RETAINED_EARNINGS, 'BS', true),
  経常利益: ACC('ord_income', '経常利益', GAID.ORDINARY_INCOME, 'PL', false),
};

describe('CFF (Financing Cash Flow) Calculation', () => {
  test('[CFF-01] Long-term debt financing should be reflected as a positive CFF', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.長期借入金.id]: 2000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    // PLに影響を与えないように利益は0に固定
    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
    };
    fam.setRules(RULES);

    // B&Cルール: 長期借入金を2000増加させ、相手勘定を現金とする。CFFとして分類。
    const cfis: CFI[] = [
      {
        target: A.長期借入金.id,
        sign: 'PLUS',
        value: 2000,
        counter: A.現金.id,
        isCredit: true,
        cf_category: 'CFF', // Financing Cash Flowとして分類
      },
    ];
    fam.setBalanceChange(cfis);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: GAID.CASH,
    });

    const y = 2001; // 予測年度

    // 3. Assert
    // CF計算書の検証
    const cfStatement = (fam as any).getCFStatement(y);
    expect(cfStatement.cfo).toBe(0);
    expect(cfStatement.cfi).toBe(0);
    expect(cfStatement.cff).toBe(2000); // CFFが+2000になることを期待
    expect(cfStatement.total).toBe(2000);

    // BS残高の検証
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 現金 = 1000 (期首) + 2000 (借入) = 3000
    expect(at(A.現金.id)).toBe(3000);
    // 長期借入金 = 2000 (期首) + 2000 (借入) = 4000
    expect(at(A.長期借入金.id)).toBe(4000);
  });

  test('[CFF-02] Long-term debt repayment should be reflected as a negative CFF', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.長期借入金.id]: 2000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
    };
    fam.setRules(RULES);

    // B&Cルール: 長期借入金を500返済する
    const cfis: CFI[] = [
      {
        target: A.長期借入金.id,
        sign: 'MINUS',
        value: 500,
        counter: A.現金.id,
        isCredit: true,
        cf_category: 'CFF',
      },
    ];
    fam.setBalanceChange(cfis);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: GAID.CASH,
    });

    const y = 2001;

    // 3. Assert
    const cfStatement = (fam as any).getCFStatement(y);
    expect(cfStatement.cfo).toBe(0);
    expect(cfStatement.cfi).toBe(0);
    expect(cfStatement.cff).toBe(-500); // CFFが-500になることを期待
    expect(cfStatement.total).toBe(-500);

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 現金 = 1000 (期首) - 500 (返済) = 500
    expect(at(A.現金.id)).toBe(500);
    // 長期借入金 = 2000 (期首) - 500 (返済) = 1500
    expect(at(A.長期借入金.id)).toBe(1500);
  });

  test('[CFF-03] Capital increase should be reflected as a positive CFF', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.資本金.id]: 5000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
    };
    fam.setRules(RULES);

    // B&Cルール: 増資により資本金が1000増加
    const cfis: CFI[] = [
      {
        target: A.資本金.id,
        sign: 'PLUS',
        value: 1000,
        counter: A.現金.id,
        isCredit: true,
        cf_category: 'CFF',
      },
    ];
    fam.setBalanceChange(cfis);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: GAID.CASH,
    });

    const y = 2001;

    // 3. Assert
    const cfStatement = (fam as any).getCFStatement(y);
    expect(cfStatement.cff).toBe(1000);

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 現金 = 1000 (期首) + 1000 (増資) = 2000
    expect(at(A.現金.id)).toBe(2000);
    // 資本金 = 5000 (期首) + 1000 (増資) = 6000
    expect(at(A.資本金.id)).toBe(6000);
  });

  test('[CFF-04] Dividend payment should be reflected as a negative CFF', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.利益剰余金.id]: 3000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
    };
    fam.setRules(RULES);

    // B&Cルール: 配当金支払いで利益剰余金が300減少
    const cfis: CFI[] = [
      {
        target: A.利益剰余金.id,
        sign: 'MINUS',
        value: 300,
        counter: A.現金.id,
        isCredit: true,
        cf_category: 'CFF',
      },
    ];
    fam.setBalanceChange(cfis);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: GAID.CASH,
    });

    const y = 2001;

    // 3. Assert
    const cfStatement = (fam as any).getCFStatement(y);
    expect(cfStatement.cff).toBe(-300);

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 現金 = 1000 (期首) - 300 (配当) = 700
    expect(at(A.現金.id)).toBe(700);
    // 利益剰余金 = 3000 (期首) - 300 (配当) = 2700
    expect(at(A.利益剰余金.id)).toBe(2700);
  });
});
