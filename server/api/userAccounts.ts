import pool from './db.ts';
import { logger } from '../src/logger.ts';

export const createUserAccounts = async (accounts) => {
  logger.log('=== createUserAccounts called ===');
  logger.log('Accounts to create:', JSON.stringify(accounts, null, 2));

  if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('Invalid request: accounts array is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Note: Do NOT delete all user accounts to avoid FK constraint violations.
    // We'll upsert accounts one by one based on ua_code.

    // Enhanced debug logging: analyze parent-child relationships
    logger.log('=== ANALYZING PARENT-CHILD RELATIONSHIPS ===');
    const accountsWithParentCode = accounts.filter(
      (acc) => acc.parent_ua_code !== null && acc.parent_ua_code !== undefined
    );
    const accountsWithoutParentCode = accounts.filter(
      (acc) => !acc.parent_ua_code
    );

    logger.log(
      `Accounts without parent UA (root accounts): ${accountsWithoutParentCode.length}`
    );
    logger.log(
      `Accounts with parent UA (child accounts): ${accountsWithParentCode.length}`
    );

    accountsWithParentCode.forEach((account) => {
      logger.log(
        `  Child account "${account.ua_name}" wants parent_ua_code: ${account.parent_ua_code}`
      );
    });

    // Sort accounts: parents first, then children
    // This ensures parent accounts are created before their children
    const sortedAccounts = [
      ...accountsWithoutParentCode,
      ...accountsWithParentCode,
    ];
    logger.log('=== INSERTION ORDER ===');
    sortedAccounts.forEach((account, index) => {
      logger.log(
        `  ${index + 1}. "${account.ua_name}" (parent_ua_code: ${
          account.parent_ua_code || 'null'
        })`
      );
    });

    const insertedAccounts = [];
    const codeToIdMapping = new Map(); // Track ua_code to ua_id mapping

    for (let i = 0; i < sortedAccounts.length; i++) {
      const account = sortedAccounts[i];
      const {
        ua_name,
        ua_code,
        fs_type,
        is_credit,
        is_kpi,
        parent_ga_id,
        parent_ua_code,
      } = account;

      logger.log(
        `=== PROCESSING ACCOUNT ${i + 1}/${sortedAccounts.length} ===`
      );
      logger.log(`Account name: ${ua_name}`);
      logger.log(`Account code: ${ua_code}`);
      logger.log(`Parent UA code: ${parent_ua_code || 'null'}`);

      // Validate required fields
      if (!ua_name || !fs_type || !parent_ga_id) {
        logger.error(
          `Missing required fields for account: ${JSON.stringify(account)}`
        );
        throw new Error(
          `Missing required fields for account: ${JSON.stringify(account)}`
        );
      }

      // Validate fs_type
      const validFsTypes = ['BS', 'PL', 'CF', 'PPE'];
      if (!validFsTypes.includes(fs_type)) {
        logger.error(`Invalid fs_type: ${fs_type}`);
        throw new Error(`Invalid fs_type: ${fs_type}`);
      }

      // Get parent_ga_type from global_accounts
      const gaResult = await client.query(
        'SELECT ga_type FROM global_accounts WHERE id = $1',
        [parent_ga_id]
      );
      if (gaResult.rows.length === 0) {
        logger.error(`Global account ${parent_ga_id} not found`);
        throw new Error(`Global account ${parent_ga_id} not found`);
      }
      const parent_ga_type = gaResult.rows[0].ga_type;

      // Resolve parent_ua_id from parent_ua_code
      let resolvedParentUaId = null;
      if (parent_ua_code) {
        // First check in our mapping (for accounts created in this batch)
        if (codeToIdMapping.has(parent_ua_code)) {
          resolvedParentUaId = codeToIdMapping.get(parent_ua_code);
          logger.log(
            `Resolved parent_ua_id from code mapping: ${parent_ua_code} -> ${resolvedParentUaId}`
          );
        } else {
          // Check if the parent exists in the database
          const existingParentResult = await client.query(
            'SELECT id FROM user_accounts WHERE ua_code = $1',
            [parent_ua_code]
          );
          if (existingParentResult.rows.length > 0) {
            resolvedParentUaId = existingParentResult.rows[0].id;
            logger.log(
              `Found parent in database: ${parent_ua_code} -> ${resolvedParentUaId}`
            );
          } else {
            logger.error(
              `Parent UA with code ${parent_ua_code} not found for account "${ua_name}"`
            );
            throw new Error(
              `Parent UA with code ${parent_ua_code} not found for account "${ua_name}"`
            );
          }
        }
      }

      // Upsert the account: update if ua_code exists, else insert
      try {
        let result;
        if (ua_code) {
          const existing = await client.query(
            'SELECT id FROM user_accounts WHERE ua_code = $1',
            [ua_code]
          );
          if (existing.rows.length > 0) {
            const updateQuery = `
              UPDATE user_accounts
              SET
                ua_name = $1,
                fs_type = $2,
                is_credit = $3,
                is_kpi = $4,
                parent_ga_id = $5,
                parent_ua_id = $6,
                parent_ga_type = $7
              WHERE ua_code = $8
              RETURNING *
            `;
            result = await client.query(updateQuery, [
              ua_name,
              fs_type,
              is_credit || null,
              is_kpi || false,
              parent_ga_id,
              resolvedParentUaId,
              parent_ga_type,
              ua_code,
            ]);
            logger.log(
              `Updated user account: ${ua_name} (ID: ${result.rows[0].id})`
            );
          } else {
            const insertQuery = `
              INSERT INTO user_accounts (
                ua_name, ua_code, fs_type, is_credit, is_kpi,
                parent_ga_id, parent_ua_id, parent_ga_type
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              RETURNING *
            `;
            result = await client.query(insertQuery, [
              ua_name,
              ua_code,
              fs_type,
              is_credit || null,
              is_kpi || false,
              parent_ga_id,
              resolvedParentUaId,
              parent_ga_type,
            ]);
            logger.log(
              `Created new user account: ${ua_name} (ID: ${result.rows[0].id})`
            );
          }
        } else {
          // No ua_code -> insert new
          const insertQuery = `
            INSERT INTO user_accounts (
              ua_name, ua_code, fs_type, is_credit, is_kpi,
              parent_ga_id, parent_ua_id, parent_ga_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `;
          result = await client.query(insertQuery, [
            ua_name,
            null,
            fs_type,
            is_credit || null,
            is_kpi || false,
            parent_ga_id,
            resolvedParentUaId,
            parent_ga_type,
          ]);
          logger.log(
            `Created new user account (no code): ${ua_name} (ID: ${result.rows[0].id})`
          );
        }

        insertedAccounts.push(result.rows[0]);

        // Update code-to-ID mapping for future references
        if (ua_code) {
          codeToIdMapping.set(ua_code, result.rows[0].id);
          logger.log(`Updated mapping: ${ua_code} -> ${result.rows[0].id}`);
        }
      } catch (upsertError) {
        logger.error(`❌ Failed to upsert account "${ua_name}":`, upsertError);
        throw upsertError;
      }
    }

    await client.query('COMMIT');
    logger.log(`=== TRANSACTION COMMITTED ===`);
    logger.log(`Successfully created ${insertedAccounts.length} user accounts`);

    // Final verification: count
    const finalResult = await client.query(
      'SELECT COUNT(*)::int as cnt FROM user_accounts'
    );
    logger.log('=== FINAL STATE VERIFICATION ===');
    logger.log('Total accounts in database:', finalResult.rows[0].cnt);

    return {
      success: true,
      message: `Successfully created ${insertedAccounts.length} user accounts`,
      accounts: insertedAccounts,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('=== TRANSACTION ROLLED BACK ===');
    logger.error('Error creating user accounts:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    });
    throw error;
  } finally {
    client.release();
  }
};

export const getUserAccounts = async () => {
  logger.log('=== getUserAccounts called ===');

  try {
    const query = `
      SELECT 
        ua.*,
        ga.id as ga_id,
        ga.ga_name as parent_ga_name,
        ga.ga_code as parent_ga_code,
        ga.ga_type
      FROM user_accounts ua
      LEFT JOIN global_accounts ga ON 
        (ua.parent_ga_id = ga.ga_code OR ua.parent_ga_id = CAST(ga.id AS VARCHAR))
      ORDER BY ua.fs_type, ua.parent_ga_id, ua.parent_ua_id, ua.id
    `;

    const result = await pool.query(query);
    logger.log(
      `Retrieved ${result.rows.length} user accounts with GA information`
    );

    return {
      success: true,
      accounts: result.rows,
    };
  } catch (error) {
    logger.error('Error fetching user accounts:', error);
    throw error;
  }
};

export const updateUserAccount = async (id, updateData) => {
  logger.log('=== updateUserAccount called ===');
  logger.log(`Account ID: ${id}`, updateData);

  try {
    const {
      ua_name,
      ua_code,
      fs_type,
      is_credit,
      is_kpi,
      parent_ga_id,
      parent_ua_id,
    } = updateData;

    const query = `
      UPDATE user_accounts
      SET
        ua_name = COALESCE($1, ua_name),
        ua_code = COALESCE($2, ua_code),
        fs_type = COALESCE($3, fs_type),
        is_credit = COALESCE($4, is_credit),
        is_kpi = COALESCE($5, is_kpi),
        parent_ga_id = COALESCE($6, parent_ga_id),
        parent_ua_id = $7
      WHERE id = $8
      RETURNING *
    `;

    const values = [
      ua_name,
      ua_code,
      fs_type,
      is_credit,
      is_kpi,
      parent_ga_id,
      parent_ua_id,
      id,
    ];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('User account not found');
    }

    logger.log(`Updated account ID: ${result.rows[0].id}`);

    return {
      success: true,
      account: result.rows[0],
    };
  } catch (error) {
    logger.error('Error updating user account:', error);
    throw error;
  }
};

// Create or update a single user account without deleting existing data
export const upsertSingleUserAccount = async (account) => {
  logger.log('=== upsertSingleUserAccount called ===');
  logger.log('Account data:', account);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let {
      ua_name,
      ua_code,
      fs_type,
      is_credit,
      is_kpi,
      parent_ga_id,
      parent_ua_id,
      parent_ua_code, // Optional: code of the parent UA to resolve
    } = account;

    // If parent_ua_code is provided, resolve parent_ua_id from it
    // This handles cases where the parent UA was just created and we have its code but not ID
    if (parent_ua_code) {
      logger.log(
        `Resolving parent_ua_id from parent_ua_code: ${parent_ua_code} (current parent_ua_id: ${parent_ua_id})`
      );
      const parentLookup = await client.query(
        'SELECT id FROM user_accounts WHERE ua_code = $1',
        [parent_ua_code]
      );
      if (parentLookup.rows.length > 0) {
        const resolvedId = parentLookup.rows[0].id;
        logger.log(
          `Resolved parent_ua_id: ${resolvedId} (was: ${parent_ua_id})`
        );
        parent_ua_id = resolvedId;
      } else {
        logger.warn(
          `Parent UA with ua_code ${parent_ua_code} not found in database`
        );
        // Keep the existing parent_ua_id if lookup fails
      }
    } else {
      logger.log(`No parent_ua_code provided. parent_ua_id: ${parent_ua_id}`);
    }

    // Get parent_ga_type from global_accounts
    const gaResult = await client.query(
      'SELECT ga_type FROM global_accounts WHERE id = $1',
      [parent_ga_id]
    );
    if (gaResult.rows.length === 0) {
      throw new Error(`Global account ${parent_ga_id} not found`);
    }
    const parent_ga_type = gaResult.rows[0].ga_type;

    // Check if account exists (by ua_code)
    const existingQuery = 'SELECT id FROM user_accounts WHERE ua_code = $1';
    const existingResult = await client.query(existingQuery, [ua_code]);

    let result;

    if (existingResult.rows.length > 0) {
      // Update existing account
      const updateQuery = `
        UPDATE user_accounts
        SET
          ua_name = $1,
          fs_type = $2,
          is_credit = $3,
          is_kpi = $4,
          parent_ga_id = $5,
          parent_ua_id = $6,
          parent_ga_type = $7
        WHERE ua_code = $8
        RETURNING *
      `;

      result = await client.query(updateQuery, [
        ua_name,
        fs_type,
        is_credit,
        is_kpi,
        parent_ga_id,
        parent_ua_id,
        parent_ga_type,
        ua_code,
      ]);

      logger.log(`Updated user account: ${ua_name} (ID: ${result.rows[0].id})`);
    } else {
      // Insert new account
      const insertQuery = `
        INSERT INTO user_accounts (
          ua_name,
          ua_code,
          fs_type,
          is_credit,
          is_kpi,
          parent_ga_id,
          parent_ua_id,
          parent_ga_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      result = await client.query(insertQuery, [
        ua_name,
        ua_code,
        fs_type,
        is_credit,
        is_kpi,
        parent_ga_id,
        parent_ua_id,
        parent_ga_type,
      ]);

      logger.log(
        `Created new user account: ${ua_name} (ID: ${result.rows[0].id})`
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      account: result.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in upsertSingleUserAccount:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const deleteUserAccount = async (id) => {
  logger.log('=== deleteUserAccount called ===');
  logger.log(`Account ID: ${id}`);

  try {
    const query = 'DELETE FROM user_accounts WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new Error('User account not found');
    }

    logger.log(`Deleted account ID: ${result.rows[0].id}`);

    return {
      success: true,
      message: 'User account deleted successfully',
      account: result.rows[0],
    };
  } catch (error) {
    logger.error('Error deleting user account:', error);
    throw error;
  }
};
