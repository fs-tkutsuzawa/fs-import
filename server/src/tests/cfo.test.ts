import { FAM } from '@/fam/fam.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, RuleInput, CFI } from '@/model/types.js';

const ACC = (
  id: string,
  name: string,
  gaid: GAID,
  fs: 'PL' | 'BS' | 'CF',
  is_credit: boolean
): Account => ({
  id,
  AccountName: name,
  GlobalAccountID: gaid,
  fs_type: fs,
  is_credit,
});

const A = {
  現金: ACC('cash', '現金', GAID.CASH, 'BS', false),
  売掛金: ACC('ar', '売掛金', GAID.ACCOUNTS_RECEIVABLE_TRADE, 'BS', false),
  棚卸資産: ACC('inventory', '棚卸資産', GAID.INVENTORIES, 'BS', false),
  仕入債務: ACC(
    'ap',
    '仕入債務',
    GAID.ACCOUNTS_PAYABLE_TRADE,
    'BS',
    true
  ),
  未払費用: ACC(
    'accrued_expenses',
    '未払費用',
    GAID.ACCRUED_EXPENSES,
    'BS',
    true
  ),
  有形固定資産: ACC('ppe', '有形固定資産', GAID.PPE, 'BS', false),
  未払法人税等: ACC(
    'tax_payable',
    '未払法人税等',
    GAID.INCOME_TAXES_PAYABLE,
    'BS',
    true
  ),
  減損損失: ACC('impairment', '減損損失', GAID.IMPAIRMENT_LOSS, 'PL', false),
  減価償却費: ACC('depr', '減価償却費', GAID.DEPRECIATION, 'PL', false),
  利益剰余金: ACC('re', '利益剰余金', GAID.RETAINED_EARNINGS, 'BS', true),
  法人税等: ACC('tax', '法人税等', GAID.INCOME_TAXES_CURRENT, 'PL', false),
  経常利益: ACC('ord_income', '経常利益', GAID.ORDINARY_INCOME, 'PL', false),
  営業CF: ACC(
    'cf_operating',
    '営業活動によるキャッシュ・フロー',
    GAID.CFO,
    'CF',
    false
  ),
  売上債権増減CF: ACC(
    'cf_ar_change',
    '売上債権の増減額',
    GAID.CF_INCR_DECR_TRADE_RECEIVABLES,
    'CF',
    false
  ),
  棚卸資産増減CF: ACC(
    'cf_inventory_change',
    '棚卸資産の増減額',
    GAID.CF_INCR_DECR_INVENTORIES,
    'CF',
    false
  ),
  仕入債務増減CF: ACC(
    'cf_ap_change',
    '仕入債務の増減額',
    GAID.CF_INCR_DECR_TRADE_PAYABLES,
    'CF',
    false
  ),
  減価償却CF: ACC(
    'cf_depreciation',
    '減価償却費等',
    GAID.CF_DEPRECIATION_AMORTIZATION,
    'CF',
    false
  ),
};

