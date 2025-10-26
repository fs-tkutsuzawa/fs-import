import {
  globalAccountsFixture,
  userAccountsFixture,
  periodsFixture,
  importDfFixture,
  calculationRulesFixture,
} from './fixtures/calculationFixtures';
import {
  joinAccounts,
  buildOrderedPeriods,
  convertImportDfToPrevs,
  partitionCalculationRules,
} from '../service/calculationDataTransforms';

describe('計算データ変換ユーティリティ', () => {
  test('ユーザー勘定とグローバル勘定を結合してメタ情報を付与する', () => {
    const joined = joinAccounts(userAccountsFixture, globalAccountsFixture);
    expect(joined.length).toBe(userAccountsFixture.length);
    const sales = joined.find((account) => account.id === '101');
    expect(sales?.ga?.ga_code).toBe('GA-PL-NET-SALES');
    expect(sales?.ga?.ga_type).toBe('aggregate');
    expect(sales?.fs_type).toBe('PL');
  });

  test('期間はdisplay_order順に整列し、ラベルとメタを保持する', () => {
    const ordered = buildOrderedPeriods(periodsFixture);
    expect(ordered.map((p) => p.period_label)).toEqual(['FY2023', 'FY2024']);
    expect(ordered[0].af_type).toBe('Actual');
  });

  test('import_dfデータをPREVS形式に変換する', () => {
    const prevs = convertImportDfToPrevs(importDfFixture);
    expect(prevs.length).toBe(importDfFixture.df_json.length);
    expect(prevs[0]['101']).toBe(800);
  });

  test('旧形式(import_df.rows+periods)をPREVS形式へ変換する', () => {
    const legacyDf = {
      rows: [
        {
          type: 'Account',
          label: '売上高',
          values: ['2,600,000', '2,860,000', '3,146,000', '3,460,600', '0'],
        },
        {
          type: 'Account',
          label: '営業利益',
          values: [0, '120', 0, '310', 0],
        },
        {
          type: 'KPI',
          label: '商品数量',
          values: ['40,000', '44,000'],
        },
      ],
      periods: ['2020-03', '2021-03', '2022-03', '2023-03', 'EOL'],
    };

    const prevs = convertImportDfToPrevs({ df_json: legacyDf });
    expect(prevs.length).toBe(4);
    expect(prevs[0]['売上高']).toBe(2600000);
    expect(prevs[1]['営業利益']).toBe(120);
    expect(prevs[3]['営業利益']).toBe(310);
    expect(prevs[0]).not.toHaveProperty('商品数量');
  });

  test('計算ルールをPARAMETERとBALANCE_AND_CHANGEに分類する', () => {
    const { parameterRules, balanceChanges } = partitionCalculationRules(
      calculationRulesFixture
    );
    expect(parameterRules.length).toBe(1);
    expect(balanceChanges.length).toBe(1);
    expect(parameterRules[0].target_user_account_id).toBe(102);
  });
});
