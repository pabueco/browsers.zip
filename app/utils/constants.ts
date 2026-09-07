import {
  CHROMIUM_CHANNELS as chromiumChannels,
  CHROMIUM_PLATFORMS,
} from "~~/shared/chromium";

export const CHROMIUM_CHANNELS = chromiumChannels.map(
  (b) => ({
    label: b.charAt(0).toUpperCase() + b.slice(1),
    value: b,
  })
);

export const FIREFOX_CHANNELS = [
  "Stable",
  "Dev",
  "ESR",
  // "Nighly"
].map((b) => ({
  label: b,
  value: b.toLocaleLowerCase(),
}));

export const PLATFORMS = CHROMIUM_PLATFORMS;
export const PLATFORM_OPTIONS = [
  {
    label: "Windows",
    value: "windows",
  },
  {
    label: "Mac (Intel)",
    value: "mac",
  },
  {
    label: "Mac (Apple Silicon)",
    value: "mac-arm",
  },
  {
    label: "Linux",
    value: "linux",
  },
  // {
  //   label: "Android",
  //   value: "android",
  // },
];

export const BROWSERS = ["chromium", "firefox"] as const;
export const BROWSER_OPTIONS = BROWSERS.map((b) => ({
  label: b.charAt(0).toUpperCase() + b.slice(1),
  value: b,
}));

export const FIREFOX_PLATFORM_DIRNAME: Record<string, string> = {
  mac: "mac",
  "mac-arm": "mac",
  windows: "win64",
  linux: "linux-x86_64",
  android: "android-x86_64",
};
