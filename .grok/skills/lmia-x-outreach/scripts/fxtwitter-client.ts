import { stripHandle } from './shared.ts';

const FX_BASE = 'https://api.fxtwitter.com';
const USER_AGENT = 'EllmiaOutreach/1.0 (+https://app.lmia.workers.dev)';

export type FxProfile = {
  screenName: string;
  name: string;
  description: string;
  protected: boolean;
  suspended: boolean;
};

export type FxStatus = {
  id: string;
  text: string;
  url: string;
  createdAt: string;
  createdTimestamp: number;
  lang: string | null;
  reposted: boolean;
};

type FxProfileResponse = {
  code?: number;
  message?: string;
  reason?: string;
  profile?: {
    screen_name?: string;
    name?: string;
    description?: string;
    protected?: boolean;
  };
  user?: {
    screen_name?: string;
    name?: string;
    description?: string;
    protected?: boolean;
  };
};

type FxStatusItem = {
  type?: string;
  id?: string;
  text?: string;
  url?: string;
  created_at?: string;
  created_timestamp?: number;
  lang?: string | null;
  reposted_by?: unknown;
};

type FxStatusesResponse = {
  code?: number;
  message?: string;
  results?: FxStatusItem[];
};

async function fetchFxJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    const data = (await res.json()) as T;
    return data;
  } catch {
    return null;
  }
}

export async function fetchFxProfile(handle: string): Promise<FxProfile | null> {
  const screenName = stripHandle(handle);
  const data = await fetchFxJson<FxProfileResponse>(
    `${FX_BASE}/2/profile/${screenName}`,
  );
  if (!data) return null;

  if (data.code === 404) {
    const suspended =
      data.message?.toLowerCase().includes('suspend') === true ||
      data.reason === 'suspended';
    return {
      screenName,
      name: '',
      description: '',
      protected: false,
      suspended,
    };
  }

  const profile = data.profile ?? data.user;
  if (!profile?.screen_name) return null;

  return {
    screenName: profile.screen_name,
    name: profile.name ?? '',
    description: profile.description ?? '',
    protected: profile.protected === true,
    suspended: false,
  };
}

export async function fetchFxStatuses(handle: string): Promise<FxStatus[]> {
  const screenName = stripHandle(handle);
  const data = await fetchFxJson<FxStatusesResponse>(
    `${FX_BASE}/2/profile/${screenName}/statuses`,
  );
  if (!data?.results) return [];

  return data.results
    .filter((item) => item.type === 'status' && item.text && item.id)
    .map((item) => ({
      id: item.id ?? '',
      text: item.text ?? '',
      url: item.url ?? `https://x.com/${screenName}/status/${item.id}`,
      createdAt: item.created_at ?? '',
      createdTimestamp: item.created_timestamp ?? 0,
      lang: item.lang ?? null,
      reposted: item.reposted_by != null,
    }));
}