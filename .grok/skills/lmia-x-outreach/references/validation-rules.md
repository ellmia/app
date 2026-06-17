# X 鮮度・有効性検証ルール

`generate-outreach.ts` が fxtwitter v2 API で自動適用する。

## データソース

1. **風の谷間** — handle の発掘のみ（ポストURLは使わない）
2. **fxtwitter `/2/profile/{handle}`** — プロフィール存在・凍結・非公開
3. **fxtwitter `/2/profile/{handle}/statuses`** — 最新オリジナルポスト

## 自動除外

| 理由コード | 条件 |
|-----------|------|
| `user_not_found` | プロフィール取得不可 |
| `suspended` | 凍結アカウント |
| `protected` | 非公開アカウント |
| `retired_bio` | bio/名前に引退系キーワード |
| `retired_post` | 最新ポストに引退系キーワード |
| `stale_post` | 直近90日以内のオリジナルポストなし |
| `suspicious_account` | 乗っ取り・スパム疑い（英語急変等） |
| `no_posts` | オリジナルポストなし |

### 引退キーワード

`引退` `退店` `アカウント停止` `垢バレ` `活動終了` `配信終了` `このアカウントは` `気が向いたら消します` `新天地`

### 鮮度

- デフォルト: **90日以内**（`account-validator.ts` の `FRESHNESS_DAYS`）
- リツイートはスキップし、本人のオリジナルポストのみ対象

## md に載る条件

- 上記すべて通過
- ポスト本文が取得できる
- プロフィールフィルタ（[filter-rules.md](./filter-rules.md)）通過

**「本文取得不可」は出力しない。**

## handle 管理

| ファイル | 用途 |
|---------|------|
| `contacted-handles.json` | 実際にリプライ送信した |
| `skipped-handles.json` | リストに載ったが送信しなかった |
| `invalid-handles.json` | 検証で無効と判明した（凍結・引退・鮮度不足等） |
| `outreach/*.md` | 生成済み（再抽選除外） |

## 送信前クイックチェック（ユーザー、30秒/件）

自動検証後も念のため:

- [ ] ポストURLが開く
- [ ] プロフィールが本人っぽい
- [ ] 引退・店舗変更の告知がない