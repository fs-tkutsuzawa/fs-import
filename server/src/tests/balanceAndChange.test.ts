/*
（このファイルのテスト全体）
- どこに: `setBalanceChange` → `compute` → `getTable`
- 何を渡す: 実績 `PREVS`、予測 `RULES`、B&C 定義 `cfis`（target/counter/driver|value を GAID で指定）、`compute({ years:1, baseProfitAccount: A.経常利益.id, cashAccount: A.現金.id })`、表抽出
- 何が返る: `getTable()` の数値（PPE/利益剰余金/現金 等）
- 何が検証できる: 減価償却では PPE↓・RE↓・現金はB&C影響なし（基点利益0）、設備投資では PPE↑・現金↓（PL非経由）となること＝B&C の貸借・相手勘定の挙動が期待通り
*/
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
  利益剰余金: ACC(
    GAID.RETAINED_EARNINGS as any as GAID,
    '利益剰余金',
    'BS',
    true
  ),
  建物機械等: ACC(
    GAID.PPE_OPENING_BALANCE_GROSS as any as GAID,
    '建物・機械等',
    'BS',
    false
  ),
  減価償却費: ACC(GAID.DEPRECIATION as any as GAID, '減価償却費', 'PL'),
  設備投資: ACC(GAID.PPE_ADDITIONS as any as GAID, '設備投資', 'CF'),
  経常利益: ACC(GAID.ORDINARY_INCOME as any as GAID, '経常利益', 'PL'),
};

describe('Balance & Change (B&C) PoC（ID/GAIDベース）', () => {
  test('減価償却：PPE 減少 / 利益剰余金 減少 / 現金はB&Cで影響なし', () => {
    const fam = new FAM();

    // 実績（古→新）: GAIDキー
    const PREVS = [
      {
        [A.現金.id]: 100,
        [A.利益剰余金.id]: 500,
        [A.建物機械等.id]: 1000,
        [A.減価償却費.id]: 0,
        [A.設備投資.id]: 0,
      },
      {
        [A.現金.id]: 100,
        [A.利益剰余金.id]: 500,
        [A.建物機械等.id]: 1000,
        [A.減価償却費.id]: 0,
        [A.設備投資.id]: 0,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    // PLルール：減価償却費(FY+1)=100、経常利益(FY+1)=0（現金の基点利益影響を消すため）
    const RULES: Record<string, RuleInput> = {
      [A.減価償却費.id]: { type: 'FIXED_VALUE', value: 100 },
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
    };
    fam.setRules(RULES);

    // B&C定義：PPE を 減価償却費 により減じ、相手方は 利益剰余金（すべて GAID 指定）
    const cfis: CFI[] = [
      {
        target: A.建物機械等.id,
        isCredit: false,
        sign: 'MINUS',
        driver: { name: A.減価償却費.id },
        counter: A.利益剰余金.id,
      },
    ];
    (fam as any).setBalanceChange?.(cfis);

    // 計算（1年先、基点利益=経常利益、現金連動ON／GAID指定）
    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: A.現金.id,
    });

    // FY推定：importActualsが2000,2001を割当 → 予測は 2002
    const y = 2002;
    // console.log(fam.getTable({ fs: 'PL', years: [2002] }));

    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 期待：PPE=1000-100=900、RE=500-100=400、現金=100+100(減価償却費のCF調整)=200
    expect(at(A.建物機械等.id)).toBe(900);
    expect(at(A.利益剰余金.id)).toBe(400);
    expect(at(A.現金.id)).toBe(200);
  });

  test('設備投資：PPE 増加 / 現金 減少（PL非経由）', () => {
    const fam = new FAM();

    const PREVS = [
      {
        [A.現金.id]: 100,
        [A.利益剰余金.id]: 500,
        [A.建物機械等.id]: 1000,
        [A.減価償却費.id]: 0,
        [A.設備投資.id]: 0,
      },
      {
        [A.現金.id]: 100,
        [A.利益剰余金.id]: 500,
        [A.建物機械等.id]: 1000,
        [A.減価償却費.id]: 0,
        [A.設備投資.id]: 0,
      },
    ];
    fam.importActuals(PREVS, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 }, // 現金の基点利益影響を消す
    };
    fam.setRules(RULES);

    // B&C定義：PPE を 設備投資(=200) で増加、相手方は 現金（キャッシュアウト）
    const cfis: CFI[] = [
      {
        target: A.建物機械等.id,
        isCredit: false,
        sign: 'PLUS',
        value: 200,
        counter: A.現金.id,
        cf_category: 'CFI',
      },
    ];
    (fam as any).setBalanceChange?.(cfis);

    fam.compute({
      years: 1,
      baseProfitAccount: A.経常利益.id,
      cashAccount: A.現金.id,
    });

    const y = 2002;
    const table = fam.getTable({ fs: 'BS', years: [y] });
    const col = table.columns.indexOf(`FY:${y}`);
    const rowById = (id: string) =>
      table.rows.findIndex((r) => r.accountId === id);
    const at = (id: string) => table.data[rowById(id)][col];

    // 期待：PPE=1000+200=1200、現金=100-200= -100（基点利益0）
    expect(at(A.建物機械等.id)).toBe(1200);
    expect(at(A.現金.id)).toBe(-100);
    // 利益剰余金はこのB&Cでは変化しない
    expect(at(A.利益剰余金.id)).toBe(500);
  });
});
