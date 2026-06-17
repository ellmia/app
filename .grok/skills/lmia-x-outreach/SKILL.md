---
name: lmia-x-outreach
description: >
  エルミア向け X アウトリーチ。風の谷間（業種=ソープ・全国）から候補を発掘し、
  fxtwitter で鮮度検証した10名を outreach/日付.md（候補ポスト・URL・リプライ文案）に出力する。
  bio 空・絵文字のみは除外しない。Use when the user runs /lmia-x-outreach,
  asks for 風の谷間アウトリーチ, ソープ嬢へのリプライ文案, or X 候補リスト生成。
---

# エルミア X アウトリーチ

送信アカウント: [@lmia_ygd](https://x.com/lmia_ygd)

## パイプライン

```
[発掘] 風の谷間 → [検証] fxtwitter 最新ポスト → [送信] 手動リプライ
```

検証詳細: [validation-rules.md](./references/validation-rules.md)

## 実行手順

### 1. 候補リスト生成（スクリプト）

```bash
node --experimental-strip-types .grok/skills/lmia-x-outreach/scripts/generate-outreach.ts
```

- 風の谷間 **業種=ソープ** × 全国エリア（ローテーション）で handle を発掘
- fxtwitter v2 で **最新オリジナルポスト** を取得し鮮度検証（直近90日）
- 凍結・引退・乗っ取り疑い・鮮度不足は自動除外 → `invalid-handles.json` に追記
- `contacted-handles.json` / `skipped-handles.json` / `invalid-handles.json` / 既存 `outreach/*.md` を除外
- **検証済み10名** を `outreach/YYYY-MM-DD.md` に出力（同日再実行時は `-2` サフィックス）
- 10名未満の場合は警告を出す。再実行でエリアが進み補完可能

### 2. リプライ文案の仕上げ（エージェント）

生成された md を読み、各候補について:

- サマリ表と除外ログを確認し、ユーザーに検証結果を1行で報告
- 候補のポスト内容に合わせてリプライ文案を **個別に調整**
- [reply-rules.md](./references/reply-rules.md) を遵守（イケメンホスト・個人開発は使わない、締めは「いかがでしょうか？🙏」）
- [anti-ban-rules.md](./references/anti-ban-rules.md) を遵守
- 初回リプライに URL を入れない

### 3. 手動送信（ユーザー）

送信前クイックチェック（30秒/件）:

- [ ] ポストURLが開く
- [ ] プロフィールが本人っぽい（乗っ取り・スパムでない）
- [ ] 引退・店舗変更の告知がない

送信:

- md の **ポストURL** を開き、**リプライ文案** を貼らず手入力で送信
- 1件ごとに 3〜5 分空ける
- 当日最大 10 件

### 4. 送信記録

**送信した番号だけ** 記録する（md 全件を一括記録しない）:

```bash
node --experimental-strip-types .grok/skills/lmia-x-outreach/scripts/mark-sent.ts 2026-06-17-4 --sent 1,3,5
```

送信しなかった候補:

```bash
node --experimental-strip-types .grok/skills/lmia-x-outreach/scripts/mark-skipped.ts 2026-06-17-4 --indices 2,4 --reason not_sent
```

検証済みだが全件送信不可だった md（例: 旧リスト）:

```bash
node --experimental-strip-types .grok/skills/lmia-x-outreach/scripts/mark-skipped.ts 2026-06-17-3 --indices 1-10 --reason user_verified_invalid
```

## プロフィールフィルタ

詳細: [filter-rules.md](./references/filter-rules.md)

- **除外**: 風俗客・NH・店長・ホスト等の明示キーワード
- **除外しない**: bio が空、または絵文字のみ

## 出力 md フォーマット

```markdown
## 送信可否サマリ（自動検証済み）
| # | handle | 投稿日 | 鮮度 |

## N. @handle（表示名 / エリア）
**検証**: ✅ YYYY-MM-DD 投稿 / 鮮度 OK
### 候補のポスト
（本文必須）
### ポストURL
### リプライ文案
```

## ファイル構成

```
.grok/skills/lmia-x-outreach/
├── SKILL.md
├── data/
│   ├── contacted-handles.json   # 送信済み
│   ├── skipped-handles.json     # 未送信
│   ├── invalid-handles.json     # 無効アカウント
│   └── area-cursor.json
├── outreach/YYYY-MM-DD.md
├── outreach/archive/          # テスト・無効リスト（再送しない）
├── scripts/
│   ├── generate-outreach.ts
│   ├── mark-sent.ts
│   ├── mark-skipped.ts
│   ├── account-validator.ts
│   ├── fxtwitter-client.ts
│   ├── profile-filter.ts
│   └── shared.ts
└── references/
    ├── filter-rules.md
    ├── validation-rules.md
    └── anti-ban-rules.md
```

## トラブルシュート

| 症状 | 対処 |
|------|------|
| 検証済み候補 0 件 | エリアカーソルが進むので再実行。`invalid-handles.json` が多すぎる場合は確認 |
| 10名未満で出力 | 再実行で次エリアを探索。それでも不足なら鮮度期間の調整を検討 |
| 旧 md が全件無効 | 送信しない。`mark-skipped` で記録。`mark-sent` は使わない |
| テスト用 md の整理 | `mark-skipped --reason test_run` → `outreach/archive/` へ移動 |
| fxtwitter エラー | 時間をおいて再実行 |

## エージェント向け注意

- スクリプト実行後、**必ず md を読んでリプライを人間向けに磨く**
- 「本文取得不可」が出た md は旧形式。再生成を促す
- ユーザーに「手動送信」「送信した番号だけ mark-sent」を明示する
- 自動で X に投稿しない（API 未連携）