import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  getFinancialAccounts,
  updateFinancialAccountName,
  getAllFsTypes,
  getGlobalAccountsByFsType,
} from '../api/financialAccounts.ts';
import {
  createUserAccounts,
  getUserAccounts,
  updateUserAccount,
  deleteUserAccount,
  upsertSingleUserAccount,
} from '../api/userAccounts.ts';
import {
  saveImportData,
  getImportData,
  getAllImportData,
  deleteImportData,
} from '../api/importData.ts';
import {
  saveMappingData,
  getMappingData,
  updateMappingData,
  deleteMappingData,
  clearAllMappingData,
} from '../api/mappingData.ts';
import {
  getCalculationRules,
  saveCalculationRule,
  updateCalculationRule,
  deleteCalculationRule,
} from '../api/calculationRules.ts';
import dotenv from 'dotenv';
import { logger } from './logger.ts';
import { sanitizeLabel } from './util/textSanitizer.ts';
import { registerCalculationRoutes } from './routes/calculation.ts';
import { registerTimelineAdminRoutes } from './routes/timelineAdmin.ts';
import { createInMemoryJobStore } from './service/calculationJobStore.ts';
import { createDefaultCalculationDataLoader } from './service/calculationDataLoaderFactory.ts';
import { createCalculationExecutor } from './service/calculationExecutor.ts';
import type { CalculationJobRequest } from './model/calculation.ts';
import { createDefaultTimelineOrchestrator } from './service/timeline/timelineOrchestrator.ts';
import { timelineRepository } from './service/timeline/timelineRepository.ts';
import { fetchImportDf } from './service/calculationRepositories.ts';

dotenv.config();

logger.log('=== Server starting ===');
logger.log('Log file location:', logger.getLogFilePath());

const app = new Hono();

const calculationJobStore = createInMemoryJobStore();

const timelineOrchestrator = createDefaultTimelineOrchestrator();
const loadCalculationInputs = createDefaultCalculationDataLoader({
  timelineOrchestrator,
});
const executeCalculation = createCalculationExecutor({
  jobStore: calculationJobStore,
  loadCalculationInputs,
});

