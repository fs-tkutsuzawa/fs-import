import {
  globalAccountsFixture,
  userAccountsFixture,
  periodsFixture,
  importDfFixture,
  calculationRulesFixture,
} from './fixtures/calculationFixtures';

describe('計算用フィクスチャの基本検証', () => {
  test('グローバル勘定フィクスチャがDDL必須項目を保持している', () => {
    expect(globalAccountsFixture.length).toBeGreaterThan(0);
    for (const ga of globalAccountsFixture) {
      expect(ga.ga_code).toMatch(/^GA-/);
      expect(typeof ga.ga_type).toBe('string');
      expect(['super_calc', 'aggregate']).toContain(ga.ga_type);
      expect(['PL', 'BS', 'CF']).toContain(ga.fs_type);
      expect(typeof ga.sort_num).toBe('number');
      expect(typeof ga.indent_num).toBe('number');
    }
  });

  test('ユーザー勘定フィクスチャが親GA情報を持ち、貸借属性をカバーしている', () => {
    expect(userAccountsFixture.length).toBeGreaterThan(0);
    for (const ua of userAccountsFixture) {
      expect(typeof ua.parent_ga_id).toBe('string');
      expect(['super_calc', 'aggregate']).toContain(ua.parent_ga_type);
      expect(['PL', 'BS', 'CF']).toContain(ua.fs_type);
      expect(['boolean', 'object']).toContain(typeof ua.is_credit);
    }
  });

  test('期間フィクスチャが表示順と期間タイプを保持している', () => {
    expect(periodsFixture.length).toBeGreaterThan(0);
    const orders = periodsFixture.map((p) => p.display_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const period of periodsFixture) {
      expect(['Yearly', 'Monthly', 'Event']).toContain(period.period_type);
      expect(['Actual', 'Forecast']).toContain(period.af_type);
    }
  });

  test('インポートDFフィクスチャが年度配列を保持している', () => {
    expect(Array.isArray(importDfFixture.df_json)).toBe(true);
    expect(importDfFixture.df_json.length).toBeGreaterThan(0);
    for (const snapshot of importDfFixture.df_json) {
      expect(Object.keys(snapshot).length).toBeGreaterThan(0);
    }
  });

  test('計算ルールフィクスチャがルール種別と定義を持っている', () => {
    expect(calculationRulesFixture.length).toBeGreaterThan(0);
    for (const rule of calculationRulesFixture) {
      expect(['PARAMETER', 'BALANCE_AND_CHANGE']).toContain(rule.rule_type);
      expect(rule.rule_definition).toBeTruthy();
    }
  });
});
