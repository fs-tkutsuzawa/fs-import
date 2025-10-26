-- public.companies definition

-- Drop table

-- DROP TABLE public.companies;

CREATE TABLE public.companies (
	id int4 DEFAULT nextval('companies_company_id_seq'::regclass) NOT NULL,
	company_name varchar(255) NOT NULL,
	plan_type public."company_plan_type" DEFAULT 'Standard'::company_plan_type NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT companies_pkey PRIMARY KEY (id)
);

-- Table Triggers

create trigger trg_companies_updated_at before
update
    on
    public.companies for each row execute function trigger_set_updated_at();


-- public.global_accounts definition

-- Drop table

-- DROP TABLE public.global_accounts;

CREATE TABLE public.global_accounts (
	id varchar(255) NOT NULL,
	ga_name varchar(255) NOT NULL,
	ga_code varchar(255) NOT NULL,
	sort_num int4 NOT NULL,
	indent_num int4 NOT NULL,
	fs_type varchar(50) NOT NULL,
	ga_type varchar(50) NOT NULL,
	is_credit bool NULL,
	parent_ga_id varchar(255) NULL,
	CONSTRAINT chk_is_credit_for_bs CHECK ((NOT (((fs_type)::text = 'BS'::text) AND (is_credit IS NULL)))),
	CONSTRAINT chk_parent_ga_id_logic CHECK (((((ga_type)::text = 'super_calc'::text) AND (parent_ga_id IS NULL)) OR (((ga_type)::text = 'aggregate'::text) AND (parent_ga_id IS NOT NULL)))),
	CONSTRAINT global_accounts_fs_type_check CHECK (((fs_type)::text = ANY ((ARRAY['BS'::character varying, 'PL'::character varying, 'CF'::character varying, 'PPE'::character varying])::text[]))),
	CONSTRAINT global_accounts_ga_code_key UNIQUE (ga_code),
	CONSTRAINT global_accounts_ga_type_check CHECK (((ga_type)::text = ANY ((ARRAY['super_calc'::character varying, 'aggregate'::character varying])::text[]))),
	CONSTRAINT global_accounts_pkey PRIMARY KEY (id)
);


-- public.user_accounts definition

-- Drop table

-- DROP TABLE public.user_accounts;

CREATE TABLE public.user_accounts (
	id serial4 NOT NULL,
	ua_name varchar(255) NOT NULL,
	ua_code varchar(255) NULL,
	fs_type varchar(50) NOT NULL,
	is_credit bool NULL,
	is_kpi bool DEFAULT false NOT NULL,
	parent_ga_id varchar(255) NOT NULL,
	parent_ua_id int4 NULL,
	parent_ga_type varchar(50) NOT NULL,
	CONSTRAINT user_accounts_fs_type_check CHECK (((fs_type)::text = ANY ((ARRAY['BS'::character varying, 'PL'::character varying, 'CF'::character varying, 'PPE'::character varying])::text[]))),
	CONSTRAINT user_accounts_pkey PRIMARY KEY (id),
	CONSTRAINT user_accounts_ua_name_key UNIQUE (ua_name),
	CONSTRAINT user_accounts_parent_ga_id_fkey FOREIGN KEY (parent_ga_id) REFERENCES public.global_accounts(id),
	CONSTRAINT user_accounts_parent_ua_id_fkey FOREIGN KEY (parent_ua_id) REFERENCES public.user_accounts(id)
);


-- public.users definition

-- Drop table

-- DROP TABLE public.users;

CREATE TABLE public.users (
	id int4 DEFAULT nextval('users_user_id_seq'::regclass) NOT NULL,
	company_id int4 NOT NULL,
	user_name varchar(255) NOT NULL,
	email varchar(255) NOT NULL,
	hashed_password varchar(255) NOT NULL,
	division varchar(100) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT users_email_key UNIQUE (email),
	CONSTRAINT users_pkey PRIMARY KEY (id),
	CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

-- Table Triggers

create trigger trg_users_updated_at before
update
    on
    public.users for each row execute function trigger_set_updated_at();


-- public.projects definition

-- Drop table

-- DROP TABLE public.projects;

CREATE TABLE public.projects (
	id int4 DEFAULT nextval('projects_project_id_seq'::regclass) NOT NULL,
	project_name varchar(255) NOT NULL,
	company_id int4 NOT NULL,
	status public."project_status_type" DEFAULT 'Active'::project_status_type NOT NULL,
	created_by_user_id int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT projects_pkey PRIMARY KEY (id),
	CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
	CONSTRAINT projects_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id)
);

-- Table Triggers

create trigger trg_projects_updated_at before
update
    on
    public.projects for each row execute function trigger_set_updated_at();


-- public.models definition

-- Drop table

-- DROP TABLE public.models;

