### 要は、Masterで用意した、 `server/src/templates/master_rules.json` に書かれている targetAccountCode / refAccountCode が上記で取得できる `ga_code` と一致しているかが問題

```sql
SELECT ua.id, ua.ua_name, ua.ua_code, ga.ga_code
    FROM user_accounts ua
    JOIN global_accounts ga ON ua.parent_ga_id = ga.id
    ORDER BY ga.ga_code;
```

ログに出た [SKIP] は、テンプレートが期待している GA コードに対応する user_accounts レコードがシナリオ 1 に存在しないことを意味しています（ターゲットや参照のどち
らの場合も同様です）。
たとえば gross_profit や personnel_costs などの勘定が、現状の user_accounts に登録されていないため、テンプレートをそのまま突っ込んでもマッピングできずスキップさ
れています。

### 何を確認すべきか

1. シナリオ 1 の user_accounts → global_accounts の対応を確認

   SELECT ua.id, ua.ua_name, ua.ua_code, ga.ga_code
   FROM user_accounts ua
   JOIN global_accounts ga ON ua.parent_ga_id = ga.id
   ORDER BY ga.ga_code;
   （psql などで実行）
   （psql などで実行）

2. テンプレートと照合
   server/src/templates/master_rules.json に書かれている targetAccountCode / refAccountCode が上記で取得できる ga_code と一致しているかを確認し、未登録のものは
   user_accounts を追加するかテンプレート側を調整してください。
3. 再実行
   必要な勘定が揃ってから再度 yarn inject:super-calc --scenario-id=1 --dry-run → 問題なければ本実行、という流れに戻れば挿入されるようになります。

———

### 実行手順（VPN 接続済み前提）

1. 依存整備：yarn install
2. 既存ルール確認：yarn show:rules --scenario-id=1
3. ドライラン：yarn inject:super-calc --scenario-id=1 --dry-run
4. 本実行：yarn inject:super-calc --scenario-id=1
5. 反映確認：yarn show:rules --scenario-id=1

テンプレートと user_accounts の GA コードが揃ってさえいれば、SKIP は消えて挿入/更新が走るはずです。
