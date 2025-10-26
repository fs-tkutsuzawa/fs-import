ローカル起動マニュアル（最新構成対応）

———

### 1. 前提

- Node.js 18 以上・npm
- PostgreSQL 接続先 (server/.env に記載。EC2 上の本番DBにそのまま繋がる想定)
- Docker/Docker Compose は任意（ローカルDB間に合わせる場合のみ使用）

———

### 2. 初期セットアップ

#### ルート（フロント）依存

```
npm install
```

#### バックエンド依存

```
cd server
npm install
cd ..
```

———

### 3. バックエンド（Hono API）の起動

1. server/.env を確認し、DB 接続情報が整っているか確認
   - ローカルDBを使いたい場合は .env を書き換え、必要なら docker-compose up -d postgres 等でDBを用意
2. バックエンド起動

```
cd server
npm run dev      # tsx watch でホットリロード
```

※TypeScript は Bundler 解決に合わせて相対パスへ修正済みなので追加設定不要です。

———

### 4. フロントエンド（CRA）の起動

#### ルートに戻って

```
npm run start
```

- 標準で http://localhost:3000 が開きます。

———

### 5. データ準備（必要に応じて）

- docs/[docs]\_master_data のCSVを参考に、user_accounts・global_accounts・periods・import_df などをDBへ投入。
- server/api/importData.ts や server/src/service/\* のSQLを参考に、既存APIを呼び出してデータ登録してもOK。

———

### 6. 動作確認

1. ブラウザで http://localhost:3000 を開く
2. Gridページ（財務モデル画面）で modelId / scenarioId / years を入力し「計算を実行」
3. バックエンドログで /api/v1/calculations → /status → /results が呼ばれるのを確認
4. 計算完了後、グリッドがAPIの年次結果で更新され、月次列は空表示のままになる
5. 「結果をクリア」でダミーデータ表示に戻ることを確認

———

### 7. テスト・Lint

```
npm test -- useCalculationJob.test.tsx   # フロント
npm run lint                  # 全体（warning は既存分が残ります）
cd server && npx tsc --noEmit            # バックエンド型チェック
```

———

### 8. 備考

- server/src/api/db.ts は api/db.ts を再エクスポートしているので、tsc 実行時にも解決されます。
- Docker を利用してローカルDBを立ち上げる場合は server/.env の DB 接続先をローカルに書き換え、docker-compose up -d postgres → npm run dev の順で起動してください。
- Warning の完全解消や月次展開のロジックは Phase7 の後続タスクとして別途整理しています。

これで最新のコードベースを問題なく動かせるはずです。