app.use(
  '/*',
  cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Debugging middleware to log all requests
app.use('*', async (c, next) => {
  logger.log(`[${c.req.method}] ${c.req.path}`);
  await next();
});

app.get('/', (c) => {
  return c.text('Financial Model API Server');
});

registerCalculationRoutes(app, {
  jobStore: calculationJobStore,
  runJob: (jobId, request) => executeCalculation(jobId, request),
});

registerTimelineAdminRoutes(app, {
  ensureTimeline: ({ scenarioId, importDf }) =>
    timelineOrchestrator.ensureScenarioTimeline({ scenarioId, importDf }),
  fetchImportDf,
  fetchTimeline: timelineRepository.fetchByScenario,
});

app.get('/api/financial-accounts', async (c) => {
  try {
    const accounts = await getFinancialAccounts();
    const sanitized = accounts.map((a: any) => ({
      ...a,
      ga_name: sanitizeLabel(a.ga_name, a.ga_code),
    }));
    logger.log('GET /api/financial-accounts - Success', {
      count: sanitized.length,
    });
    return c.json(sanitized);
  } catch (error) {
    logger.error('Error in /api/financial-accounts:', error);
    return c.json({ error: 'Failed to fetch financial accounts' }, 500);
  }
});

app.put('/api/financial-accounts', async (c) => {
  logger.log('=== PUT /api/financial-accounts received ===');

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body:', JSON.stringify(body, null, 2));
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  const { id, newName } = body;
  logger.log('Extracted id:', id);
  logger.log('Extracted newName:', newName);

  if (!id || !newName) {
    logger.error('Missing required fields. id:', id, 'newName:', newName);
    return c.json({ error: 'id and newName are required' }, 400);
  }

  try {
    logger.log(
      `Calling updateFinancialAccountName with id: ${id}, newName: ${newName}`
    );
    const updatedAccount = await updateFinancialAccountName(id, newName);
    logger.log(
      'Update successful. Result:',
      JSON.stringify(updatedAccount, null, 2)
    );
    return c.json(updatedAccount);
  } catch (error) {
    logger.error(`=== Error updating account ${id} ===`);
    logger.error(
      'Error type:',
      error instanceof Error ? error.constructor.name : typeof error
    );
    logger.error(
      'Error message:',
      error instanceof Error ? error.message : error
    );
    logger.error('Full error:', error);
    return c.json(
      {
        error: 'Failed to update financial account',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// UAD-008: Get all fs_types
app.get('/api/fs-types', async (c) => {
  logger.log('=== GET /api/fs-types received ===');

  try {
    const fsTypes = await getAllFsTypes();
    logger.log(`Retrieved ${fsTypes.length} fs_types`);
    return c.json({ success: true, fsTypes });
  } catch (error) {
    logger.error('Error fetching fs_types:', error);
    return c.json(
      {
        error: 'Failed to fetch fs_types',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// UAD-008: Get global accounts by fs_type
app.get('/api/global-accounts/:fsType', async (c) => {
  const fsType = c.req.param('fsType');
  logger.log(`=== GET /api/global-accounts/${fsType} received ===`);

  try {
    const accounts = await getGlobalAccountsByFsType(fsType);
    const sanitized = accounts.map((a: any) => ({
      ...a,
      ga_name: sanitizeLabel(a.ga_name, a.ga_code),
    }));
    logger.log(
      `Retrieved ${accounts.length} global accounts for fs_type: ${fsType}`
    );
    return c.json({ success: true, accounts: sanitized });
  } catch (error) {
    logger.error(
      `Error fetching global accounts for fs_type ${fsType}:`,
      error
    );
    return c.json(
      {
        error: 'Failed to fetch global accounts',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// User Accounts endpoints
app.post('/api/user-accounts', async (c) => {
  logger.log('=== POST /api/user-accounts received ===');

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body:', JSON.stringify(body, null, 2));
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const result = await createUserAccounts(body.accounts);
    logger.log('User accounts created successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error creating user accounts:', error);
    return c.json(
      {
        error: 'Failed to create user accounts',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.get('/api/user-accounts', async (c) => {
  logger.log('=== GET /api/user-accounts received ===');

  try {
    const result = await getUserAccounts();
    logger.log('User accounts retrieved successfully');
    // sanitize GA display names in the payload
    const accounts = Array.isArray((result as any).accounts)
      ? (result as any).accounts.map((a: any) => ({
          ...a,
          ua_name: sanitizeLabel(a.ua_name, a.ua_code),
          parent_ga_name: sanitizeLabel(a.parent_ga_name, a.parent_ga_code),
        }))
      : [];
    return c.json({ success: true, accounts });
  } catch (error) {
    logger.error('Error fetching user accounts:', error);
    return c.json(
      {
        error: 'Failed to fetch user accounts',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// UPSERT single user account (for FinancialStatementPreview)
app.post('/api/user-accounts/upsert', async (c) => {
  logger.log('=== POST /api/user-accounts/upsert received ===');

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body:', body);
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const result = await upsertSingleUserAccount(body);
    logger.log('User account upserted successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error upserting user account:', error);
    return c.json(
      {
        error: 'Failed to upsert user account',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.put('/api/user-accounts/:id', async (c) => {
  const id = c.req.param('id');
  logger.log(`=== PUT /api/user-accounts/${id} received ===`);

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body:', JSON.stringify(body, null, 2));
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const result = await updateUserAccount(id, body);
    logger.log('User account updated successfully');
    return c.json(result);
  } catch (error) {
    logger.error(`Error updating user account ${id}:`, error);
    const statusCode =
      error instanceof Error && error.message === 'User account not found'
        ? 404
        : 500;
    return c.json(
      {
        error: 'Failed to update user account',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

app.delete('/api/user-accounts/:id', async (c) => {
  const id = c.req.param('id');
  logger.log(`=== DELETE /api/user-accounts/${id} received ===`);

  try {
    const result = await deleteUserAccount(id);
    logger.log('User account deleted successfully');
    return c.json(result);
  } catch (error) {
    logger.error(`Error deleting user account ${id}:`, error);
    const statusCode =
      error instanceof Error && error.message === 'User account not found'
        ? 404
        : 500;
    return c.json(
      {
        error: 'Failed to delete user account',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

// Import Data endpoints
app.post('/api/import-data/:modelId', async (c) => {
  const modelId = c.req.param('modelId');
  logger.log(`=== POST /api/import-data/${modelId} received ===`);

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body keys:', Object.keys(body));
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const result = await saveImportData(modelId, body);
    logger.log('Import data saved successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error saving import data:', error);
    const statusCode =
      error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return c.json(
      {
        error: 'Failed to save import data',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

app.get('/api/import-data/:modelId', async (c) => {
  const modelId = c.req.param('modelId');
  logger.log(`=== GET /api/import-data/${modelId} received ===`);

  try {
    const result = await getImportData(modelId);
    logger.log('Import data retrieved successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error fetching import data:', error);
    return c.json(
      {
        error: 'Failed to fetch import data',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.get('/api/import-data', async (c) => {
  logger.log('=== GET /api/import-data received ===');

  try {
    const result = await getAllImportData();
    logger.log('All import data retrieved successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error fetching all import data:', error);
    return c.json(
      {
        error: 'Failed to fetch import data',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.delete('/api/import-data/:importDataId', async (c) => {
  const importDataId = c.req.param('importDataId');
  logger.log(`=== DELETE /api/import-data/${importDataId} received ===`);

  try {
    const result = await deleteImportData(importDataId);
    logger.log('Import data deleted successfully');
    return c.json(result);
  } catch (error) {
    logger.error(`Error deleting import data ${importDataId}:`, error);
    const statusCode =
      error instanceof Error && error.message === 'Import data not found'
        ? 404
        : 500;
    return c.json(
      {
        error: 'Failed to delete import data',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

// Mapping Data endpoints
app.post('/api/mapping-data/:modelId', async (c) => {
  const modelId = c.req.param('modelId');
  logger.log(`=== POST /api/mapping-data/${modelId} received ===`);

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body keys:', Object.keys(body));
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const result = await saveMappingData(modelId, body);
    logger.log('Mapping data saved successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error saving mapping data:', error);
    const statusCode =
      error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return c.json(
      {
        error: 'Failed to save mapping data',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

app.get('/api/mapping-data/:modelId', async (c) => {
  const modelId = c.req.param('modelId');
  logger.log(`=== GET /api/mapping-data/${modelId} received ===`);

  try {
    const result = await getMappingData(modelId);
    logger.log('Mapping data retrieved successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error fetching mapping data:', error);
    return c.json(
      {
        error: 'Failed to fetch mapping data',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.put('/api/mapping-data/account/:accountId', async (c) => {
  const accountId = c.req.param('accountId');
  logger.log(`=== PUT /api/mapping-data/account/${accountId} received ===`);

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body:', JSON.stringify(body, null, 2));
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const result = await updateMappingData(accountId, body);
    logger.log('Mapping data updated successfully');
    return c.json(result);
  } catch (error) {
    logger.error(
      `Error updating mapping data for account ${accountId}:`,
      error
    );
    const statusCode =
      error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return c.json(
      {
        error: 'Failed to update mapping data',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

app.delete('/api/mapping-data/account/:accountId', async (c) => {
  const accountId = c.req.param('accountId');
  logger.log(`=== DELETE /api/mapping-data/account/${accountId} received ===`);

  try {
    const result = await deleteMappingData(accountId);
    logger.log('Mapping data deleted successfully');
    return c.json(result);
  } catch (error) {
    logger.error(
      `Error deleting mapping data for account ${accountId}:`,
      error
    );
    const statusCode =
      error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return c.json(
      {
        error: 'Failed to delete mapping data',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

app.delete('/api/mapping-data', async (c) => {
  logger.log('=== DELETE /api/mapping-data received ===');

  try {
    const result = await clearAllMappingData();
    logger.log('All mapping data cleared successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error clearing all mapping data:', error);
    return c.json(
      {
        error: 'Failed to clear mapping data',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Calculation Rules endpoints
app.get('/api/calculation-rules', async (c) => {
  logger.log('=== GET /api/calculation-rules received ===');

  const query = {
    targetAccountId: c.req.query('targetAccountId'),
    scenarioId: c.req.query('scenarioId'),
    periodId: c.req.query('periodId'),
  };

  try {
    const result = await getCalculationRules(query);
    logger.log('Calculation rules retrieved successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error fetching calculation rules:', error);
    return c.json(
      {
        error: 'Failed to fetch calculation rules',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.post('/api/calculation-rules', async (c) => {
  logger.log('=== POST /api/calculation-rules received ===');

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body keys:', Object.keys(body));
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const result = await saveCalculationRule(body);
    logger.log('Calculation rule saved successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error saving calculation rule:', error);
    return c.json(
      {
        error: 'Failed to save calculation rule',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

app.put('/api/calculation-rules', async (c) => {
  logger.log('=== PUT /api/calculation-rules received ===');

  let body: any;
  try {
    body = await c.req.json();
    logger.log('Request body:', body);
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError);
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  try {
    const result = await updateCalculationRule(body);
    logger.log('Calculation rule updated successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error updating calculation rule:', error);
    const statusCode =
      error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return c.json(
      {
        error: 'Failed to update calculation rule',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

app.delete('/api/calculation-rules', async (c) => {
  logger.log('=== DELETE /api/calculation-rules received ===');

  const id = c.req.query('id');
  if (!id) {
    return c.json({ error: 'Missing rule ID' }, 400);
  }

  try {
    const result = await deleteCalculationRule(id);
    logger.log('Calculation rule deleted successfully');
    return c.json(result);
  } catch (error) {
    logger.error('Error deleting calculation rule:', error);
    const statusCode =
      error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return c.json(
      {
        error: 'Failed to delete calculation rule',
        details: error instanceof Error ? error.message : String(error),
      },
      statusCode
    );
  }
});

serve(
  {
    fetch: app.fetch,
    port: 3001,
  },
  (info) => {
    logger.log(`Server is running on http://localhost:${info.port}`);
    logger.log(`Check logs at: ${logger.getLogFilePath()}`);
  }
);
