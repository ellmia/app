/**
 * 風の谷間（業種=ソープ）から候補を抽出し、X 鮮度検証済みの outreach md を生成する。
 *
 * 実行:
 *   node --experimental-strip-types .grok/skills/lmia-x-outreach/scripts/generate-outreach.ts
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  reasonLabel,
  validateAccount,
  FRESHNESS_DAYS,
} from './account-validator.ts';
import { fetchFxProfile, fetchFxStatuses } from './fxtwitter-client.ts';
import { filterProfile } from './profile-filter.ts';
import {
  DATA_DIR,
  loadJson,
  normalizeHandle,
  OUTREACH_DIR,
  saveJson,
  sleep,
  todayJst,
} from './shared.ts';

const KAZENO_BASE = 'https://kazeno.tobita-shinchi.love/info/';
const TARGET_COUNT = 10;
const FETCH_DELAY_MS = 400;

const AREAS: { value: string; label: string }[] = [
  { value: 'area_0', label: '東京' },
  { value: 'area_1', label: '神奈川' },
  { value: 'area_11', label: '埼玉' },
  { value: 'area_12', label: '千葉' },
  { value: 'area_2', label: '大阪' },
  { value: 'area_3', label: '兵庫' },
  { value: 'area_9', label: '京都' },
  { value: 'area_18', label: '愛知' },
  { value: 'area_38', label: '福岡' },
  { value: 'area_39', label: '北海道' },
  { value: 'area_21', label: '宮城' },
  { value: 'area_27', label: '静岡' },
  { value: 'area_24', label: '広島' },
  { value: 'area_19', label: '四国' },
  { value: 'area_37', label: '沖縄' },
  { value: 'area_4', label: '滋賀' },
  { value: 'area_5', label: '和歌山' },
  { value: 'area_6', label: '秋田' },
  { value: 'area_7', label: '岩手' },
  { value: 'area_8', label: '山梨' },
  { value: 'area_10', label: '奈良' },
  { value: 'area_13', label: '茨城' },
  { value: 'area_14', label: '栃木' },
  { value: 'area_15', label: '石川' },
  { value: 'area_16', label: '福井' },
  { value: 'area_17', label: '群馬' },
  { value: 'area_20', label: '三重' },
  { value: 'area_22', label: '山形' },
  { value: 'area_23', label: '福島' },
  { value: 'area_25', label: '島根' },
  { value: 'area_26', label: '新潟' },
  { value: 'area_28', label: '岡山' },
  { value: 'area_29', label: '鹿児島' },
  { value: 'area_30', label: '熊本' },
  { value: 'area_31', label: '佐賀' },
  { value: 'area_32', label: '富山' },
  { value: 'area_33', label: '長崎' },
  { value: 'area_34', label: '岐阜' },
  { value: 'area_35', label: '長野' },
  { value: 'area_36', label: '大分' },
  { value: 'area_40', label: '宮崎' },
];

type ContactedEntry = {
  handle: string;
  contactedAt: string;
  displayName?: string;
};

type InvalidEntry = {
  handle: string;
  invalidAt: string;
  reason: string;
  displayName?: string;
  source?: string;
  note?: string;
};

type SearchRow = {
  userid: string;
  displayName: string;
  areaLabel: string;
};

type Candidate = {
  handle: string;
  displayName: string;
  area: string;
  bio: string;
  postText: string;
  postUrl: string;
  postDateLabel: string;
  replyText: string;
};

type ExcludedRow = {
  handle: string;
  displayName: string;
  reason: string;
};

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'EllmiaOutreach/1.0 (+https://app.lmia.workers.dev)',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return res.text();
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSoapSearch(html: string, areaLabel: string): SearchRow[] {
  const rows: SearchRow[] = [];
  const re =
    /cmd=tweetlist&amp;userid=(\d+)"[^>]*rel="nofollow">([^<]+)<\/a><\/strong>/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((m = re.exec(html)) !== null) {
    const userid = m[1];
    if (seen.has(userid)) continue;
    seen.add(userid);
    rows.push({
      userid,
      displayName: decodeHtml(m[2].trim()),
      areaLabel,
    });
  }
  return rows;
}

function parseKazenoUserPage(html: string): {
  handle: string;
  displayName: string;
  bio: string;
  area: string;
} {
  const og = html.match(/property="og:description" content="([^"]+)"/);
  const ogText = og ? decodeHtml(og[1]) : '';

  const handleMatch =
    ogText.match(/\(@([A-Za-z0-9_]+)\)/) ??
    html.match(/<title>[^(@]*\(@([A-Za-z0-9_]+)\)/);
  const handle = handleMatch?.[1] ?? '';

  const nameMatch = ogText.match(/ユーザー情報([^(@]+)\(@/);
  const displayName = (nameMatch?.[1] ?? '').trim();

  let bio = '';
  if (handle && ogText.includes(`(@${handle})`)) {
    const afterHandle = ogText.split(`(@${handle})`)[1] ?? '';
    bio = afterHandle.split('エリア')[0]?.trim() ?? '';
  }

  const areaMatch = ogText.match(/エリア([^注]+?)(?=注目度|$)/);
  const area = areaMatch?.[1]?.trim() ?? '';

  return { handle, displayName, bio, area };
}

const INTRO_VARIANTS = [
  'ソープで働く方向けの相談チャット（エルミア）を運営してて、同業の方に試してもらってるんです。',
  'ソープ嬢向けの相談チャット（エルミア）の感想を聞きたくてリプしました。',
  'ソープ嬢向けの相談チャットで、指名・接客・メンタルみたいな話を相談できるツールです。',
] as const;

const ASK_VARIANTS = [
  'もしよければ一度触ってみて、使い心地や「ここ欲しい」みたいな感想をもらえると嬉しいです。',
  'よければ触ってみて、使った感触を教えてもらえると助かります。',
  'もし興味あれば試してみて、「ここ良い」「ここ微妙」くらい率直に教えてもらえると嬉しいです。',
] as const;

const REPLY_CLOSER = 'いかがでしょうか？🙏';

function buildReply(displayName: string, postText: string, index: number): string {
  const shortName = displayName
    .replace(/[@＠].*$/, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\u200d\ufe0f♡♥★☆✨🙅‍♀️🙏]/gu, '')
    .trim()
    .slice(0, 12);
  const opener = postText.includes('出勤') || postText.includes('入店')
    ? 'お仕事おつかれさまです'
    : postText.includes('写メ') || postText.includes('日記')
      ? 'いつも発信見てます'
      : '突然すみません';

  const intro = INTRO_VARIANTS[index % INTRO_VARIANTS.length];
  const ask = ASK_VARIANTS[index % ASK_VARIANTS.length];

  return [
    `${shortName}さん、${opener}。`,
    intro,
    ask,
    REPLY_CLOSER,
  ].join('\n');
}

async function loadHandlesFromOutreachFiles(): Promise<Set<string>> {
  const handles = new Set<string>();
  let files: string[] = [];
  try {
    files = await readdir(OUTREACH_DIR);
  } catch {
    return handles;
  }

  const re = /^## \d+\. (@[A-Za-z0-9_]+)/gm;
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await readFile(join(OUTREACH_DIR, file), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      handles.add(normalizeHandle(m[1]));
    }
  }
  return handles;
}

async function resolveOutputPath(date: string): Promise<string> {
  await mkdir(OUTREACH_DIR, { recursive: true });
  let path = join(OUTREACH_DIR, `${date}.md`);
  let n = 2;
  while (true) {
    try {
      await readFile(path);
      path = join(OUTREACH_DIR, `${date}-${n}.md`);
      n += 1;
    } catch {
      return path;
    }
  }
}

function renderMarkdown(
  date: string,
  areaLabel: string,
  candidates: Candidate[],
  excluded: ExcludedRow[],
): string {
  const lines: string[] = [
    `# アウトリーチ ${date}`,
    '',
    '送信アカウント: @lmia_ygd',
    `候補数: ${candidates.length}`,
    `取得エリア（起点）: ${areaLabel}`,
    `検証: 直近${FRESHNESS_DAYS}日以内のポスト・本文取得済みのみ`,
    '',
    '> 手動でリプライ送信。初回メッセージに URL は入れない。1件ごとに3〜5分空ける。',
    '',
    '## 送信可否サマリ（自動検証済み）',
    '',
    '| # | handle | 投稿日 | 鮮度 |',
    '|---|--------|--------|------|',
  ];

  candidates.forEach((c, i) => {
    lines.push(`| ${i + 1} | ${c.handle} | ${c.postDateLabel} | OK |`);
  });
  lines.push('', '---', '');

  candidates.forEach((c, i) => {
    lines.push(
      `## ${i + 1}. ${c.handle}（${c.displayName} / ${c.area}）`,
      '',
      `**検証**: ✅ ${c.postDateLabel} 投稿 / 鮮度 OK`,
      '',
      '### 候補のポスト',
      c.postText,
      '',
      '### ポストURL',
      c.postUrl,
      '',
      '### リプライ文案',
      c.replyText,
      '',
      '---',
      '',
    );
  });

  if (excluded.length > 0) {
    lines.push('## 除外ログ（参考）', '');
    for (const e of excluded.slice(0, 50)) {
      lines.push(`- ${e.handle}（${e.displayName}）— ${e.reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

const INVALID_REASON_PREFIXES = [
  '凍結',
  '引退(bio)',
  '引退(ポスト)',
  '鮮度不足',
  '乗っ取り疑い',
  'ユーザー不存在',
  'ポストなし',
] as const;

function shouldPersistInvalid(reason: string): boolean {
  return INVALID_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix));
}

async function appendInvalidHandles(excluded: ExcludedRow[]): Promise<number> {
  const invalid = await loadJson<InvalidEntry[]>(
    join(DATA_DIR, 'invalid-handles.json'),
    [],
  );
  const existing = new Set(invalid.map((entry) => normalizeHandle(entry.handle)));
  const now = new Date().toISOString();
  let added = 0;

  for (const row of excluded) {
    if (!shouldPersistInvalid(row.reason)) continue;
    if (existing.has(row.handle)) continue;
    invalid.push({
      handle: row.handle,
      invalidAt: now,
      reason: row.reason,
      displayName: row.displayName,
      source: 'generate-outreach',
    });
    existing.add(row.handle);
    added += 1;
  }

  if (added > 0) {
    await saveJson(join(DATA_DIR, 'invalid-handles.json'), invalid);
  }
  return added;
}

async function main(): Promise<void> {
  const contacted = await loadJson<ContactedEntry[]>(
    join(DATA_DIR, 'contacted-handles.json'),
    [],
  );
  const invalid = await loadJson<InvalidEntry[]>(
    join(DATA_DIR, 'invalid-handles.json'),
    [],
  );
  const skipped = await loadJson<{ handle: string }[]>(
    join(DATA_DIR, 'skipped-handles.json'),
    [],
  );
  const contactedSet = new Set(contacted.map((c) => normalizeHandle(c.handle)));
  const invalidSet = new Set(invalid.map((c) => normalizeHandle(c.handle)));
  const skippedSet = new Set(skipped.map((c) => normalizeHandle(c.handle)));
  const outreachSet = await loadHandlesFromOutreachFiles();
  const skipSet = new Set([
    ...contactedSet,
    ...invalidSet,
    ...skippedSet,
    ...outreachSet,
  ]);

  const cursor = await loadJson<{ index: number }>(
    join(DATA_DIR, 'area-cursor.json'),
    { index: 0 },
  );

  const candidates: Candidate[] = [];
  const excluded: ExcludedRow[] = [];
  const seenHandles = new Set<string>();
  const startAreaLabel =
    AREAS[cursor.index % AREAS.length]?.label ?? '全国';

  for (let round = 0; round < AREAS.length && candidates.length < TARGET_COUNT; round++) {
    const area = AREAS[(cursor.index + round) % AREAS.length];

    const body = new URLSearchParams({
      plugin: 'girlsearch',
      shopcat: 'shopcat_0',
      area: area.value,
      encode_hint: 'ぷ',
    });

    let html: string;
    try {
      html = await fetchText(KAZENO_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (err) {
      console.error(`エリア ${area.label} の取得失敗:`, err);
      await sleep(FETCH_DELAY_MS);
      continue;
    }

    const rows = parseSoapSearch(html, area.label);

    for (const row of rows) {
      if (candidates.length >= TARGET_COUNT) break;

      await sleep(FETCH_DELAY_MS);

      let userHtml: string;
      try {
        userHtml = await fetchText(
          `${KAZENO_BASE}?cmd=tweetlist&userid=${row.userid}`,
        );
      } catch {
        continue;
      }

      const parsed = parseKazenoUserPage(userHtml);
      if (!parsed.handle) continue;

      const handle = normalizeHandle(parsed.handle);
      if (skipSet.has(handle) || seenHandles.has(handle)) continue;
      seenHandles.add(handle);

      const displayName = parsed.displayName || row.displayName;
      let bio = parsed.bio;

      const filter = filterProfile(displayName, bio);
      if (!filter.pass) {
        excluded.push({
          handle,
          displayName,
          reason: filter.reason,
        });
        continue;
      }

      await sleep(FETCH_DELAY_MS);
      const profile = await fetchFxProfile(parsed.handle);
      if (profile?.description) {
        bio = profile.description;
      }

      const profileFilter = filterProfile(displayName, bio);
      if (!profileFilter.pass) {
        excluded.push({
          handle,
          displayName,
          reason: profileFilter.reason,
        });
        continue;
      }

      await sleep(FETCH_DELAY_MS);
      const statuses = await fetchFxStatuses(parsed.handle);
      const validation = validateAccount(profile, statuses);
      if (!validation.pass) {
        excluded.push({
          handle,
          displayName,
          reason: `${reasonLabel(validation.reason)}: ${validation.detail}`,
        });
        continue;
      }

      const postText = validation.status.text;
      const postUrl = validation.status.url;

      candidates.push({
        handle,
        displayName: profile?.name || displayName,
        area: parsed.area || row.areaLabel,
        bio,
        postText,
        postUrl,
        postDateLabel: validation.postDateLabel,
        replyText: buildReply(displayName, postText, candidates.length),
      });
    }

    await sleep(FETCH_DELAY_MS);
  }

  if (candidates.length === 0) {
    console.error('検証済み候補が0件でした。エリアを進めて再実行してください。');
    process.exit(1);
  }

  const date = todayJst();
  const outPath = await resolveOutputPath(date);
  const md = renderMarkdown(date, startAreaLabel, candidates, excluded);
  await writeFile(outPath, md, 'utf8');

  const addedInvalid = await appendInvalidHandles(excluded);

  cursor.index = (cursor.index + 1) % AREAS.length;
  await saveJson(join(DATA_DIR, 'area-cursor.json'), cursor);

  console.log(`Generated: ${outPath}`);
  console.log(`Validated candidates: ${candidates.length}`);
  console.log(`Excluded this run: ${excluded.length}`);
  console.log(`Invalid handles added: ${addedInvalid}`);
  console.log(`Next area cursor: ${AREAS[cursor.index].label}`);

  if (candidates.length < TARGET_COUNT) {
    console.warn(
      `警告: 目標${TARGET_COUNT}件に満たない（${candidates.length}件）。再実行でエリアを進めて補完できます。`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});