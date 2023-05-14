<script lang="ts" setup>
import { groupBy, last, mapValues, uniqBy } from "lodash-es";
import { Detector } from "detector-js";

useHead({
  htmlAttrs: {
    class: "dark",
  },
});
const ucfirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const getCurrentPlatform = () => {
  const detector = new Detector();

  const osName = (detector.os as any).name.toLocaleLowerCase();

  if (osName.includes("windows")) {
    return "windows";
  }

  if (osName.includes("linux")) {
    return "mac";
  }

  if (osName.includes("mac")) {
    return (detector.cpu as any).platform?.includes("intel")
      ? "mac"
      : "mac-arm";
  }

  return PLATFORMS[0].value;
};
const languages = usePreferredLanguages();

type FirefoxRelease = {
  build_number: number;
  category: "dev" | "stability" | "esr";
  date: string;
  description: null | string;
  is_security_driven: boolean;
  product: "devedition" | "firefox";
  version: string;
};

type ChromiumRelease = {
  channel: (typeof CHROMIUM_CHANNELS)[number]["value"];
  chromium_main_branch_position: number;
  hashes: Record<string, string>;
  milestone: number;
  platform: (typeof PLATFORMS)[number]["value"];
  time: number;
  version: string;
  previous_version: string;
};

const FETCH_RELEASES_COUNT = 100;

const CHROMIUM_PLATFORM_API_NAME: Record<string, string> = {
  mac: "Mac",
  "mac-arm": "Mac",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
};

const CHROMIUM_PLATFORM_DIRNAME: Record<string, string> = {
  mac: "Mac",
  "mac-arm": "Mac_Arm",
  windows: "Win_x64",
  linux: "Linux_x64",
  // android: "Android",
};

const CHROMIUM_PLATFORM_FILENAME: Record<string, string> = {
  mac: "chrome-mac.zip",
  "mac-arm": "chrome-mac.zip",
  windows: "chrome-win.zip",
  linux: "chrome-linux.zip",
  // android: "chrome-android.zip",
};

const FIREFOX_PLATFORM_DIRNAME: Record<string, string> = {
  mac: "mac",
  "mac-arm": "mac",
  windows: "win64",
  linux: "linux-x86_64",
  android: "android-x86_64",
};

const BROWSERS = ["chromium", "firefox"];
const BROWSER_OPTIONS = BROWSERS.map((b) => ({
  label: ucfirst(b),
  value: b,
}));
const browser = ref(BROWSERS[0]);
const selectedBrowser = computed(() => {
  return BROWSER_OPTIONS.find((b) => b.value === browser.value);
});