describe('CFO (Operating Cash Flow) Calculation Details', () => {
  test('[CFO-01] Changes in multiple working capital accounts should be reflected in CFO', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.棚卸資産.id]: 500,
        [A.未払費用.id]: 200,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 }, // Isolate working capital effect
      // 運転資本の変動をルールで定義
      [A.棚卸資産.id]: { type: 'FIXED_VALUE', value: 600 }, // 100増加
      [A.未払費用.id]: { type: 'FIXED_VALUE', value: 250 }, // 50増加
    };
    fam.setRules(RULES);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: GAID.CASH,
    });

    const y = 2001;

    // 3. Assert
    const cfStatement = (fam as any).getCFStatement(y);

    // CFO = 純利益(0) - 棚卸資産増(100) + 未払費用増(50) = -50
    expect(cfStatement.cfo).toBe(-50);
    expect(cfStatement.cfi).toBe(0);
    expect(cfStatement.cff).toBe(0);
    expect(cfStatement.total).toBe(-50);

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 現金 = 1000 (期首) - 50 (CFO) = 950
    expect(at(A.現金.id)).toBe(950);
    expect(at(A.棚卸資産.id)).toBe(600);
    expect(at(A.未払費用.id)).toBe(250);
  });

  test('[CFO-04] Working capital deltas and non-cash charges are written to CF detail lines', () => {
    const fam = new FAM();
    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.売掛金.id]: 300,
        [A.棚卸資産.id]: 400,
        [A.仕入債務.id]: 120,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
      [A.売掛金.id]: { type: 'FIXED_VALUE', value: 360 }, // +60 → CFO -60
      [A.棚卸資産.id]: { type: 'FIXED_VALUE', value: 550 }, // +150 → CFO -150
      [A.仕入債務.id]: { type: 'FIXED_VALUE', value: 180 }, // +60 → CFO +60
    };
    fam.setRules(RULES);

    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: GAID.CASH,
    });

    const y = 2001;
    const cfStatement = (fam as any).getCFStatement(y);
    expect(cfStatement.cfo).toBe(-150); // -60 -150 +60

    const cfTable = fam.getTable({ fs: 'CF', years: [y] });
    const colIndex = cfTable.columns.indexOf(`FY:${y}`);
    const findValue = (accountId: string) => {
      const idx = cfTable.rows.findIndex((row) => row.accountId === accountId);
      expect(idx).not.toBe(-1);
      return cfTable.data[idx][colIndex];
    };

    expect(findValue(A.売上債権増減CF.id)).toBe(-60);
    expect(findValue(A.棚卸資産増減CF.id)).toBe(-150);
    expect(findValue(A.仕入債務増減CF.id)).toBe(60);
  });

  test('[CFO-02] Impairment loss should be added back to CFO as a non-cash charge', () => {
    // 1. Arrange
    const fam = new FAM();
    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.有形固定資産.id]: 5000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.減損損失.id]: { type: 'FIXED_VALUE', value: 200 },
      [A.経常利益.id]: {
        type: 'CALCULATION',
        refs: [
          {
            account: A.減損損失,
            period: { AF_type: 'Forecast' } as any,
            sign: -1,
          },
        ],
      }, // 純利益 = -200
    };
    fam.setRules(RULES);

    // B&Cルール: 減損損失により固定資産を減少させる
    const cfis: CFI[] = [
      {
        target: A.有形固定資産.id,
        sign: 'MINUS',
        driver: { name: A.減損損失.id },
        counter: A.利益剰余金.id, // 相手勘定を利益剰余金に修正
        isCredit: false,
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

    // CFO = 純利益(-200) + 減損損失(200) = 0
    expect(cfStatement.cfo).toBe(0);
    expect(cfStatement.total).toBe(0);

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    expect(at(A.現金.id)).toBe(1000);
    expect(at(A.有形固定資産.id)).toBe(4800); // 5000 - 200
  });

  test('[CFO-03] Change in Income Taxes Payable should be reflected in CFO', () => {
    // 1. Arrange
    const fam = new FAM();
    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.未払法人税等.id]: 50,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.法人税等.id]: { type: 'FIXED_VALUE', value: 200 },
      [A.経常利益.id]: {
        type: 'CALCULATION',
        refs: [
          {
            account: A.法人税等,
            period: { AF_type: 'Forecast' } as any,
            sign: -1,
          },
        ],
      }, // 純利益 = -200 (テスト簡単化のため、税引前利益を0と仮定)
      [A.未払法人税等.id]: { type: 'FIXED_VALUE', value: 80 }, // 30増加
    };
    fam.setRules(RULES);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: GAID.CASH,
    });

    const y = 2001;

    // 3. Assert
    const cfStatement = (fam as any).getCFStatement(y);

    // CFO = 純利益(-200) + 未払法人税増(30) = -170
    // Note: このテストでは税引前利益を0と仮定しているため、純利益は-200となる。
    // 本来のCFO = 税引前利益(0) - 現金支払法人税(170) = -170
    expect(cfStatement.cfo).toBe(-170);
    expect(cfStatement.total).toBe(-170);

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    expect(at(A.現金.id)).toBe(830); // 1000 - 170
    expect(at(A.未払法人税等.id)).toBe(80);
  });
});
