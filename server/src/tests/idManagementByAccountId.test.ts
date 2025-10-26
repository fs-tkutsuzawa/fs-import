/*
（このファイルのテスト全体）
- どこに: `FAM` の `importActuals` → `setRules` → `compute` → `getTable`
- 何を渡す: 実績 `PREVS`（accountId キー）と勘定 `A`、予測 `RULES`、`compute({ years:1, baseProfitAccount: A.経常利益.id, cashAccount: GAID.CASH })`、表抽出 `{ fs:'PL', years:[y] }`
- 何が返る: `getTable()` が accountId 行 × FY 列の表を返す
- 何が検証できる: 同一 GAID でも accountId が異なれば行が分かれ、売上A/B の値(100/200)が独立に保持される＝アイデンティティは GAID ではなく accountId により管理される
*/
import { FAM } from '@/fam/fam.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, Period, RuleInput } from '@/model/types.js';
import { stableHash } from '@/utils/hash.js';

// Helpers
const CURR: Period = {
  Period_type: 'Yearly',
  AF_type: 'Forecast',
  Period_val: null,
  offset: 0,
};
const PREV_P: Period = {
  Period_type: 'Yearly',
  AF_type: 'Actual',
  Period_val: null,
  offset: -1,
};

// Account factory: unique accountId via stableHash, shared GAID allowed
const ACC = (gaid: GAID, nameJa: string, fs: 'PL' | 'BS' = 'PL'): Account => ({
  id: stableHash(`${gaid}-${nameJa}`),
  AccountName: nameJa,
  GlobalAccountID: gaid,
  fs_type: fs,
});

describe('Identity managed by accountId (stableHash), not GAID; B&C remains GAID-based', () => {
  test('Two PL accounts sharing the same GAID remain distinct by accountId across FAM/AST', () => {
    /*
    - どこに: FAM.importActuals → setRules → compute → getTable
    - 何を渡す: accountId キーの実績 PREVS、各売上の自己PREV参照 RULES、compute({years:1, baseProfit: 経常利益, cash: GAID.CASH})、years=[FY]
    - 何が返ってきて: accountId 行×FY 列の表（売上A/売上B の別行）
    - 何が検証できる: 同一 GAID でも accountId で識別され行が分離し、数値 100/200 が独立保持される
    */
    const fam = new FAM();

    const A = {
      現金: ACC(GAID.CASH as any as GAID, '現金', 'BS'),
      売上A: ACC(GAID.NET_SALES as any as GAID, '売上A'),
      売上B: ACC(GAID.NET_SALES as any as GAID, '売上B'),
      売上原価: ACC(GAID.COGS as any as GAID, '売上原価'),
      営業利益: ACC(GAID.OPERATING_INCOME as any as GAID, '営業利益'),
      経常利益: ACC(GAID.ORDINARY_INCOME as any as GAID, '経常利益'),
    } as const;

    // Actuals: GAID-normalized snapshot is conceptually possible, but here accountId (stableHash) is the key
    const PREVS: Array<Record<string, number>> = [
      {
        [A.現金.id]: 0,
        [A.売上A.id]: 100,
        [A.売上B.id]: 200,
        [A.売上原価.id]: 0,
        [A.営業利益.id]: 0,
        [A.経常利益.id]: 0,
      },
      {
        [A.現金.id]: 0,
        [A.売上A.id]: 100,
        [A.売上B.id]: 200,
        [A.売上原価.id]: 0,
        [A.営業利益.id]: 0,
        [A.経常利益.id]: 0,
      },
    ];

    fam.importActuals(PREVS, Object.values(A));

    // Rules keyed by accountId. 売上A/B both reference their own PREV; 経常利益は0（現金連動を無効化）
    const RULES: Record<string, RuleInput> = {
      [A.売上A.id]: {
        type: 'GROWTH_RATE',
        value: 0.0,
        refs: [{ period: PREV_P, account: A.売上A }],
      },
      [A.売上B.id]: {
        type: 'GROWTH_RATE',
        value: 0.0,
        refs: [{ period: PREV_P, account: A.売上B }],
      },
      [A.売上原価.id]: { type: 'FIXED_VALUE', value: 0 },
      [A.営業利益.id]: {
        type: 'CALCULATION',
        refs: [
          { period: CURR, account: A.売上A, sign: +1 },
          { period: CURR, account: A.売上B, sign: +1 },
          { period: CURR, account: A.売上原価, sign: -1 },
        ],
      },
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
    };
    fam.setRules(RULES);

    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: GAID.CASH,
    });

    // FY inference: importActuals assigns 2000, 2001 → forecast is 2002
    const y = 2002;
    const table = fam.getTable({ fs: 'PL', years: [y] });
    const colIdx = table.columns.indexOf(`FY:${y}`);

    const rowIdxByAccountId = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);

    // Both rows must exist and be distinct even though they share the same GAID
    const rA = rowIdxByAccountId(A.売上A.id);
    const rB = rowIdxByAccountId(A.売上B.id);
    expect(rA).toBeGreaterThanOrEqual(0);
    expect(rB).toBeGreaterThanOrEqual(0);
    expect(rA).not.toBe(rB);

    // Values remain distinct by accountId
    expect(table.data[rA][colIdx]).toBe(100);
    expect(table.data[rB][colIdx]).toBe(200);
  });
});
