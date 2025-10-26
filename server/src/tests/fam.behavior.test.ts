/*
（本ファイルの全テスト共通）
- どこに: `importActuals` → `setRules` →（必要に応じ `setBalanceChange`）→ `compute` → `getTable`
- 何を渡す: 実績 `PREVS`、予測ルール `RULES`、B&C 定義（driver を GAID 名/ accountId で指定するケースや、不備のケース）、`compute` オプション
- 何が返る: 表の数値または例外
- 何が検証できる: ①driver を GAID/ID どちらで指定しても同結果、②accountsMaster 未指定で GAID 指定 B&C はマッピング欠如で失敗、③driver/value 欠落はバリデーションで失敗、④GAID の primary 選定は `is_primary` > `fs_type=PL` > 先勝ち の順に解決
*/
// server/src/tests/fam.behavior.test.ts
import { FAM } from '@/fam/fam.js';
import type { CFI } from '@/model/bc.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, RuleInput } from '@/model/types.js';

// ----------------- helpers -----------------
function acc(id: string, name: string, gaid: string | null): Account {
  return {
    id,
    AccountName: name,
    GlobalAccountID: gaid,
    fs_type: 'PL',
  } as unknown as Account;
}

type TableRet = ReturnType<FAM['getTable']>;

function col(t: TableRet, fy: number) {
  return t.columns.indexOf(`FY:${fy}`);
}

function rowIndexById(t: TableRet, accountId: string) {
  return t.rows.findIndex((r) => r.accountId === accountId);
}

function val(t: TableRet, accountId: string, fy: number) {
  const ri = rowIndexById(t, accountId);
  expect(ri).toBeGreaterThanOrEqual(0);
  const ci = col(t, fy);
  expect(ci).toBeGreaterThanOrEqual(0);
  return t.data[ri][ci];
}

