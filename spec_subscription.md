# soapy サブスクリプション仕様・実装計画

> **作成日**: 2026-06-16  
> **ステータス**: 計画（未実装）  
> **サービス名**: **soapy**（全て小文字）— 変更予定（旧称: Hostorch）  
> **親仕様**: [spec.md](./spec.md)  
> **戦略根拠**: [GTM-PMF-strategy.md](./GTM-PMF-strategy.md) §6 プライシング  
> **前提**: Phase 1（完全無料）の PMF シグナル取得後に着手する

---

## 0. サービス名変更（soapy）

ユーザー向けブランド名を **Hostorch** から **`soapy`**（全て小文字）へ変更する予定。

| 区分 | 表記 | 備考 |
|---|---|---|
| サービス名（ユーザー向け） | **soapy** | UI・X・Stripe 商品名・アンケート文など |
| 表記ルール | 常に小文字 `soapy` | `Soapy` / `SOAPY` / `SoaPy` は使わない |
| リポジトリ名 | `hostorch`（現状維持） | コード移行は別タスク |
| 技術識別子 | `hostorch-db` 等（暫定） | D1・Cookie 名などは実装時に `soapy-*` へ寄せるか、移行時に一括リネーム |

**本仕様書内の `Hostorch` 表記**

- §6 Stripe Product 名など、**未実装・未作成**の項目は実装時に **soapy** で作成する
- 既存の技術用語（`hostorch_session` 等）は Phase 2 実装 PR で `soapy` に合わせて更新する

**実装時に soapy へ揃えるもの**

- チャット UI のロゴ・タイトル・メタタグ
- `/pricing`・`/account` の表示名
- Stripe Dashboard の Product 表示名（例: `soapy Standard`）
- メール件名・マジックリンク文言
- OpenRouter `X-Title` ヘッダー（`chat.ts`）

---

## 1. 目的

GTM 戦略で定義した **フリーミアム（Phase 2）** と **ティア拡張（Phase 3）** を、既存の Astro 6 + Cloudflare Workers 構成に追加する。

| フェーズ | モデル | 価格 | 提供価値 |
|---|---|---|---|
| Phase 1（現状） | 完全無料 | ¥0 | IP レートリミットのみ（12 msg / 5 min） |
| **Phase 2** | **フリーミアム** | 無料 + **¥980/月** | 無料 8 msg/日 → 有料は無制限 + 履歴 |
| **Phase 3** | **ティア拡張** | +**¥1,980/月** | 高性能モデル + 週次振り返りサマリー |

**Go 条件（Phase 2 着手前）**

- Sean Ellis「とてもがっかり」≥ 30%（目標 40% 未達でも方向性は確認済み）
- MAU ≥ 30 または リピーター ≥ 10
- インタビューで課金意向 ≥ 10%（¥980 想定）

---

## 2. プラン定義

### 2.1 ティア一覧

| ティア ID | 表示名 | 月額（税込） | 年額（税込） | LLM モデル | 主な制限 |
|---|---|---|---|---|---|
| `free` | 無料 | ¥0 | — | `openrouter/free` | **8 user msg / 日**（JST 0:00 リセット） |
| `standard` | スタンダード | ¥980 | ¥9,800（2 ヶ月分オフ） | `openrouter/free`（将来: 軽量有料モデル検討） | **無制限**（フェアユース: 200 msg/日） |
| `premium` | プレミアム | ¥1,980 | ¥19,800 | `google/gemini-2.5-flash` 等（有料・ピン留め） | 無制限（フェアユース: 500 msg/日） |

### 2.2 機能マトリクス

| 機能 | free | standard | premium |
|---|---|---|---|
| チャット（ストリーミング） | ○ | ○ | ○ |
| イケメンホスト SYSTEM_PROMPT | ○ | ○ | ○ |
| 例示質問チップ | ○ | ○ | ○ |
| 日次メッセージ上限 | 8 | 実質無制限※ | 実質無制限※ |
| チャット履歴（サーバー保存） | ✕ | ○（90 日） | ○（365 日） |
| 複数デバイス同期 | ✕ | ○ | ○ |
| 週次振り返りサマリー | ✕ | ✕ | ○（毎週月曜 JST 生成） |
| 応答品質（モデル） | 無料枠 | 無料枠 | 有料高性能モデル |
| 優先レート（混雑時） | 低 | 中 | 高 |

