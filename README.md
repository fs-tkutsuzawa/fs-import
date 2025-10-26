# fs-model

## ESlintスクリプトコマンド

npm run lint - コードをチェック
npm run lint:fix - コードをチェックして自動修正
npm run format - コードをフォーマット
npm run format:check - フォーマットチェックのみ

## 使い方

### コードを最新化

git pull

### コードをフォーマット

yarn format

### フロントを起動

yarn start

### APIを起動

cd server/  
npm run dev

※ ローカル開発時は.envファイルに下記を記載
REACT_APP_API_BASE_URL=http://localhost:3001
