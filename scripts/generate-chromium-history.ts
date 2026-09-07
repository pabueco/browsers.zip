import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseMainBranchPosition,
  parseSvnTrunkRevision,
  type ChromiumDashRelease,
  type HistoricalChromiumMilestone,
} from "../server/utils/chromium-data.ts";

const FIRST_CHROMIUM_MILESTONE = 5;
const LAST_LEGACY_MILESTONE = 58;
const FIRST_GIT_COMMIT_POSITION_MILESTONE = 37;
const RELEASE_PAGE_SIZE = 250;
const MAX_RELEASE_PAGES = 10;
const GITILES_LOG_PAGE_SIZE = 1_000;
const MAX_GITILES_LOG_PAGES = 4;
const CONCURRENCY = 2;
const MAX_REQUEST_ATTEMPTS = 5;

const CHROMIUM_DASH_URL = "https://chromiumdash.appspot.com";
const CHROMIUM_GITILES_URL =
  "https://chromium.googlesource.com/chromium/src";

type GitilesCommit = {
  message: string;
  parents?: string[];
};

type GitilesLog = {
  log?: GitilesCommit[];
  next?: string;
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  scriptDirectory,
  "../server/assets/chromium-history.json",
);

const fetchText = async (url: URL | string) => {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (response.ok) {
      return response.text();
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_REQUEST_ATTEMPTS) {
      throw new Error(`Request failed (${response.status}): ${url}`);
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    const delay = Number.isFinite(retryAfter)
      ? retryAfter * 1_000
      : 2 ** (attempt - 1) * 1_000;
    await response.arrayBuffer();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  }

  throw new Error(`Request failed after retries: ${url}`);
};

const fetchJson = async <T>(url: URL | string): Promise<T> =>
  JSON.parse((await fetchText(url)).replace(/^\)\]\}'\n/, "")) as T;

const fetchHistoricalReleases = async () => {
  const releases: ChromiumDashRelease[] = [];

  for (let page = 0; page < MAX_RELEASE_PAGES; page++) {
    const url = new URL("/fetch_releases", CHROMIUM_DASH_URL);
    url.searchParams.set("channel", "Stable");
    url.searchParams.set("platform", "Mac");
    url.searchParams.set("num", String(RELEASE_PAGE_SIZE));
    url.searchParams.set("offset", String(page * RELEASE_PAGE_SIZE));

    const batch = await fetchJson<ChromiumDashRelease[]>(url);
    if (!Array.isArray(batch)) {
      throw new TypeError(`Unexpected Chromium Dash response from ${url}`);
    }

    releases.push(...batch);
    if (batch.length < RELEASE_PAGE_SIZE) {
      return releases;
    }
  }

  throw new Error(
    `Chromium Dash history exceeded ${MAX_RELEASE_PAGES} pages; raise the safety limit`,
  );
};

const fetchCommit = (revision: string) =>
  fetchJson<GitilesCommit>(
    `${CHROMIUM_GITILES_URL}/+/${revision}?format=JSON`,
  );

const resolvePositionFromCommitHistory = async (version: string) => {
  let revision = `refs/tags/${version}`;

  for (let depth = 0; depth < 10; depth++) {
    const commit = await fetchCommit(revision);
    const position = parseMainBranchPosition(commit.message);
    if (position) {
      return position;
    }

    const parent = commit.parents?.[0];
    if (!parent) {
      break;
    }
    revision = parent;
  }
};

const resolvePositionFromSvnHistory = async (version: string) => {
  let cursor: string | undefined;

  for (let page = 0; page < MAX_GITILES_LOG_PAGES; page++) {
    const url = new URL(
      `${CHROMIUM_GITILES_URL}/+log/refs/tags/${version}`,
    );
    url.searchParams.set("format", "JSON");
    url.searchParams.set("n", String(GITILES_LOG_PAGE_SIZE));
    if (cursor) {
      url.searchParams.set("s", cursor);
    }

    const data = await fetchJson<GitilesLog>(url);
    for (const commit of data.log ?? []) {
      const position =
        parseMainBranchPosition(commit.message) ??
        parseSvnTrunkRevision(commit.message);
      if (position) {
        return position;
      }
    }

    if (!data.next) {
      break;
    }
    cursor = data.next;
  }
};

const resolveBranchPosition = async (version: string, milestone: number) => {
  if (milestone < FIRST_GIT_COMMIT_POSITION_MILESTONE) {
    return resolvePositionFromSvnHistory(version);
  }

  return (
    (await resolvePositionFromCommitHistory(version)) ??
    (await resolvePositionFromSvnHistory(version))
  );
};

const mapWithConcurrency = async <T, R>(
  values: T[],
  mapper: (value: T) => Promise<R>,
) => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      const value = values[index];
      if (value !== undefined) {
        results[index] = await mapper(value);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, values.length) }, worker),
  );
  return results;
};

const main = async () => {
  const releases = await fetchHistoricalReleases();
  const releasesByMilestone = new Map<number, ChromiumDashRelease>();

  for (const release of [...releases].sort((a, b) => b.time - a.time)) {
    if (
      release.milestone >= FIRST_CHROMIUM_MILESTONE &&
      release.milestone <= LAST_LEGACY_MILESTONE &&
      !releasesByMilestone.has(release.milestone)
    ) {
      releasesByMilestone.set(release.milestone, release);
    }
  }

  const expectedMilestones = Array.from(
    { length: LAST_LEGACY_MILESTONE - FIRST_CHROMIUM_MILESTONE + 1 },
    (_, index) => index + FIRST_CHROMIUM_MILESTONE,
  );

  const milestones = await mapWithConcurrency(
    expectedMilestones,
    async (milestone): Promise<HistoricalChromiumMilestone> => {
      const release = releasesByMilestone.get(milestone);
      if (!release) {
        throw new Error(`No Stable Chromium release found for milestone ${milestone}`);
      }

      const branchPosition = await resolveBranchPosition(
        release.version,
        milestone,
      );
      if (!branchPosition) {
        throw new Error(
          `Could not resolve a branch position for Chromium ${release.version}`,
        );
      }

      process.stdout.write(`M${milestone}: ${branchPosition}\n`);
      return {
        milestone,
        branchPosition,
        sourceVersion: release.version,
      };
    },
  );

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ schemaVersion: 1, milestones }, null, 2)}\n`,
  );
  process.stdout.write(`Wrote ${milestones.length} milestones to ${outputPath}\n`);
};

await main();
