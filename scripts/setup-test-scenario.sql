-- Check if scenarios exist, if not create test data
-- This script creates test scenario data for development

-- First check what exists
SELECT 'Current Projects:' as info;
SELECT id, project_name, company_id FROM projects;

SELECT 'Current Models:' as info;
SELECT id, model_name, project_id FROM models;

SELECT 'Current Scenarios:' as info;
SELECT id, scenario_name, model_id FROM scenarios;

-- Create test data if needed
-- Note: Adjust company_id, user_id based on your existing data

-- Insert a test company if not exists
INSERT INTO companies (id, company_name)
VALUES (1, 'Test Company')
ON CONFLICT (id) DO NOTHING;

-- Insert a test user if not exists  
INSERT INTO users (id, user_name, email, company_id)
VALUES (1, 'Test User', 'test@example.com', 1)
ON CONFLICT (id) DO NOTHING;

-- Insert a test project if not exists
INSERT INTO projects (id, project_name, company_id, created_by_user_id)
VALUES (1, 'Test Financial Model Project', 1, 1)
ON CONFLICT (id) DO NOTHING;

-- Insert a test model if not exists
INSERT INTO models (id, model_name, project_id, created_by_user_id)
VALUES (1, 'Test Model', 1, 1)
ON CONFLICT (id) DO NOTHING;

-- Insert test scenarios if not exists
INSERT INTO scenarios (id, scenario_name, model_id, description)
VALUES 
    (1, 'Base Case', 1, 'Base case scenario for testing'),
    (2, 'Optimistic Case', 1, 'Optimistic scenario for testing'),
    (3, 'Pessimistic Case', 1, 'Pessimistic scenario for testing')
ON CONFLICT (id) DO NOTHING;

-- Verify the data was created
SELECT 'After Insert - Scenarios:' as info;
SELECT id, scenario_name, model_id FROM scenarios;