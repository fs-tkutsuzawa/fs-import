import pool from './db.ts';

// Helper function to convert UA ID format
const convertUaId = (id: string): number | null => {
  if (!id) return null;

  // Handle ua- prefix
  const match = id.match(/^ua-(\d+)$/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    return isNaN(parsed) ? null : parsed;
  }

  // Try parsing as number directly
  const parsed = parseInt(id, 10);
  return isNaN(parsed) ? null : parsed;
};

// Helper function to convert percentage to decimal
const percentToDecimal = (value: number): number => {
  return value / 100;
};

// Resolve various UI id formats to numeric user_accounts.id
const resolveUserAccountId = async (
  client: any,
  id: string | number | null | undefined
): Promise<number | null> => {
  if (id === null || id === undefined) return null;
  if (typeof id === 'number') return isNaN(id) ? null : id;
  const str = String(id).trim();
  if (!str) return null;

  // Check for invalid patterns like "ua-null", "ua-undefined"
  if (
    str === 'ua-null' ||
    str === 'ua-undefined' ||
    str === 'null' ||
    str === 'undefined'
  ) {
    return null;
  }

  // If compound string, try each token (split by common separators)
  const tokens = str.split(/[^A-Za-z0-9_-]+/).filter(Boolean);
  if (tokens.length > 1) {
    for (const t of tokens) {
      // eslint-disable-next-line no-await-in-loop
      const n = await resolveUserAccountId(client, t);
      if (n) return n;
    }
  }

  // ua-<digits>
  const mNum = str.match(/^ua-(\d+)$/);
  if (mNum) {
    const n = parseInt(mNum[1], 10);
    return isNaN(n) ? null : n;
  }
  // plain digits
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    return isNaN(n) ? null : n;
  }
  // ua-<code> (fallback to ua_code)
  const mCode = str.match(/^ua-(.+)$/);
  if (mCode) {
    const code = mCode[1];
    // Skip if code is "null" or "undefined"
    if (code === 'null' || code === 'undefined') return null;

    // try by ua_code
    let res = await client.query(
      'SELECT id FROM user_accounts WHERE ua_code = $1 LIMIT 1',
      [code]
    );
    if (res.rows.length) return res.rows[0].id;
    // fallback by ua_name
    res = await client.query(
      'SELECT id FROM user_accounts WHERE ua_name = $1 LIMIT 1',
      [code]
    );
    return res.rows.length ? res.rows[0].id : null;
  }
  // try plain ua_code
  let res = await client.query(
    'SELECT id FROM user_accounts WHERE ua_code = $1 LIMIT 1',
    [str]
  );
  if (res.rows.length) return res.rows[0].id;
  // fallback by ua_name
  res = await client.query(
    'SELECT id FROM user_accounts WHERE ua_name = $1 LIMIT 1',
    [str]
  );
  return res.rows.length ? res.rows[0].id : null;
};

// Resolve account ID that could be either GA (string) or UA (number)
// Returns an object with type ('ga' or 'ua') and the resolved ID
const resolveAccountReference = async (
  client: any,
  id: string | number | null | undefined
): Promise<{ type: 'ga' | 'ua'; id: string | number; name: string } | null> => {
  if (id === null || id === undefined) return null;

  const str = String(id).trim();
  if (!str) return null;

  // Check if it's a GA ID (doesn't start with ua- and not a plain number)
  // GA IDs are like 'sales', 'cogs', 'operating_income', etc.
  if (!/^ua-/.test(str) && !/^\d+$/.test(str)) {
    // Try to find it in global_accounts
    const gaResult = await client.query(
      'SELECT id, ga_name FROM global_accounts WHERE id = $1',
      [str]
    );
    if (gaResult.rows.length > 0) {
      return {
        type: 'ga',
        id: gaResult.rows[0].id,
        name: gaResult.rows[0].ga_name,
      };
    }
  }

  // Otherwise try to resolve as UA
  const uaId = await resolveUserAccountId(client, id);
  if (uaId) {
    const uaResult = await client.query(
      'SELECT ua_name FROM user_accounts WHERE id = $1',
      [uaId]
    );
    if (uaResult.rows.length > 0) {
      return {
        type: 'ua',
        id: uaId,
        name: uaResult.rows[0].ua_name,
      };
    }
  }

  return null;
};

// Helper function to get single account name using existing client
const getAccountName = async (
  client: any,
  accountId: number | null
): Promise<string> => {
  if (!accountId || isNaN(accountId)) return '';
  const result = await client.query(
    'SELECT ua_name FROM user_accounts WHERE id = $1',
    [accountId]
  );
  return result.rows.length > 0 ? result.rows[0].ua_name : '';
};

