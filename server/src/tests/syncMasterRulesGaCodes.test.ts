import { describe, expect, it } from '@jest/globals';

import type { MasterRule } from '../utils/master-rules/sync-ga-codes.ts';
import { syncMasterRulesGaCodes } from '../utils/master-rules/sync-ga-codes.ts';

describe('syncMasterRulesGaCodes', () => {
  it('updates target and reference codes using provided mapping', () => {
    const rules: MasterRule[] = [
      {
        targetAccountCode: 'gross_profit',
        calculation: [
          { refAccountCode: 'sales', operator: '+' },
          { refAccountCode: 'cogs', operator: '-' },
        ],
      },
      {
        targetAccountCode: 'non_op_income',
        rule_definition: {
          formula: {
            references: [
              { refAccountCode: 'non_op_income' },
              { refAccountCode: 'other_income' },
            ],
          },
        },
      },
    ];

    const mapping = new Map<string, string>([
      ['gross_profit', 'gross_profit'],
      ['sales', 'sales'],
      ['cogs', 'cost_of_goods_sold'],
      ['cost_of_goods_sold', 'cost_of_goods_sold'],
      ['non_op_income', 'non_operating_income'],
      ['non_operating_income', 'non_operating_income'],
      ['other_income', 'other_income'],
    ]);

    const {
      rules: updated,
      targetUpdates,
      referenceUpdates,
    } = syncMasterRulesGaCodes(rules, mapping);

    expect(updated[0].targetAccountCode).toBe('gross_profit');
    expect(updated[0].calculation?.[1].refAccountCode).toBe(
      'cost_of_goods_sold'
    );
    expect(updated[1].targetAccountCode).toBe('non_operating_income');
    expect(
      updated[1].rule_definition?.formula?.references?.[0].refAccountCode
    ).toBe('non_operating_income');
    expect(targetUpdates).toBe(1);
    expect(referenceUpdates).toBe(2);
  });

  it('throws an error when codes are missing from the mapping', () => {
    const rules: MasterRule[] = [
      {
        targetAccountCode: 'missing_code',
        calculation: [{ refAccountCode: 'another_missing' }],
      },
    ];
    const mapping = new Map<string, string>();

    expect(() => syncMasterRulesGaCodes(rules, mapping)).toThrow(
      /missing_code/
    );
  });
});
