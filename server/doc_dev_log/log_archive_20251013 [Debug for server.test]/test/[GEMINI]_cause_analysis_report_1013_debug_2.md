### 原因分析レポート.md

**1. 根因**

テストセットアップスクリプト `server/test/setup/simple-setup.ts` が、`scenarios`テーブルへの`INSERT`時に`model_id`カラムへ`NULL`値を渡そうとしていたことが原因です。これは、`INSERT`文が`models`テーブルから`MIN(id)`を取得して`model_id`として使用していましたが、テスト環境によっては`models`テーブルが空であり、`MIN(id)`が`NULL`を返していたために発生していました。

**2. 再現手順**

1.  `server`ディレクトリに移動します。
2.  `npx tsx test/setup/simple-setup.ts` を実行します。
3.  `scenarios`テーブルの`model_id`カラムに対する`not-null`制約違反のエラーが発生します。

**3. 影響範囲**

- `server/test/setup/simple-setup.ts`

**4. 契約差分**

(N/A: API契約の差異ではなく、テストスクリプト内部の問題です)