// ----------------- tests -----------------
describe('FAM behavior (accountId-first + cash linkage in FAM)', () => {
  const accounts: Account[] = [
    {
      id: 'revenue',
      AccountName: '売上',
      GlobalAccountID: GAID.NET_SALES,
      fs_type: 'PL',
    },
    {
      id: 'cogs',
      AccountName: '売上原価',
      GlobalAccountID: GAID.COGS,
      fs_type: 'PL',
    },
    {
      id: 'ord_income',
      AccountName: '経常利益',
      GlobalAccountID: GAID.ORDINARY_INCOME,
      fs_type: 'PL',
    },
    {
      id: 'cash_jp',
      AccountName: '現金及び現金同等物',
      GlobalAccountID: GAID.CASH,
      fs_type: 'BS',
      is_credit: false,
    },
    {
      id: 'ar',
      AccountName: '売掛金',
      GlobalAccountID: GAID.ACCOUNTS_RECEIVABLE,
      fs_type: 'BS',
      is_credit: false,
    },
    {
      id: 'ap',
      AccountName: '買掛金',
      GlobalAccountID: GAID.ACCOUNTS_PAYABLE,
      fs_type: 'BS',
      is_credit: true,
    },
    {
      id: 're',
      AccountName: '利益剰余金',
      GlobalAccountID: GAID.RETAINED_EARNINGS,
      fs_type: 'BS',
      is_credit: true,
    },
    {
      id: 'capital',
      AccountName: '資本金',
      GlobalAccountID: GAID.CAPITAL_STOCK,
      fs_type: 'BS',
      is_credit: true,
    },
  ];
  const ACCS = accounts; // for backward compatibility in this file

  // 実績: FY2000 = { cash, revenue, cogs }
  const PREVS: Array<Record<string, number>> = [
    { cash_jp: 100, revenue: 1000, cogs: 600 },
  ];

  const RULES: Record<string, RuleInput> = {
    // 経常利益 = 売上高 - 原価
    ord_income: {
      type: 'CALCULATION',
      refs: [
        {
          account: { id: 'revenue' } as any,
          period: { AF_type: 'Forecast' } as any,
          sign: +1,
        },
        {
          account: { id: 'cogs' } as any,
          period: { AF_type: 'Forecast' } as any,
          sign: -1,
        },
      ],
    },
    // 売上高 FY+1 = FY の 10% 成長
    revenue: {
      type: 'GROWTH_RATE',
      value: 0.1,
      refs: [
        {
          account: { id: 'revenue' } as any,
          period: { AF_type: 'Actual', offset: -1 } as any,
        },
      ],
    },
    // 原価 FY+1 = 売上高 FY+1 の 60%
    cogs: {
      type: 'PERCENTAGE',
      value: 0.6,
      ref: {
        account: { id: 'revenue' } as any,
        period: { AF_type: 'Forecast' } as any,
      },
    },
  };

  test('cash linkage: baseProfit=accountId, cash=GAID (正常系)', () => {
    /*
		- どこに: importActuals → setRules → compute → getTable
		- 何を渡す: PREVS(accountIdキー)、RULES(売上10%成長・原価60%・経常=売上-原価)、compute({years:1, baseProfit='ord_income', cash=GAID.CASH})
		- 何が返ってきて: 表（FY2001の revenue/cogs/ord_income/cash）
		- 何が検証できる: 現金は prev 現金 + 基点利益 で連動し、1100/660/440/540 を満たす
		*/
    const fam = new FAM();
    fam.importActuals(PREVS, ACCS);
    fam.setRules(RULES);

    // FY2001 を1年だけ計算
    fam.compute({
      years: 1,
      baseProfitAccount: 'ord_income',
      cashAccount: GAID.CASH,
    });

    const years = fam.allYears(); // [2000, 2001, ..., 2005]
    expect(years[0]).toBe(2000);

    const t_pl = fam.getTable({ fs: 'PL', years: [2001] });

    // 計算式:
    // revenue(2001) = 1000 * 1.1 = 1100
    // cogs(2001) = 1100 * 0.6 = 660
    // ord_income(2001) = 1100 - 660 = 440
    expect(val(t_pl, 'revenue', 2001)).toBeCloseTo(1100);
    expect(val(t_pl, 'cogs', 2001)).toBeCloseTo(660);
    expect(val(t_pl, 'ord_income', 2001)).toBeCloseTo(440);

    const t_bs = fam.getTable({ fs: 'BS', years: [2000, 2001] });
    // cash(2001) = cash(2000) + ord_income(2001) = 100 + 440 = 540
    expect(val(t_bs, 'cash_jp', 2000)).toBeCloseTo(100);
    // With the new CF logic, there are no working capital changes, so cash should still be prev + profit
    expect(val(t_bs, 'cash_jp', 2001)).toBeCloseTo(540);
  });

  test('unknown accountId in PREVS (strict=false default) is synthesized; strict=true throws', () => {
    const fam = new FAM();
    const PREVS_WITH_UNKNOWN = [{ ...PREVS[0], extra_unknown: 999 }];
    // default: permissive
    expect(() => fam.importActuals(PREVS_WITH_UNKNOWN, accounts)).not.toThrow();
    // strict mode: throws
    const famStrict = new FAM();
    expect(() =>
      famStrict.importActuals(PREVS_WITH_UNKNOWN, accounts, { strict: true })
    ).toThrow();
  });

  test('cash prev missing -> seeded as 0 and compute succeeds', () => {
    const fam = new FAM();
    const prevsNoCash = [{ revenue: 1000, cogs: 600 }];

    fam.importActuals(prevsNoCash as any, accounts);
    fam.setRules(RULES);
    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: 'ord_income',
        cashAccount: GAID.CASH,
      })
    ).not.toThrow();
    const t = fam.getTable({ fs: 'BS', years: [2001] });
    // cash(2000)=0, ord_income(2001)=440 -> cash(2001)=440
    expect(val(t, 'cash_jp', 2001)).toBeCloseTo(440);
  });

  test('B&C: GAIDターゲット/カウンタは primary accountId へ反映', () => {
    /*
		B&Cの target/counter にGAIDを指定した場合、importActuals で設定された
		primary accountId に解決されて値が反映されることを確認。
		*/
    const fam = new FAM();
    fam.importActuals(PREVS, accounts);
    fam.setRules(RULES);

    const bc: CFI[] = [
      {
        target: GAID.NET_SALES, // 'revenue' に解決される
        isCredit: true,
        sign: 'PLUS',
        value: 50,
        counter: GAID.CASH, // 'cash_jp' に解決される
        cf_category: 'CFF',
      },
    ];
    fam.setBalanceChange(bc);

    fam.compute({
      years: 1,
      baseProfitAccount: 'ord_income',
      cashAccount: GAID.CASH,
    });

    const t_pl = fam.getTable({ fs: 'PL', years: [2001] });

    // target=REVENUE は primary accountId= 'revenue' と解決され、+50 される
    expect(val(t_pl, 'revenue', 2001)).toBeCloseTo(1100 + 50);

    const t_bs = fam.getTable({ fs: 'BS', years: [2001] });
    // counter=CASH は 'cash_jp' で逆符号（-50）される
    // 先のキャッシュ計算(540)から、B&Cで -50 → 490
    expect(val(t_bs, 'cash_jp', 2001)).toBeCloseTo(490);
  });

  test('B&C: counter に accountId=現金 を指定しても逆符号になる', () => {
    /*
		counter に GAID ではなく accountId を直接指定しても、現金勘定であれば
		正しく逆符号で反映されることを確認。
		*/
    const fam = new FAM();
    fam.importActuals(PREVS, accounts);
    fam.setRules(RULES);

    // counter を GAID ではなく accountId 'cash_jp' で指定
    const bc: CFI[] = [
      {
        target: GAID.NET_SALES,
        isCredit: true,
        sign: 'PLUS',
        value: 50,
        counter: 'cash_jp',
        cf_category: 'CFF',
      },
    ];
    fam.setBalanceChange(bc);

    fam.compute({
      years: 1,
      baseProfitAccount: 'ord_income',
      cashAccount: GAID.CASH,
    });

    const t_pl = fam.getTable({ fs: 'PL', years: [2001] });
    expect(val(t_pl, 'revenue', 2001)).toBeCloseTo(1100 + 50);

    const t_bs = fam.getTable({ fs: 'BS', years: [2001] });
    expect(val(t_bs, 'cash_jp', 2001)).toBeCloseTo(490);
  });

  test('snapshotLatestActual returns snapshot for specified fs type', () => {
    const fam = new FAM();
    fam.importActuals(PREVS, ACCS);
    fam.setRules(RULES);
    fam.compute({
      years: 1,
      baseProfitAccount: 'ord_income',
      cashAccount: GAID.CASH,
    });

    // 1. PL (default) snapshot
    const snapPL = fam.snapshotLatestActual();
    const keysPL = Object.keys(snapPL);
    expect(keysPL).toContain('revenue');
    expect(keysPL).toContain('cogs');
    expect(keysPL).not.toContain('cash_jp'); // BS account should not be here
    expect(snapPL['revenue']).toBe(1000);

    // 2. BS snapshot
    const snapBS = fam.snapshotLatestActual({ fs: 'BS' });
    const keysBS = Object.keys(snapBS);
    expect(keysBS).toContain('cash_jp');
    expect(keysBS).not.toContain('revenue'); // PL account should not be here
    expect(snapBS['cash_jp']).toBe(100);
  });

  test('B&C driver: driver.name を GAID と accountId で指定しても同じ結果になる', () => {
    /*
		- どこに: setBalanceChange(driver.name を GAID/ID 指定) → compute → getTable
		- 何を渡す: ケース1 driver=GAID.NET_SALES、ケース2 driver='revenue'、どちらも target='ord_income'
		- 何が返ってきて: FY2001 の ord_income 値
		- 何が検証できる: 双方とも ord_income(2001)=440 に driver=1100 が加わり 1540 で一致
		*/
    // --- ケース1: driver を GAID (NET_SALES) で指定 ---
    const famGAID = new FAM();
    famGAID.importActuals(PREVS, ACCS);
    famGAID.setRules(RULES);
    const bcGAID: CFI[] = [
      // driver = GAID.NET_SALES（= revenue(FY2001)=1100 を参照）、target は accountId=ord_income
      {
        sign: 'PLUS',
        target: 'ord_income',
        counter: GAID.CASH,
        driver: { name: GAID.NET_SALES as any },
        isCredit: false,
      },
    ];
    famGAID.setBalanceChange(bcGAID);
    famGAID.compute({
      years: 1,
      baseProfitAccount: 'ord_income',
      cashAccount: GAID.CASH,
    });
    const tGAID = famGAID.getTable({ years: [2001] });
    const ordGAID = val(tGAID, 'ord_income', 2001);

    // --- ケース2: driver を accountId ('revenue') で指定 ---
    const famId = new FAM();
    famId.importActuals(PREVS, ACCS);
    famId.setRules(RULES);
    const bcId: CFI[] = [
      {
        sign: 'PLUS',
        target: 'ord_income',
        counter: GAID.CASH,
        driver: { name: 'revenue' as any },
        isCredit: false,
      },
    ];
    famId.setBalanceChange(bcId);
    famId.compute({
      years: 1,
      baseProfitAccount: 'ord_income',
      cashAccount: GAID.CASH,
    });
    const tId = famId.getTable({ years: [2001] });
    const ordId = val(tId, 'ord_income', 2001);
    // ベースの ord_income(2001)= 440、driver 量 = revenue(2001)=1100
    // したがって B&C 後は 440 + 1100 = 1540 になる想定で、両ケース一致
    expect(ordGAID).toBeCloseTo(1540);
    expect(ordId).toBeCloseTo(1540);
  });

  test('accountsMaster 未指定で B&C に GAID を使うと、GAID→accountId のマッピングが無くて失敗する', () => {
    /*
		- どこに: setBalanceChange(GAID 指定) → compute
		- 何を渡す: accountsMaster なしで PREVS のみ投入、B&C(target=GAID.NET_SALES,counter=GAID.CASH)
		- 何が返ってきて: compute 時に例外
		- 何が検証できる: GAID→accountId の primary マッピングが無いと B&C 検証/現金解決でエラー
		*/
    // マスタ未指定（GAID→accountId の primary マッピングが構築されない）
    const fam = new FAM();
    // PREVS だけ投入（accountId ベース）
    fam.importActuals(PREVS /*, no ACCS */ as any);
    fam.setRules(RULES);
    // B&C は GAID 指定
    const bc: CFI[] = [
      {
        sign: 'PLUS',
        target: GAID.NET_SALES as any,
        counter: GAID.CASH,
        value: 50,
        isCredit: false,
      },
    ];
    fam.setBalanceChange(bc);

    // 計算時、少なくとも現金 GAID → accountId 解決（attachCash 内）で失敗するはず
    // validateBalanceChange() 側でも primaryAccountIdOfGAID が無い GAID は弾かれる
    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: 'ord_income',
        cashAccount: GAID.CASH,
      })
    ).toThrow(/No mapped account for GAID|target not found|counter not found/i);
  });

  test('B&C: driver が無く value も未指定ならエラーになる（validateBalanceChange の仕様）', () => {
    /*
		- どこに: setBalanceChange の入力検証 → compute
		- 何を渡す: driver も value も欠落した CFI（counter のみ指定）
		- 何が返ってきて: compute 時に例外
		- 何が検証できる: driver または value のいずれか必須というバリデーション
		*/
    const fam = new FAM();
    fam.importActuals(PREVS, ACCS);
    fam.setRules(RULES);

    // driver も value も無し（counter は必須なので指定）
    const bc: CFI[] = [
      {
        sign: 'PLUS',
        target: 'ord_income',
        counter: GAID.CASH,
        isCredit: false,
      } as any,
    ];
    fam.setBalanceChange(bc);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: 'ord_income',
        cashAccount: GAID.CASH,
      })
    ).toThrow(/driver or value is required/i);
  });

  test('GAIDのprimary選定: is_primary > fs_type=PL > 先勝ち の順で解決される', () => {
    /*
		- どこに: setBalanceChange(GAID.NET_SALES を target) → compute → getTable
		- 何を渡す: NET_SALES を共有する3候補 + is_primary=true の1つ、B&C(value=50)
		- 何が返ってきて: 各候補の FY2001 値
		- 何が検証できる: target の primary 解決が is_primary > PL > 先勝ち で 'rev_primary' に +50 が入る
		*/
    // 同一 GAID = NET_SALES を持つ 3 アカウントを用意
    const ACCS_MULTI: Account[] = [
      // 1) 先勝ち候補（is_primary なし / fs_type=BS）
      {
        id: 'rev_first',
        AccountName: '売上(先勝ち)',
        GlobalAccountID: GAID.NET_SALES as any,
        fs_type: 'BS',
      } as any,
      // 2) fs_type=PL 候補
      {
        id: 'rev_pl',
        AccountName: '売上(PL)',
        GlobalAccountID: GAID.NET_SALES as any,
        fs_type: 'PL',
      } as any,
      // 3) is_primary=true 候補（順番は最後に置く）
      {
        id: 'rev_primary',
        AccountName: '売上(Primary)',
        GlobalAccountID: GAID.NET_SALES as any,
        fs_type: 'PL',
        is_primary: true,
      } as any,
      // 既存の現金・利益も追加
      {
        id: 'cash_jp',
        AccountName: '現金',
        GlobalAccountID: GAID.CASH,
        fs_type: 'BS',
        is_credit: false,
      } as any,
      {
        id: 'ord_income',
        AccountName: '経常利益',
        GlobalAccountID: GAID.ORDINARY_INCOME,
        fs_type: 'PL',
      } as any,
    ];

    // 実績（FY2000）: 3つの売上に値を入れて差が分かるように
    const PREVS_MULTI = [
      {
        cash_jp: 100,
        rev_first: 1000,
        rev_pl: 2000,
        rev_primary: 3000,
        ord_income: 0,
      },
    ];

    const fam = new FAM();
    fam.importActuals(PREVS_MULTI, ACCS_MULTI);

    // ルール: ord_income だけ簡単に (rev_primary から作るなどもできるが、B&Cで十分)
    fam.setRules({
      ord_income: { type: 'FIXED_VALUE', value: 0 } as RuleInput,
    });

    // B&C: target を GAID.NET_SALES に +50
    // primary 選定規則通りなら 'rev_primary' が選ばれて FY2001 が +50 される
    const bc: CFI[] = [
      {
        sign: 'PLUS',
        target: GAID.NET_SALES as any,
        counter: GAID.CASH,
        value: 50,
        isCredit: false,
        cf_category: 'CFF',
      },
    ];
    fam.setBalanceChange(bc);

    fam.compute({
      years: 1,
      baseProfitAccount: 'ord_income',
      cashAccount: GAID.CASH,
    });

    const t_pl = fam.getTable({ fs: 'PL', years: [2001] });

    // rev_primary だけが FY2001 に +50（= 3000 + 50 = 3050）
    // 他の2つは FY2001 に値が無ければ表示時フォールバックで FY2000 値（1000, 2000）のまま
    expect(val(t_pl, 'rev_primary', 2001)).toBeCloseTo(3050);
    expect(val(t_pl, 'rev_pl', 2001)).toBeCloseTo(2000);
    // 念のため、ord_income は 0 固定
    expect(val(t_pl, 'ord_income', 2001)).toBeCloseTo(0);

    const t_bs = fam.getTable({ fs: 'BS', years: [2001] });
    expect(val(t_bs, 'rev_first', 2001)).toBeCloseTo(1000);

    // 現金は cash(prev=100) + ord_income(2001=0) + B&C(-50) = 50
    expect(val(t_bs, 'cash_jp', 2001)).toBeCloseTo(50);
  });
});
