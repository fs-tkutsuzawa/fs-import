/*
（このファイルのテスト全体）
- どこに: FAM 系（`compute` → `getTable`）と AST 系（`compileUnifiedAST`/`validateAST`/`topoOrder`/`evalTopo`/`evalNodeRecursive`/`toDOT`）
- 何を渡す: 実績 `PREVS`、予測 `RULES`、`compute` オプション、AST には prev スナップショット・`RULES`・基点科目/現金
- 何が返る: 表（数値行列）、AST 検証結果/評価値/DOT 文字列
- 何が検証できる: PL 計算の期待値一致、AST の位相順序と再帰評価の一致、DOT 出力に予想されるルートが含まれること
*/
import {
  compileUnifiedAST,
  evalNodeRecursive,
  evalTopo,
  toDOT,
  topoOrder,
  validateAST,
} from '@/engine/ast.js';
import { FAM } from '@/fam/fam.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, Period, RuleInput } from '@/model/types.js';
import { stableHash } from '@/utils/hash.js';

// Period ヘルパ
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

// Account ヘルパ（id は GAID に一致、表示名はUI用途のみ）
const ACC = (
  gaid: GAID,
  nameJa: string,
  fs: 'PL' | 'BS' | 'CF' = 'PL',
  is_credit?: boolean
): Account => ({
  id: stableHash(`${gaid}-${nameJa}`),
  AccountName: nameJa,
  GlobalAccountID: gaid,
  fs_type: fs,
  is_credit,
});

const A = {
  現金: ACC(GAID.CASH as any as GAID, '現金1', 'BS', false),
  売上: ACC(GAID.NET_SALES as any as GAID, '売上高1'),
  売上原価: ACC(GAID.COGS as any as GAID, '売上原価1'),
  販管費: ACC(GAID.SGA as any as GAID, '販管費'),
  営業外利益: ACC(GAID.NON_OPERATING_INCOME as any as GAID, '営業外利益1'),
  営業外費用: ACC(GAID.NON_OPERATING_EXPENSES as any as GAID, '営業外費用1'),
  営業利益: ACC(GAID.OPERATING_INCOME as any as GAID, '営業利益1'),
  経常利益: ACC(GAID.ORDINARY_INCOME as any as GAID, '経常利益1'),
};

// 実績（古→新）: GAID キーで正規化済み
const PREVS: Array<Record<string, number>> = [
  {
    [A.現金.id]: 30,
    [A.売上.id]: 900,
    [A.売上原価.id]: 540,
    [A.販管費.id]: 90,
    [A.営業外利益.id]: 8,
    [A.営業外費用.id]: 4,
  },
  {
    [A.現金.id]: 40,
    [A.売上.id]: 950,
    [A.売上原価.id]: 570,
    [A.販管費.id]: 95,
    [A.営業外利益.id]: 9,
    [A.営業外費用.id]: 4,
  },
  {
    [A.現金.id]: 50,
    [A.売上.id]: 1000,
    [A.売上原価.id]: 600,
    [A.販管費.id]: 100,
    [A.営業外利益.id]: 10,
    [A.営業外費用.id]: 5,
  },
];

// 予測ルール（PLのみ）。現金は自動連動：現金=現金(prev)+基点利益（本テストでは基点=経常利益）
const RULES: Record<string, RuleInput> = {
  [A.経常利益.id]: {
    type: 'CALCULATION',
    refs: [
      { period: CURR, account: A.営業利益, sign: +1 },
      { period: CURR, account: A.営業外利益, sign: +1 },
      { period: CURR, account: A.営業外費用, sign: -1 },
    ],
  },
  [A.売上.id]: {
    type: 'GROWTH_RATE',
    value: 0.1,
    refs: [{ period: PREV_P, account: A.売上 }],
  },
  [A.売上原価.id]: {
    type: 'GROWTH_RATE',
    value: 0.0,
    refs: [{ period: PREV_P, account: A.売上原価 }],
  },
  [A.販管費.id]: {
    type: 'GROWTH_RATE',
    value: 0.0,
    refs: [{ period: PREV_P, account: A.販管費 }],
  },
  [A.営業外利益.id]: {
    type: 'GROWTH_RATE',
    value: 0.0,
    refs: [{ period: PREV_P, account: A.営業外利益 }],
  },
  [A.営業外費用.id]: {
    type: 'GROWTH_RATE',
    value: 0.0,
    refs: [{ period: PREV_P, account: A.営業外費用 }],
  },
  [A.営業利益.id]: {
    type: 'CALCULATION',
    refs: [
      { period: CURR, account: A.売上, sign: +1 },
      { period: CURR, account: A.売上原価, sign: -1 },
      { period: CURR, account: A.販管費, sign: -1 },
    ],
  },
};

