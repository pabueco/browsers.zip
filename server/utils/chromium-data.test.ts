import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getSnapshotTargets,
  getRevisionDigitWidths,
  normalizeChromiumVersions,
  parseMainBranchPosition,
  parseSvnTrunkRevision,
  sortRevisionsByDistance,
} from "./chromium-data.ts";

test("extracts the main branch position from a release commit", () => {
  const message = [
    "Incrementing VERSION to 44.0.2403.157",
    "",
    "Cr-Commit-Position: refs/branch-heads/2403@{#614}",
    "Cr-Branched-From: abc-refs/heads/master@{#330231}",
  ].join("\n");

  assert.equal(parseMainBranchPosition(message), 330231);
});

test("extracts a pre-git trunk revision", () => {
  const message =
    "git-svn-id: svn://svn.chromium.org/chrome/trunk/src@164863 0039d316";

  assert.equal(parseSvnTrunkRevision(message), 164863);
});

test("normalizes releases and applies position fallbacks", () => {
  const versions = normalizeChromiumVersions({
    platform: "mac",
    releases: [
      {
        milestone: 100,
        version: "100.0.4896.127",
        time: 1_650_000_000_000,
        chromium_main_branch_position: null,
      },
      {
        milestone: 100,
        version: "100.0.4896.60",
        time: 1_640_000_000_000,
        chromium_main_branch_position: 1,
      },
      {
        milestone: 44,
        version: "44.0.2403.157",
        time: 1_440_000_000_000,
        chromium_main_branch_position: null,
      },
    ],
    milestones: [{ milestone: 100, chromium_main_branch_position: 972766 }],
    history: [
      {
        milestone: 44,
        branchPosition: 330231,
        sourceVersion: "44.0.2403.157",
      },
    ],
  });

  assert.deepEqual(
    versions.map(({ milestone, branchPosition, releaseVersion }) => ({
      milestone,
      branchPosition,
      releaseVersion,
    })),
    [
      {
        milestone: 100,
        branchPosition: 972766,
        releaseVersion: "100.0.4896.127",
      },
      {
        milestone: 44,
        branchPosition: 330231,
        releaseVersion: "44.0.2403.157",
      },
    ],
  );
});

test("does not offer pre-Apple-Silicon snapshots for mac-arm", () => {
  const versions = normalizeChromiumVersions({
    platform: "mac-arm",
    releases: [
      {
        milestone: 92,
        version: "92.0.4515.159",
        time: 1_630_000_000_000,
        chromium_main_branch_position: 885287,
      },
      {
        milestone: 91,
        version: "91.0.4472.164",
        time: 1_620_000_000_000,
        chromium_main_branch_position: 870763,
      },
    ],
    milestones: [],
    history: [],
  });

  assert.deepEqual(
    versions.map((version) => version.milestone),
    [92],
  );
});

test("prefers 64-bit Windows snapshots and retains the 32-bit fallback", () => {
  assert.deepEqual(getSnapshotTargets("windows"), [
    { directory: "Win_x64", filename: "chrome-win.zip", architecture: "x64" },
    { directory: "Win", filename: "chrome-win32.zip", architecture: "x86" },
  ]);
});

test("orders snapshot revisions by distance from the branch position", () => {
  assert.deepEqual(
    sortRevisionsByDistance([330240, 330226, 330231], 330231),
    [330231, 330226, 330240],
  );
});

test("separates snapshot searches by revision digit width", () => {
  assert.deepEqual(getRevisionDigitWidths(44_202, 1_000), [5]);
  assert.deepEqual(getRevisionDigitWidths(99_950, 1_000), [5, 6]);
});

test("historical manifest covers every milestone from 5 through 58", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../assets/chromium-history.json", import.meta.url),
      "utf8",
    ),
  ) as {
    schemaVersion: number;
    milestones: Array<{ milestone: number; branchPosition: number }>;
  };

  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(
    manifest.milestones.map(({ milestone }) => milestone),
    Array.from({ length: 54 }, (_, index) => index + 5),
  );
  assert.ok(
    manifest.milestones.every(
      (item, index) =>
        index === 0 ||
        item.branchPosition > manifest.milestones[index - 1]!.branchPosition,
    ),
  );
});
