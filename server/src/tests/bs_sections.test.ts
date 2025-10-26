import { FAM } from '@/fam/fam.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, RuleInput, CFI } from '@/model/types.js';

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

const A = {
  // Assets
  現金: ACC('cash', '現金', GAID.CASH, 'BS', false),
  売掛金: ACC('ar', '売掛金', GAID.ACCOUNTS_RECEIVABLE_TRADE, 'BS', false),
  棚卸資産: ACC('inventory', '棚卸資産', GAID.INVENTORIES, 'BS', false),
  有形固定資産: ACC('ppe', '有形固定資産', GAID.PPE, 'BS', false),
  // Liabilities
  買掛金: ACC('ap', '買掛金', GAID.ACCOUNTS_PAYABLE_TRADE, 'BS', true),
  未払法人税等: ACC(
    'tax_payable',
    '未払法人税等',
    GAID.INCOME_TAXES_PAYABLE,
    'BS',
    true
  ),
  長期借入金: ACC(
    'long_term_debt',
    '長期借入金',
    GAID.LONG_TERM_DEBT,
    'BS',
    true
  ),
  // Equity
  資本金: ACC('capital', '資本金', GAID.CAPITAL_STOCK, 'BS', true),
  利益剰余金: ACC('re', '利益剰余金', GAID.RETAINED_EARNINGS, 'BS', true),
  // PL
  経常利益: ACC('ord_income', '経常利益', GAID.ORDINARY_INCOME, 'PL', false),
};