// 期待値：1年目・2年目
const EXPECTS = [
  {
    SALES: 1100,
    COGS: 600,
    SGA: 100,
    NON_OP_INC: 10,
    NON_OP_EXP: 5,
    OP_INCOME: 400,
    ORDINARY_INCOME: 405,
    CASH_END: 455,
  },
  {
    SALES: 1210,
    COGS: 600,
    SGA: 100,
    NON_OP_INC: 10,
    NON_OP_EXP: 5,
    OP_INCOME: 510,
    ORDINARY_INCOME: 515,
    CASH_END: 970,
  },
];

describe('FAM as global state → RULES→AST→計算→FAM書戻し→表ビュー（ID/GAIDベース）', () => {
  const fam = new FAM();
  fam.importActuals(PREVS, Object.values(A)); // accountsMaster に GAID を持つ Account 群
  fam.setRules(RULES);

  // まず 1年目と2年目を逐次計算（baseProfit=accountId, cash=GAID）
  fam.compute({
    years: 2,
    baseProfitAccount: A.経常利益.id,
    cashAccount: GAID.CASH,
  });

  // fam.vizAST();

  test('表ビュー抽出（最新実績FY+1, FY+2）: 行参照は id（GAID）で', () => {
    /*
		- どこに: FAM.compute → getTable
		- 何を渡す: PREVS、RULES、compute({years:2, baseProfit=経常利益, cash=GAID.CASH})、years=[y1,y2]
		- 何が返ってきて: 表の各行（売上/原価/販管費/営業利益/経常利益/現金）の FY 値
		- 何が検証できる: 期待値配列 EXPECTS と一致し、行IDもハッシュ生成した accountId と一致する
		*/
    const actualYears = [2000, 2001, 2002]; // importActuals の仮FY採番ロジック
    const y1 = actualYears[2] + 1;
    const y2 = actualYears[2] + 2;

    const table = fam.getTable({ fs: 'PL', years: [y1, y2] });
    const colIdx = (fy: number) => table.columns.indexOf(`FY:${fy}`);
    const rowIdxById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);

    // 1年目
    expect(table.data[rowIdxById(A.売上.id)][colIdx(y1)]).toBe(
      EXPECTS[0].SALES
    );
    expect(table.data[rowIdxById(A.売上原価.id)][colIdx(y1)]).toBe(
      EXPECTS[0].COGS
    );
    expect(table.data[rowIdxById(A.販管費.id)][colIdx(y1)]).toBe(
      EXPECTS[0].SGA
    );
    expect(table.data[rowIdxById(A.営業利益.id)][colIdx(y1)]).toBe(
      EXPECTS[0].OP_INCOME
    );
    expect(table.data[rowIdxById(A.経常利益.id)][colIdx(y1)]).toBe(
      EXPECTS[0].ORDINARY_INCOME
    );

    // 2年目（1年目の結果をprevとして再適用）
    expect(table.data[rowIdxById(A.売上.id)][colIdx(y2)]).toBe(
      EXPECTS[1].SALES
    );
    expect(table.data[rowIdxById(A.売上原価.id)][colIdx(y2)]).toBe(
      EXPECTS[1].COGS
    );
    expect(table.data[rowIdxById(A.販管費.id)][colIdx(y2)]).toBe(
      EXPECTS[1].SGA
    );
    expect(table.data[rowIdxById(A.営業利益.id)][colIdx(y2)]).toBe(
      EXPECTS[1].OP_INCOME
    );
    expect(table.data[rowIdxById(A.経常利益.id)][colIdx(y2)]).toBe(
      EXPECTS[1].ORDINARY_INCOME
    );

    const tableBS = fam.getTable({ fs: 'BS', years: [y1, y2] });
    const colIdxBS = (fy: number) => tableBS.columns.indexOf(`FY:${fy}`);
    const rowIdxByIdBS = (id: string) =>
      tableBS.rows.findIndex((r) => r.accountId === id);

    expect(tableBS.data[rowIdxByIdBS(A.現金.id)][colIdxBS(y1)]).toBe(
      EXPECTS[0].CASH_END
    );
    // The new CF logic should produce the same result as attachCash when there's no working capital change.
    expect(tableBS.data[rowIdxByIdBS(A.現金.id)][colIdxBS(y2)]).toBe(
      EXPECTS[1].CASH_END
    );

    // table dataのidが、元々hashで生成したものと一致することも確認
    expect(table.rows[rowIdxById(A.現金.id)].accountId).toBe(A.現金.id);
    expect(table.rows[rowIdxById(A.売上.id)].accountId).toBe(A.売上.id);
    expect(table.rows[rowIdxById(A.売上原価.id)].accountId).toBe(A.売上原価.id);
    expect(table.rows[rowIdxById(A.売上原価.id)].globalAccountId).not.toBe(
      A.売上原価.id
    );
  });

  test('AST検証（1年目コンテキスト、GAIDベース）', () => {
    /*
		- どこに: compileUnifiedAST → validateAST → topoOrder/evalTopo/evalNodeRecursive → toDOT
		- 何を渡す: prev スナップショット、RULES、現金/基点利益の GAID
		- 何が返ってきて: 検証結果(ok)、トポロジカル評価値、再帰評価値、DOT 文字列
		- 何が検証できる: 評価手法の一致とグラフの妥当性（TT: ラベルを含む）
		*/
    // prev スナップショットも GAID キー
    const prev1: Record<string, number> = {
      [A.現金.id]: 50,
      [A.売上.id]: 1000,
      [A.売上原価.id]: 600,
      [A.販管費.id]: 100,
      [A.営業外利益.id]: 10,
      [A.営業外費用.id]: 5,
    };
    const ctx = compileUnifiedAST(prev1, RULES, A.現金.id, A.経常利益.id);
    const rootIds = [
      A.現金.id,
      A.経常利益.id,
      A.営業利益.id,
      A.売上.id,
      A.売上原価.id,
      A.販管費.id,
      A.営業外利益.id,
      A.営業外費用.id,
    ]
      .filter((a) => ctx.roots[a])
      .map((a) => ctx.roots[a]);

    const res = validateAST(ctx.reg, rootIds);
    expect(res.ok).toBe(true);

    const order = topoOrder(ctx.reg, rootIds);
    const pos = new Map<string, number>(order.map((id, i) => [id, i]));
    const dependencyPairs: Array<[string, string]> = [];
    for (const n of ctx.reg.all()) {
      if (n.ref1) dependencyPairs.push([n.ref1, n.id]);
      if (n.ref2) dependencyPairs.push([n.ref2, n.id]);
    }
    dependencyPairs.forEach(([ref, target]) => {
      expect(pos.get(ref)!).toBeLessThan(pos.get(target)!);
    });

    const topoVals = evalTopo(ctx.reg, rootIds);
    const roots = Object.keys(ctx.roots)
      .map((key) => ctx.roots[key])
      .filter((root): root is string => Boolean(root));
    roots.forEach((rootId) => {
      const vTopo = Math.round(topoVals.get(rootId)!);
      const vRec = Math.round(evalNodeRecursive(rootId, ctx.reg));
      expect(vTopo).toBe(vRec);
    });

    const dot = toDOT(ctx.reg, [
      ctx.roots[A.現金.id],
      ctx.roots[A.経常利益.id],
    ]);
    // ラベルは TT:◯◯ だが、ここでは GAID 基準のルートが生えていることのみ確認
    expect(dot).toContain('TT:');
  });
});
