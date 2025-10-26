import { INTEGRATED_ACCOUNTS_VIEW_SQL } from '../util/sql/integratedAccountsView';

describe('INTEGRATED_ACCOUNTS_VIEW_SQL', () => {
  test('includes USER_ACCOUNT and GLOBAL_ONLY sources', () => {
    expect(INTEGRATED_ACCOUNTS_VIEW_SQL).toContain(
      "'USER_ACCOUNT'::text AS source"
    );
    expect(INTEGRATED_ACCOUNTS_VIEW_SQL).toContain(
      "'GLOBAL_ONLY'::text AS source"
    );
  });

  test('joins global and user accounts on GA id', () => {
    expect(INTEGRATED_ACCOUNTS_VIEW_SQL).toContain(
      'JOIN ga ON ga.global_account_id = ua.parent_ga_id'
    );
  });

  test('flags GA without UA via NOT EXISTS', () => {
    expect(INTEGRATED_ACCOUNTS_VIEW_SQL).toContain(
      'WHERE NOT EXISTS (\n  SELECT 1 FROM ua WHERE ua.parent_ga_id = ga.global_account_id\n)'
    );
  });
});
