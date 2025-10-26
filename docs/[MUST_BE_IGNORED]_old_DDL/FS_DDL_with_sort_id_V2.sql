/****************************************************************************************
 * DDL CONTEXT DOCUMENT (V2 - with sort_num in user_accounts)
 * * ## 目的
 * このDDLは、財務モデリングアプリケーションの中核をなすデータベーススキーマを定義します。
 * 別の開発担当LLMがこのスキーマ定義を読み解き、コアロジックを実装するための技術仕様書として機能します。
 * * ## V2での変更点
 * - `user_accounts`テーブルに`sort_num`列を追加しました。これにより、ユーザー定義勘定科目の表示順序を
 *   `global_accounts`から継承しつつ、個別に制御することが可能になります。
 ****************************************************************************************/


-- projects テーブル：全ての管理階層の最上位となる「プロジェクト」を定義します。
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

-- models テーブル：「プロジェクト」に紐づく「財務モデル」を定義します。
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

-- scenarios テーブル：「財務モデル」に紐づく「シナリオ」を定義します。
-- 「楽観」「ベース」「悲観」のような複数の前提条件を管理する単位です。
CREATE TABLE public.scenarios (
	id serial4 NOT NULL,
	scenario_name varchar(255) NOT NULL, -- 例: "ベースケース", "楽観ケース"
	model_id int4 NOT NULL,
	-- 要件: あるシナリオをコピーして新しいシナリオを作る場合、元のシナリオIDを記録します。
	-- 注意: これは作成時のコピー元を示すだけで、動的な親子関係（継承）は持ちません。
	base_scenario_id int4 NULL,
	description text NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT scenarios_pkey PRIMARY KEY (id),
	CONSTRAINT scenarios_model_id_scenario_name_key UNIQUE (model_id, scenario_name),
	CONSTRAINT scenarios_base_scenario_id_fkey FOREIGN KEY (base_scenario_id) REFERENCES public.scenarios(id),
	CONSTRAINT scenarios_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.models(id)
);


-- global_accounts テーブル：システム全体で共通の勘定科目マスタ。
-- 目的: 会計原則に基づいた普遍的な勘定科目を定義し、ユーザー科目の意味付けやUI上の表示順序の基準とします。
-- 注意: このテーブルはアプリケーションの初期設定として投入され、ユーザーは直接編集しません。
CREATE TABLE public.global_accounts (
	id varchar(255) NOT NULL,
	ga_name varchar(255) NOT NULL,
	ga_code varchar(255) NOT NULL,
	sort_num int4 NOT NULL,
	indent_num int4 NOT NULL,
	fs_type varchar(50) NOT NULL,
	-- ga_type: 'super_calc'は「営業利益=売上-原価」のような固定計算式を持つ集計科目。'aggregate'は単純な子科目の合計。
	ga_type varchar(50) NOT NULL,
	is_credit bool NULL, -- 貸方科目か否か。BS科目の場合に必須。
	parent_ga_id varchar(255) NULL,
	CONSTRAINT global_accounts_pkey PRIMARY KEY (id),
	CONSTRAINT global_accounts_ga_code_key UNIQUE (ga_code)
);


-- user_accounts テーブル：ユーザーが定義する勘定科目。
-- 目的: ユーザーがインポートした財務諸表の科目や、独自に作成したKPIなどを管理します。
-- 注意: 各科目は`parent_ga_id`を通じて必ずいずれかの`global_accounts`に紐付き、その性質（BS/PLなど）を継承します。
CREATE TABLE public.user_accounts (
	id serial4 NOT NULL,
	ua_name varchar(255) NOT NULL,
	sort_num int4 DEFAULT 0 NOT NULL, -- 表示順序を制御するためのID。global_accountsの値を継承しつつ、ユーザーが上書き可能。
	ua_code varchar(255) NULL, -- システム上はidで取り回すため、現在は使用しておらずNULLを許容します。
	fs_type varchar(50) NOT NULL,
	is_credit bool NULL,
	is_kpi bool DEFAULT false NOT NULL,
	parent_ga_id varchar(255) NOT NULL,
	parent_ua_id int4 NULL, -- ユーザーが科目間の親子関係を定義する場合に使用します。
	CONSTRAINT user_accounts_pkey PRIMARY KEY (id),
	CONSTRAINT user_accounts_ua_name_key UNIQUE (ua_name), -- 科目名はモデル内でユニークである必要があります。
	CONSTRAINT user_accounts_parent_ga_id_fkey FOREIGN KEY (parent_ga_id) REFERENCES public.global_accounts(id),
	CONSTRAINT user_accounts_parent_ua_id_fkey FOREIGN KEY (parent_ua_id) REFERENCES public.user_accounts(id)
);


