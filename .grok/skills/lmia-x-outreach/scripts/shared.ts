import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SKILL_ROOT = join(import.meta.dirname, '..');
export const DATA_DIR = join(SKILL_ROOT, 'data');
export const OUTREACH_DIR = join(SKILL_ROOT, 'outreach');

export function todayJst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function normalizeHandle(handle: string): string {
  return handle.startsWith('@') ? handle.toLowerCase() : `@${handle.toLowerCase()}`;
}

export function stripHandle(handle: string): string {
  return handle.replace(/^@/, '');
}

export async function loadJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function saveJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export type MdHandleRow = {
  index: number;
  handle: string;
  displayName: string;
};

export function parseMdHandles(content: string): MdHandleRow[] {
  const rows: MdHandleRow[] = [];
  const re = /^## (\d+)\. (@[A-Za-z0-9_]+)（([^/]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    rows.push({
      index: Number(m[1]),
      handle: normalizeHandle(m[2]),
      displayName: m[3].trim(),
    });
  }
  return rows;
}

export async function resolveMdPath(dateArg: string): Promise<string | null> {
  const normalized = dateArg.replace(/\.md$/, '').replace(/^archive\//, '');
  const fileName = `${normalized}.md`;
  const candidates = [
    join(OUTREACH_DIR, fileName),
    join(OUTREACH_DIR, 'archive', fileName),
  ];

  for (const path of candidates) {
    try {
      await readFile(path);
      return path;
    } catch {
      // try next
    }
  }
  return null;
}

export function parseIndexArg(value: string): number[] {
  const indices = new Set<number>();
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [startRaw, endRaw] = trimmed.split('-');
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      for (let i = Math.min(start, end); i <= Math.max(start, end); i += 1) {
        indices.add(i);
      }
      continue;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) indices.add(n);
  }
  return [...indices].sort((a, b) => a - b);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}