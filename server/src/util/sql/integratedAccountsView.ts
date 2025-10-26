export const INTEGRATED_ACCOUNTS_VIEW_SQL = `
CREATE OR REPLACE VIEW integrated_accounts_view AS
WITH ua AS (
  SELECT
    ua.id AS user_account_id,
    ua.ua_name,
    ua.ua_code,
    ua.fs_type AS ua_fs_type,
    ua.is_credit,
    ua.is_kpi,
    ua.parent_ga_id,
    ua.parent_ua_id
  FROM public.user_accounts ua
),
ga AS (
  SELECT
    ga.id AS global_account_id,
    ga.ga_name,
    ga.ga_code,
    ga.sort_num,
    ga.indent_num,
    ga.fs_type AS ga_fs_type,
    ga.ga_type,
    ga.is_credit AS ga_is_credit,
    ga.parent_ga_id AS ga_parent_ga_id
  FROM public.global_accounts ga
)
SELECT
  'USER_ACCOUNT'::text AS source,
  ua.user_account_id,
  ua.ua_name,
  ua.ua_code,
  ua.ua_fs_type,
  ua.is_credit,
  ua.is_kpi,
  ua.parent_ua_id,
  ga.global_account_id,
  ga.ga_name,
  ga.ga_code,
  ga.ga_type,
  ga.ga_fs_type,
  ga.ga_is_credit,
  ga.sort_num,
  ga.indent_num,
  ga.ga_parent_ga_id
FROM ua
JOIN ga ON ga.global_account_id = ua.parent_ga_id

UNION ALL

SELECT
  'GLOBAL_ONLY'::text AS source,
  NULL AS user_account_id,
  ga.ga_name AS ua_name,
  NULL AS ua_code,
  ga.ga_fs_type AS ua_fs_type,
  ga.ga_is_credit,
  FALSE AS is_kpi,
  NULL AS parent_ua_id,
  ga.global_account_id,
  ga.ga_name,
  ga.ga_code,
  ga.ga_type,
  ga.ga_fs_type,
  ga.ga_is_credit,
  ga.sort_num,
  ga.indent_num,
  ga.ga_parent_ga_id
FROM ga
WHERE NOT EXISTS (
  SELECT 1 FROM ua WHERE ua.parent_ga_id = ga.global_account_id
);
`.trim();