-- periods テーブル：会計期間やイベント期間を管理します。
-- 目的: 横軸となる期間を定義し、計算や表示の順序を制御します。
-- 注意: LBOのような特殊な計算ステップは`period_type`='Event'`として表現することを想定しています。
-- `display_order`が計算と表示の順序を保証する上で極めて重要です。
CREATE TABLE public.periods (
	id serial4 NOT NULL,
	scenario_id int4 NOT NULL,
	period_label varchar(100) NOT NULL, -- UI上の表示名 (例: "2025年度", "LBOトランザクション")
	display_order int4 NOT NULL, -- 計算・表示の順序を定義するキー
	period_val date NULL, -- 通常の会計期間の場合に日付を保持
	period_type varchar(50) NOT NULL, -- 'Yearly', 'Monthly', 'Event'
	af_type varchar(50) NOT NULL, -- 'Actual' (実績), 'Forecast' (予測)
	CONSTRAINT periods_pkey PRIMARY KEY (id),
	CONSTRAINT periods_scenario_id_display_order_key UNIQUE (scenario_id, display_order),
	CONSTRAINT periods_scenario_id_period_label_key UNIQUE (scenario_id, period_label),
	CONSTRAINT periods_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);


-- scenario_parameters テーブル：UI上の「シナリオシート」でユーザーが入力したパラメータを保持します。
-- 目的: シナリオごとの変動パラメータ（例: 売上成長率=5%）を一時的に保存するためのテーブル。
-- 注意: ここに保存された値は、アプリケーション層のロジックによって`calculation_rules`のJSONBに同期されます。
-- 計算エンジンは、このテーブルを直接参照しません。
CREATE TABLE public.scenario_parameters (
	id serial4 NOT NULL,
	scenario_id int4 NOT NULL,
	parameter_key varchar(255) NOT NULL, -- パラメータのキー (例: "revenue_growth_rate")
	parameter_value text NOT NULL, -- パラメータの値 (例: "0.05")
	display_name varchar(255) NULL,
	CONSTRAINT scenario_parameters_pkey PRIMARY KEY (id),
	CONSTRAINT scenario_parameters_scenario_id_parameter_key_key UNIQUE (scenario_id, parameter_key),
	CONSTRAINT scenario_parameters_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id)
);


-- calculation_rules テーブル：システムの計算ロジックの心臓部。
-- 目的: 全ての計算ロジックを一元管理する唯一の信頼できる情報源(Single Source of Truth)です。
--      「1科目、1期間、1ルール」の原則をDB制約で保証します。
CREATE TABLE public.calculation_rules (
	id serial4 NOT NULL,
	-- 【紐付け】このルールがどの勘定科目の値を計算するためのものかを示します。
	target_user_account_id int4 NOT NULL,
	-- 【次元】このルールがどのシナリオに属するかを示します。
	scenario_id int4 NOT NULL,
	-- 【次元・例外処理】このルールが特定の期間にのみ適用されるかを示します。
	-- NULLの場合は全期間の「基本ルール」、特定IDの場合はその期間の「オーバーライドルール」となります。
	-- これにより、決算修正などの期間例外を実現します。
	period_id int4 NULL,
	-- 'PARAMETER' (PL科目等の計算) または 'BALANCE_AND_CHANGE' (BS科目の残高計算)
	rule_type varchar(50) NOT NULL,
	-- 【核心部】計算ロジックの詳細な定義を格納します。スキーマはドキュメントで別途定義されています。
	-- 注意: 内部の勘定科目参照は`user_accounts.id`で行い、検証性のために`ua_name`も冗長的に保持します。
	rule_definition jsonb NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT calculation_rules_pkey PRIMARY KEY (id),
	CONSTRAINT calculation_rules_rule_type_check CHECK (((rule_type)::text = ANY ((ARRAY['PARAMETER'::character varying, 'BALANCE_AND_CHANGE'::character varying])::text[]))),
	-- 【最重要制約】「シナリオ、勘定科目、期間」の組み合わせでルールが一意であることを保証します。
	CONSTRAINT calculation_rules_scenario_id_target_user_account_id_period_key UNIQUE (scenario_id, target_user_account_id, period_id),
	CONSTRAINT calculation_rules_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.periods(id),
	CONSTRAINT calculation_rules_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id),
	CONSTRAINT calculation_rules_target_user_account_id_fkey FOREIGN KEY (target_user_account_id) REFERENCES public.user_accounts(id)
);