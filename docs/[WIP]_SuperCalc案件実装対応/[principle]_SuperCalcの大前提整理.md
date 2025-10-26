前提整理

- CLI は targetAccountCode/refAccountCode に記載された ga_code をまず global_accounts で引き当て、その ga_code に紐づく
  user_accounts をシナリオ側で見つけられることを大前提にしています。user_accounts に未登録の ga_code があるとそのルールは SKIP され、
  calculation_rules には1件も入らない構造です（docs/[WIP]SuperCalc案件実装対応/[codex][report]\_super_calcテンプレート適用課題.md:5-41、
  scripts/cli/inject-super-calc.ts:206-305）。
- 過去ログでも、シナリオ1では gross_profit や operating_income などテンプレートが要求する GA が user_accounts に存在せず、結果として 14
  件すべてが SKIP になっていると報告されています（docs/[WIP]SuperCalc案件実装対応/[codex][report]\_super_calcテンプレート適用課題.md:11-
  35）。

今回テンプレートが要求する GA 一覧

- server/src/templates/master_rules.json では PL/BS の Super Calc として gross_profit, operating_income, ordinary_income,
  pre_tax_income, net_income, current_assets, tangible_fixed_assets, intangible_fixed_assets, non_current_assets, assets,
  current_liabilities, non_current_liabilities, liabilities, shareholders_equity, equity の 15 科目が定義されています（server/src/
  templates/master_rules.json:2-148）。
- これらすべてについて、対象（target）と参照（ref）の両方で user_accounts から対象となるレコードが引き当てられる必要があります。たと
  えば operating_income の計算では gross_profit/sga/depreciation の3つの user_accounts が揃っていないと演算式を構築できません（server/
  src/templates/master_rules.json:16-44）。

CLI が注入を行うための必須条件

- global_accounts に対象 ga_code が存在すること（通常はマスタ導入済み）。
- それぞれのシナリオで、テンプレートに登場する ga_code ごとに最低1件は user_accounts が登録されていること。target_user_account_id を解
  決できなければ calculation_rules に INSERT/UPDATE できません（scripts/cli/inject-super-calc.ts:264-360）。
- 参照側も同様に、refAccountCode すべてについて user_accounts が存在しなければ計算式が構成できずスキップになります。

検証の進め方

- まずシナリオごとの user_accounts を棚卸しし、上記15科目＋参照科目（sales, cogs, sga, depreciation, non_op_income, …）が揃っているか確
  認してください。過去ログで紹介されている SQL がそのまま使えます（docs/[WIP]SuperCalc案件実装対応/[codex][report]\_super_calcテンプレー
  ト適用課題.md:59-72）。
- 足りない ga_code があれば、① user_accounts に追加する、② テンプレート側で現存する科目に合わせて refAccountCode を変更する、③ 別レイ
  ヤーでマッピング表を持つ――いずれかの方針を決定する必要があります（docs/[WIP]SuperCalc案件実装対応/[codex][report]\_super_calcテンプ
  レート適用課題.md:45-75）。
- すべての前提が揃ったら、npm run inject:super-calc -- --scenario-id=<id> --dry-run をもう一度実行し、[SKIP] が出ないことを確認した上で
  本実行へ進みます。

要約すると、「テンプレートで呼び出している GA コードと同じコードを持つ user_accounts がシナリオ内に揃っていること」が CLI 実行の絶対条
件です。calculation_rules が空なのは、ターゲット/参照勘定が解決できず INSERT/UPDATE まで到達していないためであり、まずは user_accounts
の整備状況を確認するところから検証を始めるのが確実です。
