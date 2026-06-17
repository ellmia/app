# Hostorch

イケメンホストによるソープ嬢（風俗嬢）向けの実践コンサルタントチャット。

**Astro 6 + React Islands + Tailwind 4 + Cloudflare Workers + OpenRouter ストリーミングチャット**

- ペルソナ: ジェントルで少しチャーミングな「イケメンホスト」。タメ口ベースだがケアと敬意を忘れない。
- 目的: 集客・接客テクニック・安全管理・単価アップ・メンタル・ビジネス判断などのリアルなアドバイスを、無料枠OpenRouter経由で低コストに提供。
- 最小構成（MVP）: フルスクリーンチャットUI + 即時ストリーミング + ハードコードされた高品質システムプロンプト + クリア機能。

## 技術スタック（既存プロジェクト完全準拠）

- Astro 6 (output: server)
- @astrojs/cloudflare (Workers deploy)
- React 19 Islands (client:only="react")
- Tailwind CSS 4 (@tailwindcss/vite)
- TypeScript strict + `@/*` alias
- OpenRouter (`/api/chat` でプロキシ + SSE stream pass-through)

デプロイ: `wrangler deploy` → `https://chat.hostorch.workers.dev`

## 開発

```bash
cp .env.example .env   # OPENROUTER_API_KEY を設定（あなたの無料枠キー）
npm install
npm run check          # 必須
npm run dev            # http://localhost:4321 でチャットテスト
npm run build          # check + build（本番前必須）
npm run deploy         # wrangler deploy
```

**本番シークレット設定**（重要: キーはコミットしない）

ローカルの `.env` と完全に同じ設定（`LLM_MODEL=openrouter/free`）にする場合：

```bash
# 必須
npx wrangler secret put OPENROUTER_API_KEY
# 任意（.env で LLM_MODEL=openrouter/free を設定している場合）
npx wrangler secret put LLM_MODEL
# → 値として `openrouter/free` を入力
```

設定後、必ず再デプロイしてください：
```bash
npm run deploy
```

デプロイ:
```bash
npm run deploy
```
（内部で `astro check && astro build && wrangler deploy` が走る）

ローカル開発で .env にキーを置いて `npm run dev` すれば即チャット可能（Workers ランタイムの挙動は `npm run preview` で近い）。

## コーディング規約

ai プロジェクトに完全準拠:
- 変更後は必ず `npm run check`
- `any` 禁止、全て型付け
- API エラーは常に `{ error: string }`
- 外部 fetch (特に OpenRouter) は AbortController + タイムアウト
- レートリミットは IP ベース（`src/lib/rateLimit.ts`）
- ストリーミングは OpenRouter 互換の delta.content を逐次追記

詳細: [AGENTS.md](./AGENTS.md)

## ディレクトリ

```
src/
  pages/index.astro          # 超ミニマルなチャット専用シェル
  pages/api/chat.ts          # プロキシ + レートリミット + ストリーム
  components/islands/Chat.tsx # 状態管理 + SSE パーサ + UI
  lib/prompts.ts             # イケメンホスト SYSTEM_PROMPT（最重要）
  lib/rateLimit.ts
  lib/api-response.ts
  styles/global.css          # ライトモード ChatGPT風（携帯特化）
```

## 免責（UI + プロンプト両方に明記）

これは一般的な情報提供・エンターテイメントです。法的・医療的・税務的助言ではありません。実際の行動は自己責任で。安全と同意を最優先してください。

## ライセンス / 連絡

個人プロジェクト。コードは参考程度に。

---

This project follows the exact conventions of the sibling `ai` (Astro 6 + CF) and `paperlevels` (Workers + server output + API routes) projects in the same workspace.