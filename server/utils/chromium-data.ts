import type {
  ChromiumPlatform,
  ChromiumVersion,
} from "../../shared/chromium.ts";

export type ChromiumDashRelease = {
  milestone: number;
  version: string;
  time: number;
  chromium_main_branch_position: number | null;
  hashes?: Record<string, string>;
};

export type ChromiumDashMilestone = {
  milestone: number;
  chromium_main_branch_position: number | null;
};

export type HistoricalChromiumMilestone = {
  milestone: number;
  branchPosition: number;
  sourceVersion: string;
};

export type SnapshotTarget = {
  directory: string;
  filename: string;
  architecture: "arm64" | "x64" | "x86";
};

const MINIMUM_MILESTONE: Record<ChromiumPlatform, number> = {
  windows: 5,
  mac: 5,
  "mac-arm": 92,
  linux: 5,
};

const SNAPSHOT_TARGETS: Record<ChromiumPlatform, readonly SnapshotTarget[]> = {
  windows: [
    {
      directory: "Win_x64",
      filename: "chrome-win.zip",
      architecture: "x64",
    },
    {
      directory: "Win",
      filename: "chrome-win32.zip",
      architecture: "x86",
    },
  ],
  mac: [
    { directory: "Mac", filename: "chrome-mac.zip", architecture: "x64" },
  ],
  "mac-arm": [
    {
      directory: "Mac_Arm",
      filename: "chrome-mac.zip",
      architecture: "arm64",
    },
  ],
  linux: [
    {
      directory: "Linux_x64",
      filename: "chrome-linux.zip",
      architecture: "x64",
    },
  ],
};

const positiveInteger = (value: number | null | undefined) =>
  Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;

export const parseMainBranchPosition = (message: string) => {
  const matches = message.matchAll(
    /Cr-Branched-From: .*?-refs\/heads\/(?:main|master)@\{#(\d+)\}/g,
  );

  let position: number | undefined;
  for (const match of matches) {
    position = Number(match[1]);
  }

  return positiveInteger(position);
};

export const parseSvnTrunkRevision = (message: string) => {
  const match = message.match(
    /git-svn-id: svn:\/\/svn\.chromium\.org\/chrome\/trunk\/src@(\d+) /,
  );

  return positiveInteger(match ? Number(match[1]) : undefined);
};

export const normalizeChromiumVersions = ({
  platform,
  releases,
  milestones,
  history,
}: {
  platform: ChromiumPlatform;
  releases: ChromiumDashRelease[];
  milestones: ChromiumDashMilestone[];
  history: HistoricalChromiumMilestone[];
}): ChromiumVersion[] => {
  const milestonePositions = new Map(
    milestones.map((item) => [
      item.milestone,
      positiveInteger(item.chromium_main_branch_position),
    ]),
  );
  const historicalPositions = new Map(
    history.map((item) => [item.milestone, item.branchPosition]),
  );
  const releasesByMilestone = new Map<number, ChromiumDashRelease>();

  for (const release of [...releases].sort((a, b) => b.time - a.time)) {
    if (!releasesByMilestone.has(release.milestone)) {
      releasesByMilestone.set(release.milestone, release);
    }
  }

  return [...releasesByMilestone.values()]
    .map((release) => {
      const branchPosition =
        positiveInteger(release.chromium_main_branch_position) ??
        milestonePositions.get(release.milestone) ??
        historicalPositions.get(release.milestone);

      if (
        !branchPosition ||
        release.milestone < MINIMUM_MILESTONE[platform] ||
        !Number.isFinite(release.time)
      ) {
        return undefined;
      }

      return {
        milestone: release.milestone,
        branchPosition,
        releaseVersion: release.version,
        releaseDate: new Date(release.time).toISOString(),
      };
    })
    .filter((version): version is ChromiumVersion => Boolean(version))
    .sort((a, b) => b.milestone - a.milestone);
};

export const getSnapshotTargets = (platform: ChromiumPlatform) =>
  SNAPSHOT_TARGETS[platform].map((target) => ({ ...target }));

export const sortRevisionsByDistance = (
  revisions: number[],
  branchPosition: number,
) =>
  [...revisions].sort((a, b) => {
    const distance = Math.abs(a - branchPosition) - Math.abs(b - branchPosition);
    return distance || a - b;
  });

export const getRevisionDigitWidths = (
  branchPosition: number,
  radius: number,
) => {
  const minimumWidth = String(Math.max(1, branchPosition - radius)).length;
  const maximumWidth = String(branchPosition + radius).length;

  return Array.from(
    { length: maximumWidth - minimumWidth + 1 },
    (_, index) => minimumWidth + index,
  );
};
