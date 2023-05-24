export const CHROMIUM_CHANNELS = ["Stable", "Beta", "Dev", "Canary"].map(
  (b) => ({
    label: b,
    value: b.toLocaleLowerCase(),
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

export const PLATFORMS = [
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
  label: ucfirst(b),
  value: b,
}));

export const CHROMIUM_PLATFORM_API_NAME: Record<string, string> = {
  mac: "Mac",
  "mac-arm": "Mac",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
};

export const CHROMIUM_PLATFORM_DIRNAME: Record<string, string> = {
  mac: "Mac",
  "mac-arm": "Mac_Arm",
  windows: "Win_x64",
  linux: "Linux_x64",
  // android: "Android",
};

export const CHROMIUM_PLATFORM_FILENAME: Record<string, string> = {
  mac: "chrome-mac.zip",
  "mac-arm": "chrome-mac.zip",
  windows: "chrome-win.zip",
  linux: "chrome-linux.zip",
  // android: "chrome-android.zip",
};

export const FIREFOX_PLATFORM_DIRNAME: Record<string, string> = {
  mac: "mac",
  "mac-arm": "mac",
  windows: "win64",
  linux: "linux-x86_64",
  android: "android-x86_64",
};