const PLATFORMS = [
  {
    label: "Windows",
    value: "windows",
  },
  {
    label: "Mac",
    value: "mac",
  },
  {
    label: "Mac Arm",
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

const platform = ref(PLATFORMS[0].value);

const versions = ref<any[]>([]);
const version = ref();
const selectedVersion = computed(() => {
  return versions.value.find((v) => v.value === version.value);
});

const versionDisplay = computed(() => {
  return selectedVersion.value?.label;
});

const CHROMIUM_CHANNELS = ["Stable", "Beta", "Dev", "Canary"].map((b) => ({
  label: b,
  value: b.toLocaleLowerCase(),
}));
const FIREFOX_CHANNELS = [
  "Stable",
  "Dev",
  "ESR",
  // "Nighly"
].map((b) => ({
  label: b,
  value: b.toLocaleLowerCase(),
}));
const channels = computed(() => {
  return browser.value === "chromium" ? CHROMIUM_CHANNELS : FIREFOX_CHANNELS;
});
const channel = ref(CHROMIUM_CHANNELS[0].value);

const isFetchingVersions = ref(false);
const isLookingUp = ref(false);

watch(browser, () => {
  channel.value = channels.value[0].value;
});

watch(
  [browser, channel, platform],
  async () => {
    isFetchingVersions.value = true;
    showResult.value = false;

    version.value = null;
    versions.value = [];

    const action = {
      chromium: async () => await fetchChromiumReleases(),
      firefox: async () => await fetchFirefoxReleases(),
    }[browser.value] as any;

    versions.value = await action();

    version.value = versions.value[0].value;

    isFetchingVersions.value = false;
  },
  {
    // immediate: true
  }
);

let firefoxReleases: {
  [key: string]: Record<string, any>;
};
const fetchFirefoxReleases = async () => {
  let data = firefoxReleases;

  if (!data) {
    const { releases } = await $fetch<{
      releases: Record<string, FirefoxRelease>;
    }>("https://product-details.mozilla.org/1.0/all.json");

    const byCatByVersion = mapValues(
      groupBy(
        Object.values(releases).filter(
          (item: any) => item.product === "firefox"
        ),
        "category"
      ),
      (items) =>
        mapValues(
          groupBy(items, (x) => x.version.split(".")[0]),
          (values: any) => {
            return last(
              values.sort((a: any, b: any) => {
                return a.version.localeCompare(b.version, undefined, {
                  numeric: true,
                  sensitivity: "base",
                });
              })
            );
          }
        )
    );

    data = {
      stable: Object.values(byCatByVersion.stability),
      dev: Object.values(byCatByVersion.dev),
      esr: Object.values(byCatByVersion.esr),
    };
    firefoxReleases = data;
  }

  return data[channel.value as any]
    ?.map((item: any) => ({
      label: item.version,
      value: item.version,
    }))
    .reverse();
};

const fetchChromiumReleases = async () => {
  const data = {
    browser: ucfirst(browser.value),
    channel: ucfirst(channel.value),
    platform: CHROMIUM_PLATFORM_API_NAME[platform.value],
  };

  version.value = null;
  versions.value = [];

  const responseData = await $fetch<ChromiumRelease[]>(
    `https://chromiumdash.appspot.com/fetch_releases?channel=${data.channel}&platform=${data.platform}&num=${FETCH_RELEASES_COUNT}`
  );

  return uniqBy(responseData, "chromium_main_branch_position").map(
    (v: any) => ({
      ...v,
      label: v.milestone,
      value: v.chromium_main_branch_position,
    })
  );
};

const buildChromiumLinks = (revision: number) => {
  let platformFormatted = CHROMIUM_PLATFORM_DIRNAME[platform.value];
  const base = `https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=${platformFormatted}/${revision}/`;

  const downloadUrl = `https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/${platformFormatted}%2F${revision}%2F${
    CHROMIUM_PLATFORM_FILENAME[platform.value]
  }?alt=media`;

  return {
    directoryUrl: base,
    downloadUrl,
  };
};

const findChromiumSnapshotRevision = async (version: number | string) => {
  const startRevision = Number(version);
  let revision = startRevision;

  const maxTries = 50;
  let tries = 0;

  const makeRequest = async (revision: number) => {
    const checkUrl = `https://www.googleapis.com/storage/v1/b/chromium-browser-snapshots/o/${
      CHROMIUM_PLATFORM_DIRNAME[platform.value]
    }%2F${revision}%2F${CHROMIUM_PLATFORM_FILENAME[platform.value]}`;
    const res = await fetch(checkUrl, {
      method: "HEAD",
    });
    return res;
  };

  while (tries < maxTries) {
    const res = await makeRequest(revision);
    if (res.status === 200) {
      return revision;
    }
    revision++;
    tries++;
  }

  tries = 0;
  while (tries < maxTries) {
    const res = await makeRequest(revision);
    if (res.status === 200) {
      return revision;
    }
    revision--;
    tries++;
  }

  throw new Error(`Could not find revision for version ${version}`);
};

const lookup = async () => {
  isLookingUp.value = true;
  showResult.value = false;

  switch (browser.value) {
    case "chromium":
      const revision = await findChromiumSnapshotRevision(version.value);
      const links = buildChromiumLinks(revision);
      result.value = {
        revision,
        ...links,
      };
      break;
    case "firefox":
      const url = `https://ftp.mozilla.org/pub/firefox/releases/${
        version.value
      }/${FIREFOX_PLATFORM_DIRNAME[platform.value]}/${
        languages.value[0] ?? "en-US"
      }/`;
      result.value = {
        revision: version.value,
        directoryUrl: url,
        downloadUrl: `${url}Firefox Setup ${version.value}.exe`,
      };
      break;
  }

  isLookingUp.value = false;
  showResult.value = true;

  ElMessage({
    message: "Found matching version.",
    type: "success",
  });
};

const showResult = ref(false);
const result = ref<any>({
  revision: "",
  directoryUrl: "",
  downloadUrl: "",
});

const displayedVersions = computed(() => {
  return versions.value;
});
</script>

<template>
  <div class="min-h-screen bg-gray-950 flex items-center">
    <div class="mx-auto max-w-xl py-20">
      <div class="mb-8">
        <h1 class="font-bold text-5xl">Browser Download Tool</h1>
      </div>
      <div class="flex space-x-2 mb-8">
        <el-select
          v-model="platform"
          placeholder="Select platform"
          size="large"
          filterable
        >
          <el-option
            v-for="item in PLATFORMS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select
          v-model="browser"
          placeholder="Select browser"
          size="large"
          class="w-32 shrink-0"
        >
          <el-option
            v-for="item in BROWSER_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-select
          v-model="channel"
          placeholder="Select channel"
          size="large"
          filterable
          class="w-24 shrink-0"
        >
          <el-option
            v-for="item in channels"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-select
          v-model="version"
          placeholder="Version"
          size="large"
          :loading="isFetchingVersions"
          filterable
          :disabled="isFetchingVersions"
          class="w-28 shrink-0"
        >
          <el-option
            v-for="(item, i) in displayedVersions"
            :key="i"
            :label="item.label"
            :value="item.value"
          >
            <!-- <div class="flex justify-between items-center">
              <div>{{ item.milestone }}</div>
              <div class="opacity-60">{{ item.version }}</div>
            </div> -->
          </el-option>
        </el-select>
        <div class="">
          <el-button
            type="primary"
            size="large"
            @click="lookup"
            :disabled="
              !browser || !channel || !platform || !version || isLookingUp
            "
          >
            Lookup
          </el-button>
        </div>
      </div>

      <el-collapse-transition>
        <div v-if="showResult">
          <div class="w-full rounded-xl border border-gray-800 p-8">
            <div class="space-y-6">
              <h class="font-bold text-2xl"
                >{{ selectedBrowser?.label }} {{ versionDisplay }}</h
              >

              <el-button
                tag="a"
                :href="result.downloadUrl"
                target="_blank"
                type="primary"
                size="large"
                class="w-full"
              >
                Download
              </el-button>

              <div class="space-y-4 text-sm">
                <div>
                  <h5 class="font-bold">Download URL:</h5>
                  <a
                    :href="result.downloadUrl"
                    target="_blank"
                    class="block text-gray-400 transition hover:text-gray-200"
                    >{{ result.downloadUrl }}</a
                  >
                </div>
                <div>
                  <h5 class="font-bold">Source URL:</h5>
                  <a
                    :href="result.directoryUrl"
                    target="_blank"
                    class="block text-gray-400 transition hover:text-gray-200"
                    >{{ result.directoryUrl }}</a
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-collapse-transition>
    </div>
  </div>
</template>
