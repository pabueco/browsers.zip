export const CHROMIUM_PLATFORMS = [
  "windows",
  "mac",
  "mac-arm",
  "linux",
] as const;

export const CHROMIUM_CHANNELS = ["stable", "beta", "dev", "canary"] as const;

export type ChromiumPlatform = (typeof CHROMIUM_PLATFORMS)[number];
export type ChromiumChannel = (typeof CHROMIUM_CHANNELS)[number];

export const isChromiumPlatform = (
  value: unknown,
): value is ChromiumPlatform =>
  typeof value === "string" &&
  CHROMIUM_PLATFORMS.includes(value as ChromiumPlatform);

export const isChromiumChannel = (value: unknown): value is ChromiumChannel =>
  typeof value === "string" &&
  CHROMIUM_CHANNELS.includes(value as ChromiumChannel);

export type ChromiumVersion = {
  milestone: number;
  branchPosition: number;
  releaseVersion: string;
  releaseDate: string;
};

export type ChromiumVersionsResponse = {
  platform: ChromiumPlatform;
  channel: ChromiumChannel;
  fetchedAt: string;
  versions: ChromiumVersion[];
};

export type ChromiumSnapshot = {
  branchPosition: number;
  revision: number;
  distance: number;
  architecture: "arm64" | "x64" | "x86";
  directoryUrl: string;
  downloadUrl: string;
};
