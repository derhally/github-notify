import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { GitHubPR, getPRKey, isOctokitError } from '../shared/types';
import { log } from './logger';

const ThrottledOctokit = Octokit.plugin(throttling);

let octokit: InstanceType<typeof ThrottledOctokit> | null = null;
let cachedUsername: string | null = null;
let currentToken: string | null = null;

interface ETagCache {
  etag: string | null;
  data: GitHubPR[];
}

type CacheKey = 'assigned' | 'reviewRequested';

const etagCaches: Record<CacheKey, ETagCache> = {
  assigned: { etag: null, data: [] },
  reviewRequested: { etag: null, data: [] },
};

type SearchResultItem = Awaited<
  ReturnType<InstanceType<typeof ThrottledOctokit>['rest']['search']['issuesAndPullRequests']>
>['data']['items'][number];

function parseSearchResults(items: SearchResultItem[]): GitHubPR[] {
  return items
    .filter((item) => item.pull_request)
    .map((item) => {
      const repoMatch = item.repository_url.match(/repos\/(.+)$/);
      const repoFullName = repoMatch ? repoMatch[1] : 'unknown/unknown';

      return {
        number: item.number,
        title: item.title,
        repoFullName,
        author: item.user?.login || 'unknown',
        url: item.pull_request?.html_url || item.html_url,
      };
    });
}

export function initOctokit(token: string): void {
  if (currentToken === token && octokit) return;

  currentToken = token;
  cachedUsername = null;
  etagCaches.assigned = { etag: null, data: [] };
  etagCaches.reviewRequested = { etag: null, data: [] };
  octokit = new ThrottledOctokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter, options, _octokit, retryCount) => {
        const opts = options as { method: string; url: string };
        log(`Rate limit hit for ${opts.method} ${opts.url}`);
        if (retryCount < 2) {
          log(`Retrying after ${retryAfter} seconds`);
          return true;
        }
        return false;
      },
      onSecondaryRateLimit: (_retryAfter, options) => {
        const opts = options as { method: string; url: string };
        log(`Secondary rate limit for ${opts.method} ${opts.url}`);
        return false;
      },
    },
  });
}

export async function getAuthenticatedUser(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  if (!octokit) throw new Error('Octokit not initialized');

  const { data } = await octokit.rest.users.getAuthenticated();
  cachedUsername = data.login;
  return cachedUsername;
}

async function searchPRs(
  query: string,
  cacheKey: CacheKey,
): Promise<{ prs: GitHubPR[]; changed: boolean }> {
  if (!octokit) throw new Error('Octokit not initialized');

  const cache = etagCaches[cacheKey];
  const headers: Record<string, string> = {};
  if (cache.etag) {
    headers['if-none-match'] = cache.etag;
  }

  try {
    const response = await octokit.rest.search.issuesAndPullRequests({
      q: query,
      sort: 'updated',
      order: 'desc',
      per_page: 100,
      headers,
    });

    const etag = response.headers.etag || null;
    const prs = parseSearchResults(response.data.items);

    etagCaches[cacheKey] = { etag, data: prs };
    return { prs, changed: true };
  } catch (error: unknown) {
    if (isOctokitError(error) && error.status === 304) {
      return { prs: cache.data, changed: false };
    }
    throw error;
  }
}

export async function fetchAssignedPRs(username: string): Promise<{ prs: GitHubPR[]; changed: boolean }> {
  return searchPRs(`is:pr is:open assignee:${username}`, 'assigned');
}

export async function fetchReviewRequestedPRs(username: string): Promise<{ prs: GitHubPR[]; changed: boolean }> {
  return searchPRs(`is:pr is:open review-requested:${username}`, 'reviewRequested');
}

export async function testConnection(token: string): Promise<{ success: boolean; username?: string; message: string }> {
  try {
    const tempOctokit = new Octokit({ auth: token });
    const { data } = await tempOctokit.rest.users.getAuthenticated();
    return { success: true, username: data.login, message: `Connected as ${data.login}` };
  } catch (error: unknown) {
    if (isOctokitError(error) && error.status === 401) {
      return { success: false, message: 'Invalid token. Please check your PAT.' };
    }
    const message = error instanceof Error ? error.message : 'Connection failed';
    return { success: false, message };
  }
}

export function deduplicatePRs(assigned: GitHubPR[], reviewRequested: GitHubPR[]): GitHubPR[] {
  const seen = new Set<string>();
  const result: GitHubPR[] = [];

  for (const pr of assigned) {
    const key = getPRKey(pr);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(pr);
    }
  }
  for (const pr of reviewRequested) {
    const key = getPRKey(pr);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(pr);
    }
  }

  return result;
}
