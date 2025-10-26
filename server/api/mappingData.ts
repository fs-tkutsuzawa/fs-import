import pool from './db.ts';
import { logger } from '../src/logger.ts';

// Save GA-UA mapping data (bulk create user accounts with mapping info)
export const saveMappingData = async (modelId, mappingPayload) => {
  logger.log('=== saveMappingData called ===');
  logger.log('Model ID:', modelId);
  logger.log('Mapping payload:', JSON.stringify(mappingPayload, null, 2));

  if (
    !modelId ||
    !mappingPayload ||
    !mappingPayload.accounts ||
    !Array.isArray(mappingPayload.accounts)
  ) {
    throw new Error('modelId and accounts array are required');
  }

  const { accounts, metadata } = mappingPayload;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if model exists
    const modelCheckQuery = 'SELECT id FROM models WHERE id = $1';
    const modelResult = await client.query(modelCheckQuery, [modelId]);

    if (modelResult.rows.length === 0) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    // Delete existing user accounts for this model (if we want to associate accounts with models)
    // For now, we'll clear all user accounts as per original implementation
    await client.query('DELETE FROM user_accounts');
    logger.log('Cleared existing user accounts');

    const insertedAccounts = [];

    for (const account of accounts) {
      const {
        ua_name,
        ua_code,
        fs_type,
        is_credit,
        is_kpi,
        parent_ga_id,
        parent_ua_id,
        mapping_type, // Additional field to store mapping type (mapTo, childOf)
        original_import_id, // Reference to original imported item
      } = account;

      // Validate required fields
      if (!ua_name || !fs_type || !parent_ga_id) {
        throw new Error(
          `Missing required fields for account: ${JSON.stringify(account)}`
        );
      }

      // Validate fs_type
      const validFsTypes = ['BS', 'PL', 'CF', 'PPE'];
      if (!validFsTypes.includes(fs_type)) {
        throw new Error(`Invalid fs_type: ${fs_type}`);
      }

      // Verify parent_ga_id exists in global_accounts and get ga_type
      const gaCheckQuery =
        'SELECT id, ga_type FROM global_accounts WHERE id = $1';
      const gaResult = await client.query(gaCheckQuery, [parent_ga_id]);

      if (gaResult.rows.length === 0) {
        logger.log(
          `Warning: Global account ${parent_ga_id} not found, skipping account ${ua_name}`
        );
        continue;
      }

      const parent_ga_type = gaResult.rows[0].ga_type;

      // Insert the account
      const query = `
        INSERT INTO user_accounts (
          ua_name, ua_code, fs_type, is_credit, is_kpi,
          parent_ga_id, parent_ua_id, parent_ga_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        ua_name,
        ua_code || null,
        fs_type,
        is_credit || null,
        is_kpi || false,
        parent_ga_id,
        parent_ua_id || null,
        parent_ga_type,
      ];

      logger.log(`Inserting account: ${ua_name}`, values);
      const result = await client.query(query, values);
      insertedAccounts.push(result.rows[0]);
      logger.log(`Inserted account ID: ${result.rows[0].id}`);
    }

    // If metadata is provided, we could save it separately
    // For now, just include it in the response

    await client.query('COMMIT');
    logger.log(`Successfully saved ${insertedAccounts.length} mapped accounts`);

    return {
      success: true,
      message: `Successfully saved mapping data for model ${modelId}`,
      accountsCreated: insertedAccounts.length,
      accounts: insertedAccounts,
      metadata: metadata || null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error saving mapping data:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Get mapping data for a model (retrieve user accounts that were created from mapping)
export const getMappingData = async (modelId) => {
  logger.log('=== getMappingData called ===');
  logger.log('Model ID:', modelId);

  if (!modelId) {
    throw new Error('modelId is required');
  }

  try {
    const query = `
      SELECT 
        ua.*,
        ga.ga_name as parent_ga_name,
        ga.ga_code as parent_ga_code
      FROM user_accounts ua
      LEFT JOIN global_accounts ga ON ua.parent_ga_id = ga.id
      ORDER BY ua.fs_type, ua.parent_ga_id, ua.parent_ua_id, ua.id
    `;

    const result = await pool.query(query);

    logger.log(`Retrieved ${result.rows.length} mapped accounts`);

    return {
      success: true,
      modelId: modelId,
      accounts: result.rows,
    };
  } catch (error) {
    logger.error('Error fetching mapping data:', error);
    throw error;
  }
};

// Clear all mapping data (delete all user accounts)
export const clearAllMappingData = async () => {
  logger.log('=== clearAllMappingData called ===');

  try {
    const result = await pool.query('DELETE FROM user_accounts RETURNING *');

    logger.log(`Cleared ${result.rows.length} user accounts`);

    return {
      success: true,
      message: 'All mapping data cleared successfully',
      deletedAccounts: result.rows.length,
    };
  } catch (error) {
    logger.error('Error clearing all mapping data:', error);
    throw error;
  }
};

// Update a single mapped user account (wrapper for user_accounts update)
export const updateMappingData = async (accountId, updateData) => {
  logger.log('=== updateMappingData called ===');
  logger.log(`Account ID: ${accountId}`, updateData);

  if (!accountId) {
    throw new Error('accountId is required');
  }

  try {
    const {
      ua_name,
      ua_code,
      fs_type,
      is_credit,
      is_kpi,
      parent_ga_id,
      parent_ua_id,
    } = updateData || {};

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
      accountId,
    ];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Mapping data (user account) not found');
    }

    logger.log(`Updated mapping account ID: ${result.rows[0].id}`);

    return {
      success: true,
      account: result.rows[0],
    };
  } catch (error) {
    logger.error('Error updating mapping data:', error);
    throw error;
  }
};

// Delete a single mapped user account (wrapper for user_accounts delete)
export const deleteMappingData = async (accountId) => {
  logger.log('=== deleteMappingData called ===');
  logger.log(`Account ID: ${accountId}`);

  if (!accountId) {
    throw new Error('accountId is required');
  }

  try {
    const query = 'DELETE FROM user_accounts WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [accountId]);

    if (result.rows.length === 0) {
      throw new Error('Mapping data (user account) not found');
    }

    logger.log(`Deleted mapping account ID: ${result.rows[0].id}`);

    return {
      success: true,
      message: 'Mapping data deleted successfully',
      account: result.rows[0],
    };
  } catch (error) {
    logger.error('Error deleting mapping data:', error);
    throw error;
  }
};