// Helper to get multiple account names at once
const getAccountNamesMap = async (
  client: any,
  accountIds: number[]
): Promise<Map<number, string>> => {
  const ids = Array.from(new Set(accountIds.filter((id) => !!id)));
  if (ids.length === 0) return new Map();
  const result = await client.query(
    'SELECT id, ua_name FROM user_accounts WHERE id = ANY($1)',
    [ids]
  );
  const map = new Map<number, string>();
  for (const row of result.rows) {
    map.set(row.id, row.ua_name);
  }
  return map;
};

// Validate required properties for each parameter type
const validateParameterConfig = (type: string, config: any) => {
  switch (type) {
    case 'input':
      // No required properties
      break;

    case 'growth_rate':
      if (config.rate === undefined || config.rate === null) {
        throw new Error("growth_rate requires 'rate' property");
      }
      break;

    case 'ratio':
      if (config.ratio === undefined || config.ratio === null) {
        throw new Error("ratio requires 'ratio' property");
      }
      if (!config.referenceId && !config.targetAccountId) {
        throw new Error(
          "ratio requires 'referenceId' or 'targetAccountId' property"
        );
      }
      break;

    case 'link':
      if (!config.referenceId && !config.targetAccountId) {
        throw new Error(
          "link requires 'referenceId' or 'targetAccountId' property"
        );
      }
      break;

    case 'sum_children':
      // No required properties
      break;

    case 'custom_calc':
      // Formula will be generated, but we should ensure the target account exists
      break;

    default:
      throw new Error(`Unknown parameter type: ${type}`);
  }
};

// Generate JSONB for PARAMETER type rules
const generateParameterJson = async (
  client: any,
  type: string,
  config: any,
  targetAccountId: number
) => {
  // Validate before generation
  validateParameterConfig(type, config);

  switch (type) {
    case 'input':
      return { type: 'input' };

    case 'growth_rate':
      return {
        type: 'growth_rate',
        value: percentToDecimal(config.rate || 0),
      };

    case 'ratio':
      const refAccount = await resolveAccountReference(
        client,
        config.referenceId || config.targetAccountId
      );
      if (!refAccount) {
        console.error('Failed to resolve reference account ID for ratio');
        console.error('Config received:', JSON.stringify(config, null, 2));
        console.error('referenceId:', config.referenceId);
        console.error('targetAccountId:', config.targetAccountId);

        // Provide more helpful error message
        const receivedValue = config.referenceId || config.targetAccountId;
        if (
          receivedValue === 'ua-null' ||
          receivedValue === null ||
          receivedValue === undefined
        ) {
          throw new Error(
            '参照科目が選択されていません。比率計算には参照する科目を選択してください。'
          );
        }
        throw new Error(
          `参照科目ID「${receivedValue}」を解決できませんでした。科目が存在するか確認してください。`
        );
      }
      return {
        type: 'ratio',
        value: percentToDecimal(config.ratio || 0),
        ref: {
          ...(refAccount.type === 'ua'
            ? { userAccountId: refAccount.id }
            : { globalAccountId: refAccount.id }),
          accountName: refAccount.name,
          ...(config.period && { period: config.period }),
        },
      };

    case 'link':
      const linkAccount = await resolveAccountReference(
        client,
        config.referenceId || config.targetAccountId
      );
      if (!linkAccount) {
        console.error('Failed to resolve reference account ID for link');
        console.error('Config received:', JSON.stringify(config, null, 2));
        console.error('referenceId:', config.referenceId);
        console.error('targetAccountId:', config.targetAccountId);

        // Provide more helpful error message
        const receivedValue = config.referenceId || config.targetAccountId;
        if (
          receivedValue === 'ua-null' ||
          receivedValue === null ||
          receivedValue === undefined
        ) {
          throw new Error(
            '参照科目が選択されていません。リンク設定には参照する科目を選択してください。'
          );
        }
        throw new Error(
          `参照科目ID「${receivedValue}」を解決できませんでした。科目が存在するか確認してください。`
        );
      }
      return {
        type: 'link',
        ref: {
          ...(linkAccount.type === 'ua'
            ? { userAccountId: linkAccount.id }
            : { globalAccountId: linkAccount.id }),
          accountName: linkAccount.name,
          ...(config.period && { period: config.period }),
        },
      };

    case 'sum_children':
      return { type: 'sum_children' };

    case 'custom_calc':
      return generateCustomCalcJson(client, config, targetAccountId);

    default:
      throw new Error(`Unknown parameter type: ${type}`);
  }
};

