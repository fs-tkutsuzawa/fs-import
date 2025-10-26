- Global＿accounts（システムInitialize時にマスター注入済、全レコードがマスター由来）をよく読んで、Super＿calcはきちんと存在しており、ga_codeも定まっている
- master_relesでは、上記、Global_Accountsで定義されている、すべてのSuper＿calcに対して、targetAccountCodeが定義されている
- master_relesでは、当該のtargetAccountCodeに対して、refAccountCodeが定義されており、これもまた参照先のglobal_accountsのga_codeである
- 最後に、User_accountsとして、定義されている各レコードは、先述のSuper＿calcのいずれかに紐づけられていないといけない

したがって、

- gloabal_accountsがMECEに定まっている
- 紐づいて、すべてのSuper_calcに対して、master_rules.jsonが定義されている
- User＿accountsでは、

```
問題ないかなの問いに対して：

了解です。今回のログを見る限り、テンプレートで想定していた GA コードの多くがまだ user_accounts に存在しないため SKIP になっていますが、CLI の仕組み自
  体は正しく動作しています。今後は以下のいずれかで調整していけば、完全に理想の状態に近づけます。

  1. 必要な GA コードのユーザー勘定を追加
      - gross_profit, operating_income, personnel_costs, advertising_expenses など、テンプレートで使用している GA コードを user_accounts に追加すれば、
        再実行時に SKIP が解消されます。
  2. テンプレートを現状の勘定構成に合わせる
      - 既に登録済みの GA コード（例えば sga 配下の「テスト材料費」「テスト労務費」など）に合わせて master_rules.json を編集すれば、SKIP せずにルールを
        投入できます。

  現在の SKIP は「紐付け対象が見つからないため安全にスキップした」という状態なので、この後の整備さえ進めば CLI からの注入も問題なく機能するはずです。も
  し次に進めるためのサポート（勘定追加の SQL 例、テンプレート調整方針など）が必要であれば、いつでも声をかけてください。

```

## サマリーレポート（WA）

- 目的
  Super Calc テンプレート（master_rules.json）を CLI で注入できるよう整備したが、user_accounts に対応 GA コードが不足しているためスキップが多発した。
  原因と対処方針を整理。
- 現状
  - CLI (yarn inject:super-calc) は正常動作。ただし ga_code の不一致により「target/reference account not found」が14件発生。
  - user_accounts には sga、trade_receivables など一部 GA のみ存在し、gross_profit、operating_income 等が未登録。
  - show:rules では calculation_rules にレコード無し。
  - テンプレートの targetAccountCode/refAccountCode と user_accounts.parent_ga_id が完全一致し、CLI 実行時に [SKIP] が発生しない。

## テンプレート生成プロンプト（LLM 用）

You are given the current global account master as CSV:

"id","ga_name","ga_code","sort_num","indent_num","fs_type","ga_type","is_credit","parent_ga_id"
sga,販売費及び一般管理費,sga,6,0,PL,super_calc,,
operating_income,営業利益,operating_income,7,0,PL,super_calc,,
non_operating_income,営業外収益,non_operating_income,8,0,PL,super_calc,,
non_operating_expenses,営業外費用,non_operating_expenses,9,0,PL,super_calc,,
ordinary_income,経常利益,ordinary_income,10,0,PL,super_calc,,
extraordinary_income,特別利益,extraordinary_income,11,0,PL,super_calc,,
extraordinary_loss,特別損失,extraordinary_loss,12,0,PL,super_calc,,
pre_tax_income,税引前当期純利益,pre_tax_income,13,0,PL,super_calc,,
tangible_fixed_assets,有形固定資産,tangible_fixed_assets,7,1,BS,super_calc,false,
intangible_fixed_assets,無形固定資産,intangible_fixed_assets,8,1,BS,super_calc,false,
investments,投資その他の資産,investments,9,1,BS,super_calc,false,
non_current_assets,固定資産,non_current_assets,10,1,BS,super_calc,false,
assets,資産,assets,11,0,BS,super_calc,false,
non_current_liabilities,固定負債,non_current_liabilities,17,1,BS,super_calc,true,
liabilities,負債,liabilities,18,0,BS,super_calc,true,
shareholders_equity,株主資本,shareholders_equity,21,1,BS,super_calc,true,
equity,純資産,equity,22,0,BS,super_calc,true,
cfi,投資活動によるキャッシュ・フロー,cash_flow_from_investing_activities,13,0,CF,super_calc,,
cff,財務活動によるキャッシュ・フロー,cash_flow_from_financing_activities,19,0,CF,super_calc,,
cash_and_equivalents_beginning,現金及び現金同等物の期首残高,cash_and_cash_equivalents_beginning_of_period,20,0,CF,super_calc,,
cash_and_equivalents_end,現金及び現金同等物の期末残高,cash_and_cash_equivalents_end_of_period,21,0,CF,super_calc,,
cfo,営業活動によるキャッシュ・フロー,cash_flow_from_operating_activities,8,0,CF,super_calc,,
net_income,当期純利益,net_income,15,0,PL,super_calc,,

Generate `master_rules.json` for the CLI injector. For each row where ga_type == "super_calc", output an object:

{
"targetAccountCode": "<ga_code>",
"rule_type": "PARAMETER",
"description": "<日本語の注釈>",
"calculation": [
{ "refAccountCode": "<child-ga_code>", "operator": "+" | "-" | "*" | "/" },
...
]
}

Rules:

1. Use ga_code (lowercase) for targetAccountCode/refAccountCode.
2. Derive references by looking at expected child aggregates. If no children, skip or set calculation to [] (will be skipped) but flag in
   description.
3. Keep expressions simple (加算減算が中心) and conform to existing accounting logic (e.g., 営業利益 = 売上総利益 - 販売費及び一般管理費).
4. Provide JSON array, pretty formatted, ready to be saved as server/src/templates/master_rules.json.

———
