/**
 * 手動送信完了後、指定した候補だけ contacted-handles.json に追記する。
 *
 * 実行:
 *   node --experimental-strip-types .grok/skills/lmia-x-outreach/scripts/mark-sent.ts 2026-06-17 --sent 1,3,5
 *   node --experimental-strip-types .grok/skills/lmia-x-outreach/scripts/mark-sent.ts 2026-06-17-3 --sent 1-3
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DATA_DIR,
  loadJson,
  normalizeHandle,
  parseIndexArg,
  parseMdHandles,
  resolveMdPath,
  saveJson,
} from './shared.ts';

type ContactedEntry = {
  handle: string;
  contactedAt: string;
  displayName?: string;
  sourceFile?: string;
};

function printUsage(): void {
  console.error('Usage: mark-sent.ts <date-or-file> --sent <indices>');
  console.error('Example: mark-sent.ts 2026-06-17-3 --sent 1,3,5');
  console.error('Example: mark-sent.ts 2026-06-17 --sent 1-10');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sentFlagIndex = args.indexOf('--sent');
  if (args.length === 0 || sentFlagIndex === -1 || !args[sentFlagIndex + 1]) {
    printUsage();
    process.exit(1);
  }

  const dateArg = args[0];
  const indices = parseIndexArg(args[sentFlagIndex + 1]);
  if (indices.length === 0) {
    console.error('--sent に有効な番号を指定してください');
    process.exit(1);
  }

  const mdPath = await resolveMdPath(dateArg.replace(/\.md$/, ''));
  if (!mdPath) {
    console.error(`outreach/${dateArg}.md が見つかりません`);
    process.exit(1);
  }

  const md = await readFile(mdPath, 'utf8');
  const parsed = parseMdHandles(md);
  if (parsed.length === 0) {
    console.error('md から handle を読み取れませんでした');
    process.exit(1);
  }

  const byIndex = new Map(parsed.map((row) => [row.index, row]));
  const selected = indices
    .map((index) => byIndex.get(index))
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (selected.length === 0) {
    console.error('指定した番号に該当する候補がありません');
    process.exit(1);
  }

  const contacted = await loadJson<ContactedEntry[]>(
    join(DATA_DIR, 'contacted-handles.json'),
    [],
  );
  const existing = new Set(contacted.map((c) => normalizeHandle(c.handle)));
  const now = new Date().toISOString();
  const sourceFile = mdPath.split('/').pop() ?? dateArg;
  let added = 0;

  for (const row of selected) {
    if (existing.has(row.handle)) continue;
    contacted.push({
      handle: row.handle,
      contactedAt: now,
      displayName: row.displayName,
      sourceFile,
    });
    existing.add(row.handle);
    added += 1;
  }

  await saveJson(join(DATA_DIR, 'contacted-handles.json'), contacted);

  const missing = indices.filter((index) => !byIndex.has(index));
  console.log(`Marked sent: ${added} handles from ${sourceFile}`);
  if (missing.length > 0) {
    console.warn(`存在しない番号: ${missing.join(', ')}`);
  }
  if (added < selected.length) {
    console.warn(`${selected.length - added} 件は既に contacted に存在します`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});