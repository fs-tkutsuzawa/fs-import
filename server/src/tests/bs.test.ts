import { FAM } from '@/fam/fam.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, RuleInput } from '@/model/types.js';

// Helper to create Account objects
const ACC = (
  id: string,
  name: string,
  gaid: GAID,
  fs: 'PL' | 'BS',
  is_credit?: boolean
): Account => ({
  id,
  AccountName: name,
  GlobalAccountID: gaid,
  fs_type: fs,
  is_credit,
});

describe('BS (Balance Sheet) Calculation Logic', () => {
  // Test-BS-1.1: Net Income flows to Retained Earnings
  test('should roll forward Retained Earnings with Net Income', () => {
    // 1. Arrange: Setup a minimal financial model
    const fam = new FAM();

    // Define minimal accounts for PL and BS
    const accounts: Account[] = [
      // BS Accounts
      ACC('re', '利益剰余金', GAID.RETAINED_EARNINGS, 'BS', true),
      ACC('cash', '現金', GAID.CASH, 'BS', false),
      // PL Accounts
      ACC('sales', '売上', GAID.NET_SALES, 'PL'),
      ACC('cogs', '売上原価', GAID.COGS, 'PL'),
      ACC('profit', '当期純利益', GAID.PROFIT, 'PL'),
    ];

    // Previous year's actuals
    const prevs = [
      {
        re: 500, // Beginning Retained Earnings
        cash: 1000,
        sales: 1000,
        cogs: 600,
        profit: 400, // Previous Net Income (not used in this calc)
      },
    ];

    fam.importActuals(prevs, accounts);

    // Define rules for the forecast year to get a predictable Net Income
    const rules: Record<string, RuleInput> = {
      sales: { type: 'FIXED_VALUE', value: 1500 }, // Forecast sales
      cogs: { type: 'FIXED_VALUE', value: 900 }, // Forecast cogs
      profit: {
        // Net Income = Sales - COGS
        type: 'CALCULATION',
        refs: [
          {
            account: accounts.find((a) => a.id === 'sales')!,
            period: { AF_type: 'Forecast' } as any,
            sign: +1,
          },
          {
            account: accounts.find((a) => a.id === 'cogs')!,
            period: { AF_type: 'Forecast' } as any,
            sign: -1,
          },
        ],
      },
    };

    fam.setRules(rules);

    // 2. Act: Run the calculation for one forecast year
    fam.compute({
      years: 1,
      baseProfitAccount: 'profit',
      cashAccount: GAID.CASH,
    });

    // 3. Assert: Verify the ending Retained Earnings
    const y = 2001; // First forecast year
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const row = table.rows.findIndex((r) => r.accountId === 're');
    const ending_re = table.data[row][col];

    const beginning_re = 500;
    const net_income = 1500 - 900; // 600

    expect(ending_re).toBe(beginning_re + net_income); // 500 + 600 = 1100
  });

  // Test-BS-2.1: BS account calculated from a PL account
  test('should calculate a BS account based on a PL account parameter', () => {
    // 1. Arrange
    const fam = new FAM();
    const accounts: Account[] = [
      ACC('ap', '買掛金', GAID.ACCOUNTS_PAYABLE, 'BS', true),
      ACC('cogs', '売上原価', GAID.COGS, 'PL'),
      ACC('cash', '現金', GAID.CASH, 'BS', false), // for compute options
      ACC('profit', '当期純利益', GAID.PROFIT, 'PL'), // for compute options
    ];
    const prevs = [
      {
        cogs: 600,
        ap: 250,
        cash: 1000,
        profit: 400,
      },
    ];
    fam.importActuals(prevs, accounts);

    const rules: Record<string, RuleInput> = {
      cogs: { type: 'FIXED_VALUE', value: 800 },
      ap: {
        // 買掛金 = 売上原価の50%
        type: 'PERCENTAGE',
        value: 0.5,
        ref: {
          account: { id: 'cogs' } as any,
          period: { AF_type: 'Forecast' } as any,
        },
      },
      profit: { type: 'FIXED_VALUE', value: 0 },
    };
    fam.setRules(rules);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: 'profit',
      cashAccount: GAID.CASH,
    });

    // 3. Assert
    const y = 2001;
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const row = table.rows.findIndex((r) => r.accountId === 'ap');
    const ending_ap = table.data[row][col];

    const forecast_cogs = 800;
    const expected_ap = forecast_cogs * 0.5; // 400

    expect(ending_ap).toBe(expected_ap);
  });

  test('should calculate a BS account using GROWTH_RATE from its previous balance', () => {
    // 1. Arrange
    const fam = new FAM();
    const accounts: Account[] = [
      ACC('oca', 'その他流動資産', GAID.OTHER_CURRENT_ASSETS, 'BS', false),
      ACC('cash', '現金', GAID.CASH, 'BS', false), // for compute options
      ACC('profit', '当期純利益', GAID.PROFIT, 'PL'), // for compute options
    ];
    const prevs = [
      {
        oca: 200,
        cash: 1000,
        profit: 400,
      },
    ];
    fam.importActuals(prevs, accounts);

    const rules: Record<string, RuleInput> = {
      oca: {
        // その他流動資産 = 前期末残高 * 1.1
        type: 'GROWTH_RATE',
        value: 0.1,
        refs: [
          {
            account: { id: 'oca' } as any,
            period: { AF_type: 'Actual', offset: -1 } as any,
          },
        ],
      },
      profit: { type: 'FIXED_VALUE', value: 0 },
    };
    fam.setRules(rules);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: 'profit',
      cashAccount: GAID.CASH,
    });

    // 3. Assert
    const y = 2001;
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const row = table.rows.findIndex((r) => r.accountId === 'oca');
    const ending_oca = table.data[row][col];

    const beginning_oca = 200;
    const expected_oca = beginning_oca * 1.1; // 220

    expect(ending_oca).toBeCloseTo(expected_oca);
  });

  // Test-G-01: Balance Sheet Integrity
  test('[G-01] should maintain balance sheet integrity (Assets = Liabilities + Equity)', () => {
    // 1. Arrange
    const fam = new FAM();
    const accounts: Account[] = [
      // Assets
      ACC('cash', '現金', GAID.CASH, 'BS', false),
      ACC('ar', '売掛金', GAID.ACCOUNTS_RECEIVABLE, 'BS', false),
      // Liabilities
      ACC('ap', '買掛金', GAID.ACCOUNTS_PAYABLE, 'BS', true),
      // Equity
      ACC('capital', '資本金', GAID.CAPITAL_STOCK, 'BS', true),
      ACC('re', '利益剰余金', GAID.RETAINED_EARNINGS, 'BS', true),
      // PL
      ACC('sales', '売上', GAID.NET_SALES, 'PL'),
      ACC('profit', '当期純利益', GAID.PROFIT, 'PL'),
    ];

    // 貸借が一致した前期末残高
    const prevs = [
      {
        cash: 1000,
        ar: 500, // Assets = 1500
        ap: 300, // Liabilities = 300
        capital: 800,
        re: 400, // Equity = 1200
        sales: 2000,
        profit: 200,
      },
    ];
    fam.importActuals(prevs, accounts);

    const rules: Record<string, RuleInput> = {
      sales: { type: 'FIXED_VALUE', value: 3000 },
      profit: { type: 'FIXED_VALUE', value: 300 }, // 当期純利益
      ar: { type: 'FIXED_VALUE', value: 600 }, // 売掛金が増加
    };
    fam.setRules(rules);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: 'profit',
      cashAccount: GAID.CASH,
    });

    // 3. Assert
    const y = 2001;
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const val = (id: string) =>
      table.data[table.rows.findIndex((r) => r.accountId === id)][col];

    const assets = val('cash') + val('ar');
    const liabilities = val('ap');
    const equity = val('capital') + val('re');

    expect(assets).toBe(liabilities + equity);
  });

  // Test-BS-2.2.1: Depreciation (PL-linked flow)
  test('should decrease PPE by depreciation amount via B&C rule', () => {
    // 1. Arrange
    const fam = new FAM();
    const accounts: Account[] = [
      // BS Accounts
      ACC('ppe', '有形固定資産', GAID.PPE, 'BS', false),
      ACC('re', '利益剰余金', GAID.RETAINED_EARNINGS, 'BS', true),
      // PL Accounts
      ACC('dep', '減価償却費', GAID.DEPRECIATION, 'PL'),
      ACC('profit', '当期純利益', GAID.PROFIT, 'PL'),
      ACC('cash', '現金', GAID.CASH, 'BS', false),
    ];

    const prevs = [
      {
        ppe: 1000,
        re: 500,
        dep: 80,
        profit: 200,
        cash: 1000,
      },
    ];
    fam.importActuals(prevs, accounts);

    // PL rule: Depreciation for the forecast year is 100
    const rules: Record<string, RuleInput> = {
      dep: { type: 'FIXED_VALUE', value: 100 },
      profit: { type: 'FIXED_VALUE', value: 0 }, // Isolate the effect
    };
    fam.setRules(rules);

    // B&C rule: PPE decreases by the amount of Depreciation
    fam.setBalanceChange([
      {
        target: GAID.PPE,
        isCredit: false,
        sign: 'MINUS',
        driver: { name: GAID.DEPRECIATION },
        counter: GAID.RETAINED_EARNINGS,
      },
    ]);

    // 2. Act
    fam.compute({
      years: 1,
      baseProfitAccount: 'profit',
      cashAccount: GAID.CASH,
    });

    // 3. Assert
    const y = 2001;
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const ppe_row = table.rows.findIndex((r) => r.accountId === 'ppe');
    const ending_ppe = table.data[ppe_row][col];

    const beginning_ppe = 1000;
    const depreciation_amount = 100;
    const expected_ppe = beginning_ppe - depreciation_amount; // 900

    expect(ending_ppe).toBe(expected_ppe);
  });
});