※ フェアユース超過時は 429 + アップグレード案内。乱用防止用であり、通常利用では到達しない想定。

### 2.3 課金・解約ルール

- **決済**: Stripe Subscription（JPY）
- **トライアル**: Phase 2 初期は **7 日間無料**（Standard のみ、1 ユーザー 1 回）
- **解約**: 即時解約可。期間終了まで利用継続（日割り返金なし）
- **ダウングレード**: Premium → Standard は次回更新日から。履歴保持期間はティアに合わせて短縮
- **アップグレード**: 即時反映。Stripe の按分（proration）を使用

---

## 3. アーキテクチャ

### 3.1 追加コンポーネント

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Chat.tsx   │────▶│  /api/chat       │────▶│  OpenRouter │
│  (React)    │     │  + tier check    │     └─────────────┘
└──────┬──────┘     │  + usage meter   │
       │            └────────┬─────────┘
       │                     │
       ▼                     ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│ /pricing    │     │  D1 (users,      │     │  KV (日次   │
│ /account    │     │  subs, messages) │     │  msg カウンタ)│
└──────┬──────┘     └──────────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────────┐
│ Stripe      │◀───▶│ /api/stripe/*    │
│ Checkout    │     │ webhook          │
└─────────────┘     └──────────────────┘
```

### 3.2 技術選定

| 領域 | 採用 | 理由 |
|---|---|---|
| 認証 | **メールマジックリンク**（自前 JWT + D1） | アカウント必須。匿名決済と両立。ソーシャルログインは Phase 2 では見送り |
| DB | **Cloudflare D1** | ユーザー・課金・履歴の永続化。Workers と同一スタック |
| レート/日次カウント | **Cloudflare KV** | 日次 msg カウントの高速読み書き。TTL で自動リセット補助 |
| 決済 | **Stripe Billing** | JPY サブスク、Checkout、Customer Portal、Webhook が揃う |
| 週次サマリー | **Cron Trigger**（Workers） | 毎週月曜 9:00 JST に Premium ユーザー分をバッチ生成 |
| メール送信 | **Resend** または **Cloudflare Email Sending** | マジックリンク・サマリー通知 |

### 3.3 wrangler.toml 追加（予定）

```toml
[[d1_databases]]
binding = "DB"
database_name = "hostorch-db"
database_id = "<作成後に記入>"

[[kv_namespaces]]
binding = "USAGE_KV"
id = "<作成後に記入>"

[triggers]
crons = ["0 0 * * 1"]  # 週次サマリー: UTC 月曜 0:00 = JST 月曜 9:00
```

---

## 4. データモデル（D1）

### 4.1 スキーマ

```sql
-- migrations/0001_subscription.sql

CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- uuid
  email         TEXT NOT NULL UNIQUE,
  tier          TEXT NOT NULL DEFAULT 'free', -- free | standard | premium
  stripe_customer_id TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  token_hash    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE subscriptions (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_price_id       TEXT NOT NULL,
  status                TEXT NOT NULL,     -- active | canceled | past_due | trialing
  current_period_end    TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  role          TEXT NOT NULL,             -- user | assistant
  content       TEXT NOT NULL,
  host_name     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_user_created ON messages(user_id, created_at DESC);

CREATE TABLE weekly_summaries (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  week_start    TEXT NOT NULL,             -- ISO date (月曜)
  content       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, week_start)
);
```

### 4.2 KV キー設計

| キー | 値 | TTL |
|---|---|---|
| `usage:{userId}:{YYYY-MM-DD}` | user msg カウント（整数） | 48h |
| `usage:ip:{ip}:{YYYY-MM-DD}` | 未ログイン時のフォールバック（移行期のみ） | 48h |
| `magic:{token_hash}` | email（ワンタイムログイン） | 15min |

---

## 5. 認証フロー

### 5.1 マジックリンク

1. `POST /api/auth/request-link` — `{ email }` を受け取り、トークン生成・メール送信
2. ユーザーが `GET /api/auth/verify?token=...` をクリック
3. 検証成功 → HttpOnly Cookie `soapy_session`（JWT、7 日）を Set
4. `GET /api/auth/me` — 現在の `{ userId, email, tier, usage }` を返す

### 5.2 未ログイン時の扱い（移行期）

| 期間 | 挙動 |
|---|---|
| Phase 2 リリース〜2 週間 | 未ログインは従来の IP レートリミット（12/5min）を維持。ログイン促進バナーを表示 |
| 2 週間後 | 未ログインは **free 相当（8 msg/日・IP ベース）** に統一 |
| 有料機能 | ログイン必須 |

**プライバシー方針（spec.md 倫理原則に準拠）**

- メールは Stripe 決済とアカウント復旧にのみ使用
- チャット本文は Standard/Premium のみサーバー保存。無料は保存しない
- サマリー生成は保存済みメッセージのみを入力とする（第三者送信なし）

---

## 6. Stripe 連携

### 6.1 Product / Price（Stripe Dashboard で作成）

| Stripe Product | Price ID（例） | 金額 |  interval |
|---|---|---|---|
| soapy Standard | `price_standard_monthly` | ¥980 | month |
| soapy Standard Annual | `price_standard_yearly` | ¥9,800 | year |
| soapy Premium | `price_premium_monthly` | ¥1,980 | month |
| soapy Premium Annual | `price_premium_yearly` | ¥19,800 | year |

### 6.2 API エンドポイント

| パス | メソッド | 役割 |
|---|---|---|
| `/api/stripe/checkout` | POST | `{ priceId }` → Stripe Checkout Session URL |
| `/api/stripe/portal` | POST | Customer Portal URL（プラン変更・解約） |
| `/api/stripe/webhook` | POST | `checkout.session.completed`, `customer.subscription.*` を処理 |

### 6.3 Webhook 処理

```
checkout.session.completed
  → users.stripe_customer_id 更新
  → subscriptions レコード作成
  → users.tier を priceId から判定して更新

customer.subscription.updated
  → status / current_period_end 同期
  → tier 再計算

customer.subscription.deleted
  → tier = 'free'
  → 履歴は読み取り専用で保持期間後に削除（バッチ）
```

### 6.4 シークレット

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put RESEND_API_KEY   # またはメール送信手段
```

---

## 7. 利用量制御（`/api/chat` 改修）

### 7.1 リクエスト前チェック（疑似コード）

```typescript
// src/lib/usage.ts（新規）

async function assertCanSendMessage(ctx: {
  user: User | null;
  ip: string;
}): Promise<{ tier: Tier; model: string }> {
  const tier = ctx.user?.tier ?? 'free';
  const userId = ctx.user?.id ?? `ip:${ctx.ip}`;

  if (tier === 'free') {
    const count = await incrementDailyUsage(userId);
    if (count > 8) {
      throw new UsageLimitError('今日の無料枠は終わった。また明日来てくれ。');
    }
    return { tier, model: 'openrouter/free' };
  }

  if (tier === 'standard') {
    await assertFairUse(userId, 200);
    return { tier, model: 'openrouter/free' };
  }

  // premium
  await assertFairUse(userId, 500);
  return { tier, model: PREMIUM_MODEL }; // env: LLM_MODEL_PREMIUM
}
```

### 7.2 既存レートリミットとの関係

| 層 | 現状 | Phase 2 以降 |
|---|---|---|
| IP burst（5 min） | 12 msg | ログイン済みは **スキップ**（user ベースに移行） |
| 日次上限 | なし | free: 8、standard/premium: フェアユース |
| 未ログイン | IP burst のみ | 日次 8（IP キー） |

### 7.3 履歴保存

- **リクエスト成功後**（assistant 応答完了時）に `messages` へ INSERT
- `GET /api/history` — Standard+ のみ、直近 N 件を返す
- `Chat.tsx` — ログイン時はサーバー履歴を初期表示。未ログインは従来どおりセッション内のみ

---

## 8. 週次サマリー（Premium）

### 8.1 生成タイミング

- Cron: 毎週月曜 9:00 JST
- 対象: `tier = premium` かつ先週の `messages` が 1 件以上あるユーザー

### 8.2 生成ロジック

1. 先週（月〜日）の user/assistant メッセージを取得
2. 別プロンプト `WEEKLY_SUMMARY_PROMPT` で要約（非ストリーミング、max_tokens: 800）
3. `weekly_summaries` に保存
4. オプション: メールで「今週の振り返り」を通知

### 8.3 UI

- `GET /api/summaries` — 過去 12 週分
- チャット UI のヘッダーまたはサイドパネルに「今週のまとめ」タブ（Premium のみ）

---

## 9. UI 変更

### 9.1 新規ページ

| パス | 内容 |
|---|---|
| `/pricing` | 3 ティア比較、Checkout ボタン |
| `/account` | 現在のプラン、残り利用枠、Portal リンク、ログアウト |

### 9.2 Chat.tsx 変更

| 要素 | 変更 |
|---|---|
| ヘッダー | 残り msg 数（free）、プラン名、ログイン状態 |
| 上限到達時 | モーダル「スタンダードにすると無制限 + 履歴」→ `/pricing` |
| Premium | サマリータブ、ホスト名表示は維持 |

### 9.3 エラーメッセージ（既存トーン維持）

| コード | メッセージ例 |
|---|---|
| 401 | ログインが必要だ。メール送るから少し待ってて。 |
| 402 / 429（上限） | 今日の無料枠は終わった。また明日来てくれ。 |
| 403（tier） | この機能はスタンダード以上だよ。 |

---

## 10. 実装フェーズ（PR 単位）

### Phase 2-A: 基盤（推定 3〜4 日）

| PR | 内容 | 成果物 |
|---|---|---|
| PR-1 | D1 マイグレーション + wrangler バインディング | `migrations/`, `wrangler.toml` |
| PR-2 | `src/lib/usage.ts` — KV 日次カウント | ユニットテスト |
| PR-3 | `src/lib/tiers.ts` — ティア定義・モデル選択 | 定数・型 |
| PR-4 | `/api/chat` に tier/usage チェック統合 | free 8/日が動作 |

**完了条件**: ログインなしで free 8/日が KV で動き、超過時 429 が返る

### Phase 2-B: 認証（推定 2〜3 日）

| PR | 内容 |
|---|---|
| PR-5 | `POST /api/auth/request-link`, `GET /api/auth/verify` |
| PR-6 | `GET /api/auth/me`, ログアウト、JWT ミドルウェア |
| PR-7 | Chat.tsx — ログイン UI、セッション状態表示 |

**完了条件**: メールでログインし、user ベースの日次カウントに切り替わる

### Phase 2-C: Stripe Standard（推定 3〜4 日）

| PR | 内容 |
|---|---|
| PR-8 | Stripe Checkout + Webhook + `subscriptions` 同期 |
| PR-9 | `/pricing`, `/account` ページ |
| PR-10 | Standard: 無制限 + `messages` 保存 + `GET /api/history` |

**完了条件**: ¥980 で契約 → tier=standard → 履歴がデバイス間で復元される

### Phase 3-A: Premium ティア（推定 3〜4 日）

| PR | 内容 |
|---|---|
| PR-11 | Premium Checkout（アップグレード path） |
| PR-12 | `LLM_MODEL_PREMIUM` env、chat でモデル切替 |
| PR-13 | フェアユース 500/日、優先キュー（ログ上の区別即可） |

**完了条件**: Premium ユーザーだけ有料モデルで応答

### Phase 3-B: 週次サマリー（推定 2〜3 日）

| PR | 内容 |
|---|---|
| PR-14 | `WEEKLY_SUMMARY_PROMPT` + Cron Worker |
| PR-15 | `GET /api/summaries` + UI タブ |

**完了条件**: Premium ユーザーに毎週月曜、先週のサマリーが表示される

---

## 11. ディレクトリ構成（追加後）

```
src/
  lib/
    tiers.ts              # ティア定義・機能フラグ
    usage.ts              # KV 日次カウント・フェアユース
    auth.ts               # JWT・セッション検証
    stripe.ts             # Checkout / Portal / Webhook ヘルパー
    db.ts                 # D1 クエリ
    prompts-summary.ts    # 週次サマリー用プロンプト
  pages/
    pricing.astro
    account.astro
    api/
      auth/
        request-link.ts
        verify.ts
        me.ts
        logout.ts
      stripe/
        checkout.ts
        portal.ts
        webhook.ts
      history.ts
      summaries.ts
  components/islands/
    AuthModal.tsx
    PricingTable.tsx
    UsageBadge.tsx
    SummaryPanel.tsx
migrations/
  0001_subscription.sql
```

---

## 12. 環境変数（追加）

| 変数 | 必須 | 説明 |
|---|---|---|
| `JWT_SECRET` | ○ | セッション署名 |
| `STRIPE_SECRET_KEY` | Phase 2-C〜 | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Phase 2-C〜 | Webhook 検証 |
| `STRIPE_PRICE_STANDARD_MONTHLY` | ○ | Price ID |
| `STRIPE_PRICE_STANDARD_YEARLY` | 任意 | 年払い |
| `STRIPE_PRICE_PREMIUM_MONTHLY` | Phase 3〜 | Price ID |
| `STRIPE_PRICE_PREMIUM_YEARLY` | 任意 | 年払い |
| `LLM_MODEL_PREMIUM` | Phase 3〜 | 例: `google/gemini-2.5-flash` |
| `RESEND_API_KEY` | ○ | マジックリンク送信 |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | ○ | クライアント（Checkout リダイレクトのみなら不要も可） |

`astro.config.mjs` の `env.schema` に上記を追加する。

---

## 13. テスト計画

| 種別 | 内容 |
|---|---|
| 単体 | `tiers.ts`, `usage.ts` — 日次リセット境界（JST）、tier 判定 |
| 統合 | Webhook  fixture（Stripe CLI `stripe listen`）で tier 遷移 |
| E2E（手動） | free 9 通目 → 429 → Checkout → 履歴復元 |
| 負荷 | KV/D1 の Workers 上でのレイテンシ（+10ms 以内目標） |

**Stripe テストモード**

```bash
stripe listen --forward-to localhost:4321/api/stripe/webhook
```

---

## 14. ロールアウト

| 段階 | 対象 | 期間 |
|---|---|---|
| 内部 | 開発者 + インタビュー 5 名 | 1 週間 |
| ベータ | Standard 7 日トライアル招待（20 名） | 2 週間 |
| GA | 全ユーザーに `/pricing` 公開 | — |
| Premium | Standard 利用者 10 名以上で Premium 解禁 | GA +4 週間 |

**フィーチャーフラグ（KV または env）**

```
SUBSCRIPTION_ENABLED=false   # Phase 2 完了まで
PREMIUM_ENABLED=false        # Phase 3 完了まで
```

---

## 15. コスト試算

| 項目 | 無料ユーザー 100 MAU | 有料 20 MAU（Standard 15 + Premium 5） |
|---|---|---|
| Workers | 無料枠内 | 無料枠内 |
| D1 | ~$0 | ~$1/月 |
| KV | ~$0 | ~$0.5/月 |
| OpenRouter | 無料モデル中心 | Premium 5 名 × 有料モデル ≈ $10〜30/月 |
| Stripe 手数料 | — | 売上の 3.6% + ¥40/件 |
| **粗利（目安）** | −API コストのみ | ¥980×15 + ¥1980×5 ≈ **¥24,600/月** − API $20 ≈ **¥21,000+** |

Premium の有料モデルは **コストと品質の差別化軸** として必須。Standard は当面 `openrouter/free` を維持し、API コストを抑える。

---

## 16. リスクと対策

| リスク | 対策 |
|---|---|
| 匿名性への不安（メール登録） | 履歴・課金に必要な最小情報と明記。ニックネームのみ表示可 |
| Webhook 不整合で tier ずれ | Webhook + 日次 Stripe API 照合バッチ |
| 無料枠悪用（複数メール） | 同一 Stripe customer 1 アカウント、異常 IP 監視 |
| 有料モデルコスト膨張 | Premium のみ。フェアユース + `max_tokens` 上限維持 |
| 風俗業界での決済拒否 | Stripe 利用規約確認。商品名は「キャリア相談 AI」など中立表現 |

---

## 17. 次のアクション（実装開始時）

1. Stripe テストモードで Product / Price を 4 件作成し、Price ID を `.env` に記録
2. `wrangler d1 create hostorch-db` → マイグレーション PR-1
3. Phase 2-A（usage + chat 統合）を **決済なし** で先行リリースし、8 msg/日の UX を検証
4. PMF Go 条件を満たした週に Phase 2-B（認証）→ 2-C（Stripe）へ進む

---

## 18. spec.md との関係

本ドキュメント実装時は [spec.md](./spec.md) §5「将来の拡張可能性」を以下に更新する。

- ~~ユーザーアカウント・ログイン~~ → **Phase 2-B で採用**
- ~~チャット履歴の永続化~~ → **Standard+ で採用**
- ~~より高度なレートリミット（KV + 1日上限）~~ → **Phase 2-A で採用**

親仕様の「Ultra Minimal」方針は Phase 1 に限定し、**Phase 2 以降は本 spec_subscription.md が Subscription 領域の Single Source of Truth** とする。