// Validate that all references in expression are present in references array
const validateFormulaReferences = (
  expression: string,
  references: any[]
): void => {
  // Extract all @{id} and @ga:{id} placeholders from expression
  const referencedIds = new Set<string>();
  const matches = expression.matchAll(/@(ga:)?([A-Za-z0-9_-]+)/g);
  for (const match of matches) {
    if (match[1] === 'ga:') {
      referencedIds.add(`ga:${match[2]}`);
    } else {
      referencedIds.add(match[2]);
    }
  }

  // Check that all referenced IDs have corresponding entries in references array
  const availableIds = new Set(
    references.map((ref) => {
      if (ref.globalAccountId) return `ga:${ref.globalAccountId}`;
      return String(ref.userAccountId);
    })
  );

  for (const refId of referencedIds) {
    if (!availableIds.has(refId)) {
      throw new Error(
        `Formula expression references @${refId} but it is not in the references array`
      );
    }
  }

  // Warn if there are unused references (not critical, but could indicate an issue)
  for (const ref of references) {
    const refIdStr = ref.globalAccountId
      ? `ga:${ref.globalAccountId}`
      : String(ref.userAccountId);
    if (!referencedIds.has(refIdStr)) {
      console.warn(
        `Reference ${refIdStr} (${ref.accountName || ref.userAccountName}) is in references array but not used in expression`
      );
    }
  }
};

// Generate JSONB for custom_calc type
const generateCustomCalcJson = async (
  client: any,
  config: any,
  targetAccountId: number
) => {
  // If children are explicitly provided in config, use them
  if (config.children && Array.isArray(config.children)) {
    const references: any[] = [];
    const parts: string[] = [];

    for (const child of config.children) {
      const account = await resolveAccountReference(client, child.accountId);
      if (account) {
        const refObj: any = {
          ...(account.type === 'ua'
            ? { userAccountId: account.id }
            : { globalAccountId: account.id }),
          accountName: account.name,
          ...(child.period && { period: child.period }),
        };
        references.push(refObj);

        const operator = child.operator || '+';
        const mathOperator =
          operator === '×' ? '*' : operator === '÷' ? '/' : operator;
        const idStr =
          account.type === 'ga' ? `ga:${account.id}` : `${account.id}`;
        if (parts.length === 0) {
          parts.push(`@${idStr}`);
        } else {
          parts.push(`${mathOperator} @${idStr}`);
        }
      }
    }

    const expression = parts.join(' ');

    // Validate references
    validateFormulaReferences(expression, references);

    return {
      type: 'custom_calc',
      formula: {
        expression,
        references,
      },
    };
  }

  // Otherwise get child accounts from database
  const childrenResult = await client.query(
    'SELECT id, ua_name FROM user_accounts WHERE parent_ua_id = $1 ORDER BY id',
    [targetAccountId]
  );

  const children = childrenResult.rows;
  if (children.length === 0) {
    throw new Error(
      'custom_calc requires child accounts or explicit children in config'
    );
  }

  const operators = config.operators || [];
  const references: any[] = [];
  let expression = '';

  children.forEach((child: any, index: number) => {
    references.push({
      userAccountId: child.id,
      userAccountName: child.ua_name,
    });

    if (index === 0) {
      expression = `@${child.id}`;
    } else {
      const operator = operators[index - 1] || '+';
      const mathOperator =
        operator === '×' ? '*' : operator === '÷' ? '/' : operator;
      expression += ` ${mathOperator} @${child.id}`;
    }
  });

  // Validate references
  validateFormulaReferences(expression, references);

  return {
    type: 'custom_calc',
    formula: {
      expression,
      references,
    },
  };
};

// Generate JSONB for BALANCE_AND_CHANGE type rules
const generateBalanceAndChangeJson = async (client: any, config: any) => {
  const flows = config.flows || [];
  const instructions = [];

  for (const flow of flows) {
    const instruction: any = {};

    // Resolve driver (flow account) - can be GA or UA
    if (flow.value !== undefined && flow.value !== null) {
      instruction.value = flow.value;
    } else {
      const driverAccount = await resolveAccountReference(
        client,
        flow.accountId || flow.flowAccountId
      );
      if (driverAccount) {
        instruction.driver = {
          ...(driverAccount.type === 'ua'
            ? { userAccountId: driverAccount.id }
            : { globalAccountId: driverAccount.id }),
          accountName: driverAccount.name,
          ...(flow.period && { period: flow.period }),
        };
      }
    }

    // Counter is always required and should be UA (BS account)
    const counterAccount = await resolveAccountReference(
      client,
      flow.counterAccountId
    );
    if (counterAccount) {
      instruction.counter = {
        ...(counterAccount.type === 'ua'
          ? { userAccountId: counterAccount.id }
          : { globalAccountId: counterAccount.id }),
        accountName: counterAccount.name,
      };
    }

    // Effect: convert sign to INCREASE/DECREASE
    const sign = flow.operator || flow.sign || '+';
    instruction.effect =
      sign === '+' || sign === 'INCREASE' ? 'INCREASE' : 'DECREASE';

    instructions.push(instruction);
  }

  return { instructions };
};

