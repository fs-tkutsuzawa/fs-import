/*
（このファイルのテスト全体）
- どこに: `compute` 実行時の各種バリデーション（ルール参照・循環・必須・B&C 等）
- 何を渡す: 不正な参照/循環依存/実績不足/NaN 係数/必須欠落 などを含む `RULES` や B&C 定義、`compute` 引数
- 何が返る: 例外（エラーメッセージ）
- 何が検証できる: ルールの妥当性チェックと `compute`/B&C 入力の防御的チェックが機能し、不正入力を確実に検出できる
*/
import { FAM } from '@/fam/fam.js';
import type { CFI } from '@/model/bc.js';
import { GAID } from '@/model/globalAccount.ja.js';
import type { Account, Period, RuleInput } from '@/model/types.js';

// === ヘルパ ===
const ACC = (gaid: GAID, nameJa: string, fs: 'PL' | 'BS' = 'PL'): Account => ({
  id: gaid,
  AccountName: nameJa,
  GlobalAccountID: gaid,
  fs_type: fs,
});

const A = {
  現金: ACC(GAID.CASH as any as GAID, '現金', 'BS'),
  売上: ACC(GAID.NET_SALES as any as GAID, '売上'),
  売上原価: ACC(GAID.COGS as any as GAID, '売上原価'),
  販管費: ACC(GAID.SGA as any as GAID, '販管費'),
  営業利益: ACC(GAID.OPERATING_INCOME as any as GAID, '営業利益'),
  経常利益: ACC(GAID.ORDINARY_INCOME as any as GAID, '経常利益'),
  架空科目: ACC('XXX' as any as GAID, '架空科目'), // 不正GAID想定
};

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

// 実績（GAIDキー）
const PREVS_OK: Array<Record<string, number>> = [
  {
    [A.現金.id]: 10,
    [A.売上.id]: 1000,
    [A.売上原価.id]: 600,
    [A.販管費.id]: 100,
    [A.営業利益.id]: 300,
    [A.経常利益.id]: 300,
  },
  {
    [A.現金.id]: 20,
    [A.売上.id]: 1100,
    [A.売上原価.id]: 600,
    [A.販管費.id]: 100,
    [A.営業利益.id]: 400,
    [A.経常利益.id]: 400,
  },
];

// B&C 実装の有無で test / test.skip を切り替えるヘルパ
const famForBC = () => new FAM();
const hasSetBC = (fam: FAM) =>
  typeof (fam as any).setBalanceChange === 'function';
const bctest: jest.It = hasSetBC(new FAM()) ? test : test.skip;

describe('エラー処理: ルール定義/参照の妥当性（GAIDベース）', () => {
  test('未定義科目（GAID）を参照すると throw', () => {
    /*
    - どこに: compute 中の参照解決（CALCULATION.refs）
    - 何を渡す: 存在しない GAID を参照する RULES
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: 未定義参照は検出されエラーになる
    */
    const fam = new FAM();
    fam.importActuals(PREVS_OK, Object.values(A));

    // 「営業利益」が存在しない GAID「NOPE」を参照
    const RULES: Record<string, RuleInput> = {
      [A.営業利益.id]: {
        type: 'CALCULATION',
        refs: [
          {
            period: CURR,
            account: {
              id: 'NOPE',
              GlobalAccountID: 'NOPE',
              AccountName: '存在しない',
              fs_type: 'PL',
            } as Account,
            sign: +1,
          },
        ],
      },
    };
    fam.setRules(RULES);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: A.現金.id,
      })
    ).toThrow(/(未定義|not\s*found|存在しない)/i);
  });

  test('循環依存（A→B, B→A）で throw（GAID）', () => {
    /*
    - どこに: compute 前の依存解析/実行順序決定
    - 何を渡す: A↔B の循環を含む RULES
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: 循環依存を検出して失敗する
    */
    const fam = new FAM();
    fam.importActuals(PREVS_OK, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      A: {
        type: 'CALCULATION',
        refs: [
          {
            period: CURR,
            account: {
              id: 'B',
              GlobalAccountID: 'B',
              AccountName: 'B',
              fs_type: 'PL',
            } as Account,
            sign: +1,
          },
        ],
      },
      B: {
        type: 'CALCULATION',
        refs: [
          {
            period: CURR,
            account: {
              id: 'A',
              GlobalAccountID: 'A',
              AccountName: 'A',
              fs_type: 'PL',
            } as Account,
            sign: +1,
          },
        ],
      },
    };
    fam.setRules(RULES);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: A.現金.id,
      })
    ).toThrow(/(循環|circular|cycle)/i);
  });

  test('PREV参照だが実績が無い → throw', () => {
    /*
    - どこに: GROWTH_RATE の PREV 参照解決
    - 何を渡す: 実績ゼロ件で PREV を参照する RULES
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: 前期実績がない PREV 参照はエラー
    */
    const fam = new FAM();
    // 実績ゼロ件で PREV を参照
    fam.importActuals([], Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.売上.id]: {
        type: 'GROWTH_RATE',
        value: 0.1,
        refs: [{ period: PREV_P, account: A.売上 }],
      },
    };
    fam.setRules(RULES);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: A.現金.id,
      })
    ).toThrow(/(前期|prev|previous|実績)/i);
  });

  test('係数が NaN → throw（GAID）', () => {
    /*
    - どこに: GROWTH_RATE の係数検証
    - 何を渡す: value=NaN の RULES
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: 不正な係数は弾かれる
    */
    const fam = new FAM();
    fam.importActuals(PREVS_OK, Object.values(A));

    const RULES: Record<string, RuleInput> = {
      [A.売上.id]: {
        type: 'GROWTH_RATE',
        value: Number.NaN as unknown as number,
        refs: [{ period: PREV_P, account: A.売上 }],
      },
    };
    fam.setRules(RULES);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: A.現金.id,
      })
    ).toThrow(/(NaN|不正|invalid)/i);
  });

  test('必須パラメータ欠落（GROWTH_RATE に refs なし）→ throw', () => {
    /*
    - どこに: ルール検証
    - 何を渡す: refs 欠落の GROWTH_RATE
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: 必須フィールド不足が検出される
    */
    const fam = new FAM();
    fam.importActuals(PREVS_OK, Object.values(A));

    const RULES = {
      [A.売上.id]: { type: 'GROWTH_RATE', value: 0.1 } as unknown as RuleInput, // 故意に不完全
    };
    fam.setRules(RULES);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: A.現金.id,
      })
    ).toThrow(/(必須|required|refs|base)/i);
  });
});

