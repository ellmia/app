import type { FxProfile, FxStatus } from './fxtwitter-client.ts';

export const FRESHNESS_DAYS = 90;

export const RETIRED_KEYWORDS = [
  '引退',
  '退店',
  'アカウント停止',
  '垢バレ',
  '活動終了',
  '配信終了',
  'このアカウントは',
  '気が向いたら消します',
  '新天地',
] as const;

export const SUSPICIOUS_POST_PATTERNS = [
  /crypto/i,
  /bitcoin/i,
  /nft/i,
  /投資で稼/,
  /無料プレゼント/,
  /account.*hacked/i,
  /乗っ取り/,
  /DM me/i,
  /passive income/i,
  /ancient forest tree/i,
] as const;

export type ValidationReason =
  | 'user_not_found'
  | 'suspended'
  | 'protected'
  | 'retired_bio'
  | 'retired_post'
  | 'stale_post'
  | 'post_unavailable'
  | 'suspicious_account'
  | 'no_posts';

export type ValidationResult =
  | {
      pass: true;
      status: FxStatus;
      postDateLabel: string;
      freshnessLabel: string;
    }
  | { pass: false; reason: ValidationReason; detail: string };

export function formatPostDate(timestamp: number): string {
  if (!timestamp) return '不明';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function containsRetiredKeyword(text: string): string | null {
  for (const keyword of RETIRED_KEYWORDS) {
    if (text.includes(keyword)) return keyword;
  }
  return null;
}

function latinRatio(text: string): number {
  const letters = text.replace(/[^A-Za-z\u3040-\u30ff\u4e00-\u9fff]/g, '');
  if (letters.length === 0) return 0;
  const latin = letters.replace(/[^A-Za-z]/g, '').length;
  return latin / letters.length;
}

function isJapaneseContext(...texts: string[]): boolean {
  return texts.some((text) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(text));
}

export function detectSuspiciousAccount(
  profile: FxProfile,
  statuses: FxStatus[],
): string | null {
  const latest = statuses.find((status) => !status.reposted);
  if (!latest) return null;

  for (const pattern of SUSPICIOUS_POST_PATTERNS) {
    if (pattern.test(latest.text)) {
      return `最新ポストが不審パターンに一致: ${pattern}`;
    }
  }

  const japaneseContext = isJapaneseContext(
    profile.name,
    profile.description,
    ...statuses.slice(1, 4).map((status) => status.text),
  );
  if (japaneseContext && latinRatio(latest.text) > 0.65) {
    return '日本語アカウントで最新ポストのみ英語（乗っ取り疑い）';
  }

  if (latest.lang === 'en' && japaneseContext) {
    const older = statuses.slice(1, 5).some((status) =>
      /[\u3040-\u30ff\u4e00-\u9fff]/.test(status.text),
    );
    if (older) return '最新ポストのみ英語（言語急変）';
  }

  return null;
}

export function pickLatestValidStatus(
  statuses: FxStatus[],
  maxAgeDays = FRESHNESS_DAYS,
): FxStatus | null {
  const cutoff = Date.now() / 1000 - maxAgeDays * 24 * 60 * 60;
  return (
    statuses.find(
      (status) =>
        !status.reposted &&
        status.createdTimestamp >= cutoff &&
        status.text.trim().length > 0,
    ) ?? null
  );
}

export function validateAccount(
  profile: FxProfile | null,
  statuses: FxStatus[],
): ValidationResult {
  if (!profile) {
    return { pass: false, reason: 'user_not_found', detail: 'プロフィール取得不可' };
  }

  if (profile.suspended) {
    return { pass: false, reason: 'suspended', detail: '凍結アカウント' };
  }

  if (profile.protected) {
    return { pass: false, reason: 'protected', detail: '非公開アカウント' };
  }

  const retiredBio = containsRetiredKeyword(
    `${profile.name} ${profile.description}`,
  );
  if (retiredBio) {
    return {
      pass: false,
      reason: 'retired_bio',
      detail: `bio/名前に「${retiredBio}」`,
    };
  }

  const suspicious = detectSuspiciousAccount(profile, statuses);
  if (suspicious) {
    return { pass: false, reason: 'suspicious_account', detail: suspicious };
  }

  const latest = pickLatestValidStatus(statuses);
  if (!latest) {
    const hasPosts = statuses.some((status) => !status.reposted);
    if (!hasPosts) {
      return { pass: false, reason: 'no_posts', detail: 'オリジナルポストなし' };
    }
    return {
      pass: false,
      reason: 'stale_post',
      detail: `直近${FRESHNESS_DAYS}日以内のポストなし`,
    };
  }

  const retiredPost = containsRetiredKeyword(latest.text);
  if (retiredPost) {
    return {
      pass: false,
      reason: 'retired_post',
      detail: `最新ポストに「${retiredPost}」`,
    };
  }

  const postDateLabel = formatPostDate(latest.createdTimestamp);
  return {
    pass: true,
    status: latest,
    postDateLabel,
    freshnessLabel: 'OK',
  };
}

export function reasonLabel(reason: ValidationReason): string {
  const labels: Record<ValidationReason, string> = {
    user_not_found: 'ユーザー不存在',
    suspended: '凍結',
    protected: '非公開',
    retired_bio: '引退(bio)',
    retired_post: '引退(ポスト)',
    stale_post: '鮮度不足',
    post_unavailable: 'ポスト取得不可',
    suspicious_account: '乗っ取り疑い',
    no_posts: 'ポストなし',
  };
  return labels[reason];
}