// Helper to generate the complete rule definition JSON
const createRuleDefinition = async (
  client: any,
  type: string,
  config: any,
  targetAccountId: number
) => {
  if (type === 'prev_end_plus_change') {
    return generateBalanceAndChangeJson(client, config);
  }
  // PARAMETER types (including custom_calc)
  return generateParameterJson(client, type, config, targetAccountId);
};

// GET: Read calculation rules
export async function getCalculationRules(query: {
  targetAccountId?: string;
  scenarioId?: string;
  periodId?: string;
}) {
  const { targetAccountId, scenarioId, periodId } = query;

  const client = await pool.connect();
  try {
    let sqlQuery = 'SELECT * FROM calculation_rules WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (targetAccountId) {
      paramCount++;
      sqlQuery += ` AND target_user_account_id = $${paramCount}`;
      params.push(convertUaId(targetAccountId));
    }

    if (scenarioId) {
      paramCount++;
      sqlQuery += ` AND scenario_id = $${paramCount}`;
      params.push(parseInt(scenarioId, 10));
    }

    if (periodId) {
      paramCount++;
      sqlQuery += ` AND period_id = $${paramCount}`;
      params.push(parseInt(periodId, 10));
    }

    const result = await client.query(sqlQuery, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// POST: Create or update calculation rule
export async function saveCalculationRule(body: {
  targetAccountId: string;
  scenarioId: string;
  periodId?: string;
  type: string;
  config: any;
}) {
  const { targetAccountId, scenarioId, periodId, type, config } = body;

  if (!targetAccountId || !scenarioId || !type) {
    throw new Error('Missing required fields');
  }

  const client = await pool.connect();
  try {
    const targetId = await resolveUserAccountId(client, targetAccountId);
    const scnId = parseInt(scenarioId, 10);
    const prdId = periodId ? parseInt(periodId, 10) : null;

    const ruleType =
      type === 'prev_end_plus_change' ? 'BALANCE_AND_CHANGE' : 'PARAMETER';
    if (!targetId) {
      throw new Error(
        'Invalid targetAccountId: could not resolve user account id'
      );
    }
    const ruleDefinition = await createRuleDefinition(
      client,
      type,
      config,
      targetId
    );

    // Check if rule already exists
    const existingCheck = await client.query(
      `SELECT id FROM calculation_rules 
       WHERE scenario_id = $1 
       AND target_user_account_id = $2 
       AND (period_id = $3 OR (period_id IS NULL AND $3 IS NULL))`,
      [scnId, targetId, prdId]
    );

    let result: any;
    if (existingCheck.rows.length > 0) {
      // Update existing rule
      result = await client.query(
        `UPDATE calculation_rules 
         SET rule_type = $1, rule_definition = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [ruleType, ruleDefinition, existingCheck.rows[0].id]
      );
    } else {
      // Insert new rule
      result = await client.query(
        `INSERT INTO calculation_rules 
         (target_user_account_id, scenario_id, period_id, rule_type, rule_definition)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [targetId, scnId, prdId, ruleType, ruleDefinition]
      );
    }

    return result.rows[0];
  } finally {
    client.release();
  }
}

// PUT: Update existing calculation rule
export async function updateCalculationRule(body: {
  id: string;
  type: string;
  config: any;
}) {
  const { id, type, config } = body;

  if (!id || !type) {
    throw new Error('Missing required fields');
  }

  const client = await pool.connect();
  try {
    // Get existing rule to know the target account ID
    const existing = await client.query(
      'SELECT target_user_account_id FROM calculation_rules WHERE id = $1',
      [parseInt(id, 10)]
    );

    if (existing.rows.length === 0) {
      throw new Error('Rule not found');
    }

    const targetId = existing.rows[0].target_user_account_id;
    const ruleType =
      type === 'prev_end_plus_change' ? 'BALANCE_AND_CHANGE' : 'PARAMETER';
    const ruleDefinition = await createRuleDefinition(
      client,
      type,
      config,
      targetId
    );

    const result = await client.query(
      `UPDATE calculation_rules 
       SET rule_type = $1, rule_definition = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [ruleType, ruleDefinition, parseInt(id, 10)]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

// DELETE: Remove calculation rule
export async function deleteCalculationRule(id: string) {
  if (!id) {
    throw new Error('Missing rule ID');
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM calculation_rules WHERE id = $1 RETURNING *',
      [parseInt(id, 10)]
    );

    if (result.rows.length === 0) {
      throw new Error('Rule not found');
    }

    return { success: true, deleted: result.rows[0] };
  } finally {
    client.release();
  }
}