describe('エラー処理: 現金（特別科目）と compute オプション（GAIDベース）', () => {
  test('cashAccount 未指定 → throw', () => {
    /*
    - どこに: compute オプション検証
    - 何を渡す: cashAccount 未指定
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: 現金科目指定は必須
    */
    const fam = new FAM();
    fam.importActuals(PREVS_OK, Object.values(A));
    fam.setRules({
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
    });

    expect(() =>
      fam.compute({ years: 1, baseProfitAccount: A.経常利益.id } as any)
    ).toThrow(/(cash|現金|required|must)/i);
  });

  test('cashAccount GAID 不整合 → throw', () => {
    /*
    - どこに: compute オプション検証
    - 何を渡す: 現金以外の GAID を cashAccount に指定
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: cashAccount は現金 GAID でなければならない
    */
    const fam = new FAM();
    fam.importActuals(PREVS_OK, Object.values(A));
    fam.setRules({
      [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 },
    });

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: 'NOT_CASH',
      })
    ).toThrow(/(現金|cash)/i);
  });
});

describe('エラー処理: Balance & Change（実装がある場合のみ実行, GAIDベース）', () => {
  bctest('B&C: 不正ターゲット(GAID) → throw', () => {
    /*
    - どこに: setBalanceChange の検証 → compute
    - 何を渡す: 存在しない GAID を target に持つ CFI
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: ターゲット未定義の B&C は失敗
    */
    const fam = famForBC();
    fam.importActuals(PREVS_OK, Object.values(A));
    fam.setRules({ [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 } });

    const cfis: CFI[] = [
      {
        target: 'NOT_EXISTS_GAID', // 不正
        isCredit: false,
        sign: 'PLUS',
        value: 100,
        counter: A.現金.id,
      },
    ];

    (fam as any).setBalanceChange(cfis);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: A.現金.id,
      })
    ).toThrow(/(対象|target|not\s*found|存在しない)/i);
  });

  bctest('B&C: driver/value の両方欠落 → throw', () => {
    /*
    - どこに: setBalanceChange の検証 → compute
    - 何を渡す: driver と value が共に欠落した CFI
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: driver または value のいずれか必須
    */
    const fam = famForBC();
    fam.importActuals(PREVS_OK, Object.values(A));
    fam.setRules({ [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 } });

    const cfis: CFI[] = [
      {
        target: A.売上.id, // ターゲットは有効だが…
        isCredit: false,
        sign: 'MINUS',
        // value も driver も無い
        counter: A.現金.id,
      } as any,
    ];

    (fam as any).setBalanceChange(cfis);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: A.現金.id,
      })
    ).toThrow(/(driver|value|必須|required)/i);
  });

  bctest('B&C: sign が不正値 → throw', () => {
    /*
    - どこに: setBalanceChange の検証 → compute
    - 何を渡す: sign に不正値を持つ CFI
    - 何が返ってきて: compute 実行で例外
    - 何が検証できる: 許可された sign 値以外はエラー
    */
    const fam = famForBC();
    fam.importActuals(PREVS_OK, Object.values(A));
    fam.setRules({ [A.経常利益.id]: { type: 'FIXED_VALUE', value: 0 } });

    const cfis: CFI[] = [
      {
        target: A.売上.id,
        isCredit: false,
        sign: 'PLUS_MINUS' as any, // 不正
        value: 10,
        counter: A.現金.id,
      },
    ];

    (fam as any).setBalanceChange(cfis);

    expect(() =>
      fam.compute({
        years: 1,
        baseProfitAccount: A.経常利益.id,
        cashAccount: A.現金.id,
      })
    ).toThrow(/(sign|不正|invalid)/i);
  });
});
