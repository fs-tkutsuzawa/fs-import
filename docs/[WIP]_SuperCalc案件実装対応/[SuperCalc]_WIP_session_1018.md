突き合わせ結果

- Super Calc テンプレートが参照する GA コードは計 40 件（ターゲット 15＋参照 25）。現状のダミー CSV では 売上高・売上原価・減価償却費・
  営業利益・当期純利益 など 5 件だけが一致し、残り 35 件が欠落しています（PL11件、BS24件・CF0件）。
- 加えて、既存のダミー行にも名称ずれがあり、マスターと一致するように以下をリネームする必要があります。
  - 売上高総利益 → 正式名 売上総利益（ga_code=gross_profit）
  - 税引き前当期利益 → 正式名 税引前当期純利益（pre_tax_income）
  - 支払法人税 → 正式名 法人税、住民税及び事業税（income_taxes）
- そのほかの不足 GA（例：extra_income＝「特別利益」、current_assets＝「流動資産」、capital_stock＝「資本金」、trade_receivables＝「受取
  手形及び売掛金」等）はダミー CSV に行が存在しません。これらを追加しない限り、CLI は user_accounts を引き当てられず SKIP のままです。

分類一覧（抜粋）

PL に追加が必要なもの

- Super Calc（ターゲット）：gross_profit「売上総利益」、ordinary_income「経常利益」、pre_tax_income「税引前当期純利益」など
- 参照用 Aggregate：non_op_income「営業外収益」、income_tax_adj「法人税等調整額」ほか

BS に追加が必要なもの

- Super Calc：current_assets「流動資産」、non_current_assets「固定資産」、liabilities「負債」、equity「純資産」など
- Aggregate：cash「現金及び預金」、trade_receivables「受取手形及び売掛金」、capital_stock「資本金」、retained_earnings「利益剰余金」
  など

ダミー拡張の進め方

1. 名称修正
   既存 3 行をマスタ表記に合わせてリネームします（上記参照）。
2. 不足 GA の追加
   下表の各 GA コードについて、日本語名をそのまま使った Account,＜ga_name＞,... 行を追加してください。値はゼロでも構いませんが、Super
   Calc の検算をしやすくするなら下記のような整合ルールをおすすめします。
   - 販売費及び一般管理費＝既存「販売費」「一般管理費」の和
   - 営業外収益・営業外費用・特別利益・特別損失 などはテストしやすい小額（例：各 50,000）を設定
   - BS 科目は貸借が合うように、流動資産＝現金及び預金＋受取手形及び売掛金＋棚卸資産 等テンプレート式が成立する値にしておくと、CLI 後
     の確認が容易です。
3. スクリプト・シナリオ投入
   ダミー CSV を更新後、いつものインポート手順でシナリオを作り直し、user_accounts に 40 GA が揃っていることを SQL で確認。揃った時点で
   npm run inject:super-calc -- --scenario-id=<id> --dry-run → 本実行を行えば SKIP が解消されるはずです。
4. 息切れ防止のためのテンプレート化
   足し合わせ用の数値は Python 等で自動生成するとミスが減ります。例えば基準値（売上や現預金など）を決め、そこから Super Calc の期待値を
   計算して CSV を吐き出す小スクリプトを用意すると、将来の再調整が簡単になります。

次の一手

1. 上記リネーム＋35 行追加を docs/[docs]\_master_data/[dummy]\_import_df_data.csv に反映する。
2. ダミー取込み後、SELECT DISTINCT ga.ga_code ... でシナリオ内 user_accounts を棚卸しし、40 件すべて揃ったことを確認。
3. CLI のドライランを再実行し、inserted/updated が立つことを確認。
