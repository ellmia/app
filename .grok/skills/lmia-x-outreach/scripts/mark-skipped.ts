/**
 * 送信しなかった候補を skipped-handles.json に記録する。
 *
 * 実行:
 *   node --experimental-strip-types .grok/skills/lmia-x-outreach/scripts/mark-skipped.ts 2026-06-17-3 --indices 1-10 --reason not_sent
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

type SkippedEntry = {
  handle: string;
  skippedAt: string;
  reason: string;
  displayName?: string;
  sourceFile?: string;
  note?: string;
};

function printUsage(): void {
  console.error('Usage: mark-skipped.ts <date-or-file> --indices <indices> --reason <reason>');
  console.error('Example: mark-skipped.ts 2026-06-17-3 --indices 1-10 --reason user_verified_invalid');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const indicesFlag = args.indexOf('--indices');
  const reasonFlag = args.indexOf('--reason');
  if (
    args.length === 0 ||
    indicesFlag === -1 ||
    !args[indicesFlag + 1] ||
    reasonFlag === -1 ||
    !args[reasonFlag + 1]
  ) {
    printUsage();
    process.exit(1);
  }

  const dateArg = args[0];
  const indices = parseIndexArg(args[indicesFlag + 1]);
  const reason = args[reasonFlag + 1];
  if (indices.length === 0) {
    console.error('--indices に有効な番号を指定してください');
    process.exit(1);
  }

  const mdPath = await resolveMdPath(dateArg.replace(/\.md$/, ''));
  if (!mdPath) {
    console.error(`outreach/${dateArg}.md が見つかりません`);
    process.exit(1);
  }

  const md = await readFile(mdPath, 'utf8');
  const parsed = parseMdHandles(md);
  const byIndex = new Map(parsed.map((row) => [row.index, row]));
  const selected = indices
    .map((index) => byIndex.get(index))
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (selected.length === 0) {
    console.error('指定した番号に該当する候補がありません');
    process.exit(1);
  }

  const skipped = await loadJson<SkippedEntry[]>(
    join(DATA_DIR, 'skipped-handles.json'),
    [],
  );
  const existing = new Set(skipped.map((entry) => normalizeHandle(entry.handle)));
  const now = new Date().toISOString();
  const sourceFile = mdPath.split('/').pop() ?? dateArg;
  let added = 0;

  for (const row of selected) {
    if (existing.has(row.handle)) continue;
    skipped.push({
      handle: row.handle,
      skippedAt: now,
      reason,
      displayName: row.displayName,
      sourceFile,
    });
    existing.add(row.handle);
    added += 1;
  }

  await saveJson(join(DATA_DIR, 'skipped-handles.json'), skipped);
  console.log(`Marked skipped: ${added} handles from ${sourceFile} (${reason})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});