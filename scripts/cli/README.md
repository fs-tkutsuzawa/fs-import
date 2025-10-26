### 実行手順（VPN 接続済み前提）

1. 依存整備：yarn install
2. 既存ルール確認：yarn show:rules --scenario-id=1
3. ドライラン：yarn inject:super-calc --scenario-id=1 --dry-run
4. 本実行：yarn inject:super-calc --scenario-id=1
5. 反映確認：yarn show:rules --scenario-id=1