describe('BS Section Integrity Tests', () => {
  test('[BS-ASSET-01] Total Assets should equal the sum of all asset accounts', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.売掛金.id]: 500,
        [A.棚卸資産.id]: 300,
        [A.有形固定資産.id]: 2000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
      [A.売掛金.id]: { type: 'FIXED_VALUE', value: 600 }, // +100
      [A.棚卸資産.id]: { type: 'FIXED_VALUE', value: 400 }, // +100
    };
    fam.setRules(RULES);

    // B&Cルール: 設備投資
    const cfis: CFI[] = [
      {
        target: A.有形固定資産.id,
        sign: 'PLUS',
        value: 500,
        counter: A.現金.id,
        isCredit: false,
        cf_category: 'CFI',
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
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 3. Assert
    // 個別科目の残高を検証
    const cash = at(A.現金.id);
    const ar = at(A.売掛金.id);
    const inventory = at(A.棚卸資産.id);
    const ppe = at(A.有形固定資産.id);

    // CFO = 0 (純利益) - 100 (売掛金増) - 100 (棚卸資産増) = -200
    // CFI = -500 (設備投資)
    // 現金 = 1000 (期首) - 200 (CFO) - 500 (CFI) = 300
    expect(cash).toBe(300);
    expect(ar).toBe(600);
    expect(inventory).toBe(400);
    expect(ppe).toBe(2500); // 2000 + 500

    // 合計資産を検証
    const totalAssets = cash + ar + inventory + ppe;
    expect(totalAssets).toBe(300 + 600 + 400 + 2500); // 3800
  });

  test('[BS-LIA-01] Total Liabilities should equal the sum of all liability accounts', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 5000,
        [A.買掛金.id]: 700,
        [A.長期借入金.id]: 3000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
      [A.買掛金.id]: { type: 'FIXED_VALUE', value: 850 }, // +150
    };
    fam.setRules(RULES);

    // B&Cルール: 新規借入
    const cfis: CFI[] = [
      {
        target: A.長期借入金.id,
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
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 3. Assert
    const ap = at(A.買掛金.id);
    const debt = at(A.長期借入金.id);

    // CFO = 0 (純利益) + 150 (買掛金増) = 150
    // CFF = +1000 (借入)
    // 現金 = 5000 (期首) + 150 (CFO) + 1000 (CFF) = 6150
    expect(at(A.現金.id)).toBe(6150);
    expect(ap).toBe(850);
    expect(debt).toBe(4000); // 3000 + 1000

    // 合計負債を検証
    const totalLiabilities = ap + debt;
    expect(totalLiabilities).toBe(850 + 4000); // 4850
  });

  test('[BS-EQ-01] Total Equity should correctly sum up capital, retained earnings, and net income', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 5000,
        [A.資本金.id]: 2000,
        [A.利益剰余金.id]: 4000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const netIncome = 500;
    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: netIncome },
    };
    fam.setRules(RULES);

    // B&Cルール: 増資と配当
    const cfis: CFI[] = [
      {
        // 増資
        target: A.資本金.id,
        sign: 'PLUS',
        value: 1000,
        counter: A.現金.id,
        isCredit: true,
        cf_category: 'CFF',
      },
      {
        // 配当
        target: A.利益剰余金.id,
        sign: 'MINUS',
        value: 200,
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
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 3. Assert
    const capital = at(A.資本金.id);
    const re = at(A.利益剰余金.id);

    // 資本金 = 2000 (期首) + 1000 (増資) = 3000
    expect(capital).toBe(3000);
    // 利益剰余金 = 4000 (期首) + 500 (当期利益) - 200 (配当) = 4300
    expect(re).toBe(4300);

    // 合計純資産を検証
    const totalEquity = capital + re;
    expect(totalEquity).toBe(3000 + 4300); // 7300
  });

  test('[BS-G-02] Comprehensive balance sheet integrity check under multiple scenarios', () => {
    // 1. Arrange
    const fam = new FAM();

    //期首残高：貸借は一致している (資産3800 = 負債1700 + 純資産2100)
    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.売掛金.id]: 500,
        [A.棚卸資産.id]: 300,
        [A.有形固定資産.id]: 2000,
        [A.買掛金.id]: 700,
        [A.長期借入金.id]: 1000,
        [A.資本金.id]: 1500,
        [A.利益剰余金.id]: 600,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const netIncome = 300;
    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: netIncome },
      [A.売掛金.id]: { type: 'FIXED_VALUE', value: 700 }, // +200
      [A.棚卸資産.id]: { type: 'FIXED_VALUE', value: 400 }, // +100
      [A.買掛金.id]: { type: 'FIXED_VALUE', value: 800 }, // +100
    };
    fam.setRules(RULES);

    const cfis: CFI[] = [
      {
        // 設備投資
        target: A.有形固定資産.id,
        sign: 'PLUS',
        value: 500,
        counter: A.現金.id,
        isCredit: false,
        cf_category: 'CFI',
      },
      {
        // 新規借入
        target: A.長期借入金.id,
        sign: 'PLUS',
        value: 400,
        counter: A.現金.id,
        isCredit: true,
        cf_category: 'CFF',
      },
      {
        // 配当
        target: A.利益剰余金.id,
        sign: 'MINUS',
        value: 100,
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

    // 3. Assert
    const y = 2001;
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // --- CF計算の検証 ---
    // CFO = 300(純利益) - 200(売掛金増) - 100(棚卸資産増) + 100(買掛金増) = 100
    // CFI = -500 (設備投資)
    // CFF = +400 (借入) - 100 (配当) = 300
    // Net CF = 100 - 500 + 300 = -100
    const cfStatement = (fam as any).getCFStatement(y);
    expect(cfStatement.cfo).toBe(100);
    expect(cfStatement.cfi).toBe(-500);
    expect(cfStatement.cff).toBe(300);

    // --- BS残高の検証 ---
    // 資産
    const cash = at(A.現金.id);
    const ar = at(A.売掛金.id);
    const inventory = at(A.棚卸資産.id);
    const ppe = at(A.有形固定資産.id);
    const totalAssets = cash + ar + inventory + ppe;
    expect(cash).toBe(900); // 1000 - 100

    // 負債
    const ap = at(A.買掛金.id);
    const debt = at(A.長期借入金.id);
    const totalLiabilities = ap + debt;

    // 純資産
    const capital = at(A.資本金.id);
    const re = at(A.利益剰余金.id);
    const totalEquity = capital + re;
    expect(re).toBe(800); // 600 + 300(純利益) - 100(配当)

    // 貸借一致の最終検証
    expect(totalAssets).toBe(totalLiabilities + totalEquity);
  });
});
