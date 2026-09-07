import historicalData from "../assets/chromium-history.json";
import type {
  ChromiumChannel,
  ChromiumPlatform,
  ChromiumSnapshot,
  ChromiumVersionsResponse,
} from "../../shared/chromium.ts";
import {
  getRevisionDigitWidths,
  getSnapshotTargets,
  normalizeChromiumVersions,
  sortRevisionsByDistance,
  type ChromiumDashMilestone,
  type ChromiumDashRelease,
  type HistoricalChromiumMilestone,
  type SnapshotTarget,
} from "./chromium-data.ts";

const CHROMIUM_DASH_URL = "https://chromiumdash.appspot.com";
const SNAPSHOT_BUCKET = "chromium-browser-snapshots";
const STORAGE_API_URL = `https://storage.googleapis.com/storage/v1/b/${SNAPSHOT_BUCKET}/o`;
const SNAPSHOT_INDEX_URL = `https://commondatastorage.googleapis.com/${SNAPSHOT_BUCKET}/index.html`;

const RELEASE_PAGE_SIZE = 250;
const MAX_RELEASE_PAGES = 10;
const RELEASE_PAGE_BATCH_SIZE = 4;
const SNAPSHOT_SEARCH_RADII = [200, 1_000] as const;
const STORAGE_LIST_PAGE_SIZE = 1_000;
const MAX_STORAGE_LIST_PAGES = 3;

const DASH_PLATFORM: Record<ChromiumPlatform, string> = {
  windows: "Windows",
  mac: "Mac",
  "mac-arm": "Mac",
  linux: "Linux",
};

const history = historicalData.milestones as HistoricalChromiumMilestone[];

const fetchJson = async <T>(url: URL | string): Promise<T> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`Upstream request failed (${response.status}): ${url}`);
  }

  return response.json() as Promise<T>;
};

const fetchReleases = async (
  platform: ChromiumPlatform,
  channel: ChromiumChannel,
) => {
  const releases: ChromiumDashRelease[] = [];

  for (
    let firstPage = 0;
    firstPage < MAX_RELEASE_PAGES;
    firstPage += RELEASE_PAGE_BATCH_SIZE
  ) {
    const pageNumbers = Array.from(
      {
        length: Math.min(
          RELEASE_PAGE_BATCH_SIZE,
          MAX_RELEASE_PAGES - firstPage,
        ),
      },
      (_, index) => firstPage + index,
    );
    const batches = await Promise.all(
      pageNumbers.map(async (page) => {
        const url = new URL("/fetch_releases", CHROMIUM_DASH_URL);
        url.searchParams.set("platform", DASH_PLATFORM[platform]);
        url.searchParams.set("channel", channel);
        url.searchParams.set("num", String(RELEASE_PAGE_SIZE));
        url.searchParams.set("offset", String(page * RELEASE_PAGE_SIZE));

        const batch = await fetchJson<ChromiumDashRelease[]>(url);
        if (!Array.isArray(batch)) {
          throw new TypeError(`Unexpected Chromium Dash response from ${url}`);
        }
        return batch;
      }),
    );

    for (const batch of batches) {
      releases.push(...batch);
      if (batch.length < RELEASE_PAGE_SIZE) {
        return releases;
      }
    }
  }

  throw new Error(
    `Chromium release history exceeded ${MAX_RELEASE_PAGES} pages`,
  );
};

const fetchMilestones = async () => {
  const url = new URL("/fetch_milestones", CHROMIUM_DASH_URL);
  url.searchParams.set("only_branched", "true");

  const milestones = await fetchJson<ChromiumDashMilestone[]>(url);
  if (!Array.isArray(milestones)) {
    throw new TypeError(`Unexpected Chromium Dash response from ${url}`);
  }

  return milestones;
};

export const getChromiumVersions = async (
  platform: ChromiumPlatform,
  channel: ChromiumChannel,
): Promise<ChromiumVersionsResponse> => {
  const [releases, milestones] = await Promise.all([
    fetchReleases(platform, channel),
    fetchMilestones(),
  ]);

  return {
    platform,
    channel,
    fetchedAt: new Date().toISOString(),
    versions: normalizeChromiumVersions({
      platform,
      releases,
      milestones,
      history,
    }),
  };
};

type StorageListResponse = {
  items?: Array<{ name?: string }>;
  nextPageToken?: string;
};

const listSnapshotRevisions = async (
  target: SnapshotTarget,
  branchPosition: number,
  radius: number,
) => {
  const minimumRevision = Math.max(1, branchPosition - radius);
  const maximumRevision = branchPosition + radius;

  const results = await Promise.all(
    getRevisionDigitWidths(branchPosition, radius).map(async (digitWidth) => {
      const revisions: number[] = [];
      let pageToken: string | undefined;
      let page = 0;

      do {
        const url = new URL(STORAGE_API_URL);
        url.searchParams.set("prefix", `${target.directory}/`);
        url.searchParams.set(
          "matchGlob",
          `${target.directory}/${"?".repeat(digitWidth)}/${target.filename}`,
        );
        url.searchParams.set(
          "startOffset",
          `${target.directory}/${minimumRevision}/`,
        );
        url.searchParams.set(
          "endOffset",
          `${target.directory}/${maximumRevision + 1}/`,
        );
        url.searchParams.set("fields", "items(name),nextPageToken");
        url.searchParams.set("maxResults", String(STORAGE_LIST_PAGE_SIZE));
        if (pageToken) {
          url.searchParams.set("pageToken", pageToken);
        }

        const data = await fetchJson<StorageListResponse>(url);
        for (const item of data.items ?? []) {
          const revision = Number(item.name?.split("/")[1]);
          if (Number.isInteger(revision) && revision > 0) {
            revisions.push(revision);
          }
        }
        pageToken = data.nextPageToken;
        page++;

        if (pageToken && page >= MAX_STORAGE_LIST_PAGES) {
          throw new Error(`Snapshot range exceeded ${MAX_STORAGE_LIST_PAGES} pages`);
        }
      } while (pageToken);

      return revisions;
    }),
  );

  return results.flat();
};

const snapshotDownloadUrl = (target: SnapshotTarget, revision: number) =>
  `https://storage.googleapis.com/${SNAPSHOT_BUCKET}/${target.directory}/${revision}/${target.filename}`;

const resolveForTarget = async (
  target: SnapshotTarget,
  branchPosition: number,
) => {
  for (const radius of SNAPSHOT_SEARCH_RADII) {
    const revisions = await listSnapshotRevisions(
      target,
      branchPosition,
      radius,
    );
    const available = sortRevisionsByDistance(revisions, branchPosition)[0];
    if (available !== undefined) {
      return available;
    }
  }
};

export const getChromiumSnapshot = async (
  platform: ChromiumPlatform,
  branchPosition: number,
): Promise<ChromiumSnapshot | undefined> => {
  for (const target of getSnapshotTargets(platform)) {
    const revision = await resolveForTarget(target, branchPosition);
    if (revision === undefined) {
      continue;
    }

    const directoryUrl = new URL(SNAPSHOT_INDEX_URL);
    directoryUrl.searchParams.set(
      "prefix",
      `${target.directory}/${revision}/`,
    );

    return {
      branchPosition,
      revision,
      distance: Math.abs(revision - branchPosition),
      architecture: target.architecture,
      directoryUrl: directoryUrl.toString(),
      downloadUrl: snapshotDownloadUrl(target, revision),
    };
  }
};
