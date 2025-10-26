import { FAM } from '@/fam/fam.js';
import type { CFI } from '@/model/bc.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, RuleInput } from '@/model/types.js';

const ACC = (
  gaid: GAID,
  nameJa: string,
  fs: 'PL' | 'BS' | 'CF' = 'PL',
  is_credit?: boolean
): Account => ({
  id: gaid,
  AccountName: nameJa,
  GlobalAccountID: gaid,
  fs_type: fs,
  is_credit,
});

const A = {
  現金: ACC(GAID.CASH as any as GAID, '現金', 'BS', false),
  建物機械等: ACC(
    GAID.PPE_OPENING_BALANCE_GROSS as any as GAID,
    '建物・機械等',
    'BS',
    false
  ),
  固定資産売却益: ACC(
    GAID.GAIN_ON_SALES_OF_NCA as any as GAID,
    '固定資産売却益',
    'PL'
  ),
  投資有価証券: ACC(
    GAID.INVESTMENT_SECURITIES as any as GAID,
    '投資有価証券',
    'BS',
    false
  ),
  経常利益: ACC(GAID.ORDINARY_INCOME as any as GAID, '経常利益', 'PL'),
};

describe('CFI (Investing Cash Flow) Calculation', () => {
  test('Capex should be reflected as a negative CFI', () => {
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.建物機械等.id]: 5000,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 }, // Isolate CF from profit
    };
    fam.setRules(RULES);

    // B&C rule for Capex of 200, classified as CFI
    const cfis: CFI[] = [
      {
        target: A.建物機械等.id,
        sign: 'PLUS',
        value: 200,
        counter: A.現金.id,
        isCredit: false,
        cf_category: 'CFI', // Explicitly classify as Investing Cash Flow
      },
    ];
    fam.setBalanceChange(cfis);

    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: A.現金.id,
    });

    const y = 2001; // Actuals are for 2000, so forecast is for 2001

    // New method to get the CF statement breakdown (this will fail initially)
    const cfStatement = (fam as any).getCFStatement(y);

    expect(cfStatement.cfo).toBe(0);
    expect(cfStatement.cfi).toBe(-200);
    expect(cfStatement.cff).toBe(0);
    expect(cfStatement.total).toBe(-200);

    // Also verify the final cash amount on the BS
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // Expect: Cash = 1000 (prev) - 200 (capex) = 800
    expect(at(A.現金.id)).toBe(800);
    expect(at(A.建物機械等.id)).toBe(5200);
  });

  test('[CFI-02] Sale of PPE with a gain should be correctly reflected in CFI and CFO', () => {
    // 1. Arrange
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.建物機械等.id]: 5000,
        [A.固定資産売却益.id]: 0,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const gainOnSale = 200;
    const bookValueOfAsset = 800;
    const proceedsFromSale = bookValueOfAsset + gainOnSale; // 1000

    const RULES: Record<string, RuleInput> = {
      // PLに売却益を計上
      [A.固定資産売却益.id]: { type: 'FIXED_VALUE', value: gainOnSale },
      // 経常利益 = 固定資産売却益 (他のPL項目は0とする)
      [A.経常利益.id]: {
        type: 'CALCULATION',
        refs: [
          {
            account: A.固定資産売却益,
            period: { AF_type: 'Forecast' } as any,
            sign: 1,
          },
        ],
      },
    };
    fam.setRules(RULES);

    // B&Cルール: 固定資産を簿価で減少させ、現金を売却額で増加させる
    const cfis: CFI[] = [
      {
        target: A.建物機械等.id,
        sign: 'MINUS',
        value: bookValueOfAsset,
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
      cashAccount: A.現金.id,
    });

    const y = 2001;

    // 3. Assert
    const cfStatement = (fam as any).getCFStatement(y);
    // CFO = 純利益(200) - 固定資産売却益(200) = 0
    expect(cfStatement.cfo).toBe(0);
    // CFI = 固定資産売却による収入(1000)
    expect(cfStatement.cfi).toBe(proceedsFromSale);
    expect(cfStatement.cff).toBe(0);
    expect(cfStatement.total).toBe(proceedsFromSale);

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 現金 = 1000 (期首) + 1000 (売却収入) = 2000
    expect(at(A.現金.id)).toBe(2000);
    // 固定資産 = 5000 (期首) - 800 (簿価) = 4200
    expect(at(A.建物機械等.id)).toBe(4200);
  });

  test('[CFI-03] Purchase of investment securities should be reflected as a negative CFI', () => {
    // 1. Arrange
    const fam = new FAM();
    const PREVS = [
      {
        [A.現金.id]: 1000,
        [A.投資有価証券.id]: 0,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));
    fam.setRules({ [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 } });

    // B&Cルール: 投資有価証券を300取得
    const cfis: CFI[] = [
      {
        target: A.投資有価証券.id,
        sign: 'PLUS',
        value: 300,
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
      cashAccount: A.現金.id,
    });

    const y = 2001;

    // 3. Assert
    const cfStatement = (fam as any).getCFStatement(y);
    expect(cfStatement.cfi).toBe(-300);

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    expect(at(A.現金.id)).toBe(700); // 1000 - 300
    expect(at(A.投資有価証券.id)).toBe(300);
  });
});
