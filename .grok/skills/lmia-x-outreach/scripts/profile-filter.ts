/** プロフィール除外ルール。bio 空・絵文字のみは除外しない。 */

export const EXCLUDE_KEYWORDS = [
  '風俗客',
  '風遊び',
  'パイクラ',
  'パイクライナー',
  'ホスト',
  '店長',
  '中の人',
  '代表',
  '運営',
  '男の娘',
  'ニューハーフ',
  '女装',
  '偽娘',
  'femboy',
  'AV女優',
  '風俗盛り上げ',
  'お客',
  '遊び人',
  'クレイジーハッピー',
] as const;

/** 「推し」は風俗客文脈のみ除外（表示名にソープ嬢等があれば許可） */
const CUSTOMER_PUSH_PATTERNS = ['推し', '女の子に敬意', 'しか見えない'] as const;

const EMOJI_STRIP_RE =
  /[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\u200d\ufe0f♡♥★☆✨🩷🩵💕💋🫧🛁🐰🐱🐳🦋🌷🪷💜🧸🍒💗🧜🏻‍♀️🫶🌻💍🚗🏰❄️🪽🍈👑⭐️🤍🩷]/gu;

export function stripEmojiAndSpace(text: string): string {
  return text.replace(EMOJI_STRIP_RE, '').trim();
}

/** bio が空、または絵文字・記号のみ */
export function isBioEmptyOrEmojiOnly(bio: string): boolean {
  return stripEmojiAndSpace(bio).length === 0;
}

export type FilterResult =
  | { pass: true }
  | { pass: false; reason: string };

export function filterProfile(displayName: string, bio: string): FilterResult {
  const combined = `${displayName} ${bio}`;

  for (const keyword of EXCLUDE_KEYWORDS) {
    if (combined.includes(keyword)) {
      return { pass: false, reason: keyword };
    }
  }

  for (const pattern of CUSTOMER_PUSH_PATTERNS) {
    if (combined.includes(pattern)) {
      return { pass: false, reason: pattern };
    }
  }

  // bio 空・絵文字のみ → 除外しない（ソープ嬢の可能性を残す）
  if (isBioEmptyOrEmojiOnly(bio)) {
    return { pass: true };
  }

  // 業種=ソープ検索済み候補。明示的除外がなければ採用。
  return { pass: true };
}