CREATE TABLE public.models (
	id int4 DEFAULT nextval('models_model_id_seq'::regclass) NOT NULL,
	model_name varchar(255) NOT NULL,
	project_id int4 NOT NULL,
	model_type public."model_type_enum" DEFAULT 'M&A'::model_type_enum NOT NULL,
	created_by_user_id int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT models_pkey PRIMARY KEY (id),
	CONSTRAINT models_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id),
	CONSTRAINT models_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
);

-- Table Triggers

create trigger trg_models_updated_at before
update
    on
    public.models for each row execute function trigger_set_updated_at();


-- public.project_members definition

-- Drop table

-- DROP TABLE public.project_members;

CREATE TABLE public.project_members (
	project_id int4 NOT NULL,
	user_id int4 NOT NULL,
	"role" public."project_member_role" DEFAULT 'Editor'::project_member_role NOT NULL,
	CONSTRAINT project_members_pkey PRIMARY KEY (project_id, user_id),
	CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
	CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);


-- public.scenarios definition

-- Drop table

-- DROP TABLE public.scenarios;

CREATE TABLE public.scenarios (
	id serial4 NOT NULL,
	scenario_name varchar(255) NOT NULL,
	model_id int4 NOT NULL,
	base_scenario_id int4 NULL,
	description text NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT scenarios_model_id_scenario_name_key UNIQUE (model_id, scenario_name),
	CONSTRAINT scenarios_pkey PRIMARY KEY (id),
	CONSTRAINT scenarios_base_scenario_id_fkey FOREIGN KEY (base_scenario_id) REFERENCES public.scenarios(id),
	CONSTRAINT scenarios_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.models(id)
);


-- public.import_df definition

-- Drop table

-- DROP TABLE public.import_df;

CREATE TABLE public.import_df (
	id serial4 NOT NULL,
	model_id int4 NOT NULL,
	df_json jsonb NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT import_df_pkey PRIMARY KEY (id),
	CONSTRAINT fk_model FOREIGN KEY (model_id) REFERENCES public.models(id) ON DELETE CASCADE
);

-- Table Triggers

create trigger trg_update_import_df_updated_at before
update
    on
    public.import_df for each row execute function update_import_df_updated_at();


-- public.periods definition

-- Drop table

-- DROP TABLE public.periods;

CREATE TABLE public.periods (
	id serial4 NOT NULL,
	scenario_id int4 NOT NULL,
	period_label varchar(100) NOT NULL,
	display_order int4 NOT NULL,
	period_val date NULL,
	period_type varchar(50) NOT NULL,
	af_type varchar(50) NOT NULL,
	CONSTRAINT periods_af_type_check CHECK (((af_type)::text = ANY ((ARRAY['Actual'::character varying, 'Forecast'::character varying])::text[]))),
	CONSTRAINT periods_period_type_check CHECK (((period_type)::text = ANY ((ARRAY['Yearly'::character varying, 'Monthly'::character varying, 'Event'::character varying])::text[]))),
	CONSTRAINT periods_pkey PRIMARY KEY (id),
	CONSTRAINT periods_scenario_id_display_order_key UNIQUE (scenario_id, display_order),
	CONSTRAINT periods_scenario_id_period_label_key UNIQUE (scenario_id, period_label),
	CONSTRAINT periods_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);


-- public.scenario_parameters definition

-- Drop table

-- DROP TABLE public.scenario_parameters;

CREATE TABLE public.scenario_parameters (
	id serial4 NOT NULL,
	scenario_id int4 NOT NULL,
	parameter_key varchar(255) NOT NULL,
	parameter_value text NOT NULL,
	display_name varchar(255) NULL,
	CONSTRAINT scenario_parameters_pkey PRIMARY KEY (id),
	CONSTRAINT scenario_parameters_scenario_id_parameter_key_key UNIQUE (scenario_id, parameter_key),
	CONSTRAINT scenario_parameters_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);


-- public.calculation_rules definition

-- Drop table

-- DROP TABLE public.calculation_rules;

CREATE TABLE public.calculation_rules (
	id serial4 NOT NULL,
	target_user_account_id int4 NOT NULL,
	scenario_id int4 NOT NULL,
	period_id int4 NULL,
	rule_type varchar(50) NOT NULL,
	rule_definition jsonb NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT calculation_rules_pkey PRIMARY KEY (id),
	CONSTRAINT calculation_rules_rule_type_check CHECK (((rule_type)::text = ANY ((ARRAY['PARAMETER'::character varying, 'BALANCE_AND_CHANGE'::character varying])::text[]))),
	CONSTRAINT calculation_rules_scenario_id_target_user_account_id_period_key UNIQUE (scenario_id, target_user_account_id, period_id),
	CONSTRAINT calculation_rules_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id),
	CONSTRAINT calculation_rules_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id),
	CONSTRAINT calculation_rules_target_user_account_id_fkey FOREIGN KEY (target_user_account_id) REFERENCES public.user_accounts(id)
);

-- Table Triggers

create trigger update_calculation_rules_updated_at before
update
    on
    public.calculation_rules for each row execute function update_updated_at_column();