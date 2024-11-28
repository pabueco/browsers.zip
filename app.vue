<script lang="ts" setup>
import { groupBy, last, mapValues, uniqBy } from "lodash-es";
import dayjs from "dayjs";
import "./assets/index.scss";
import { Version, FirefoxRelease, ChromiumRelease } from "./types";

const CHROMIUM_FETCH_RELEASES_COUNT = 250;
const CHROMIUM_FIND_REVISION_MAX_ATTMEPTS = 150;

useHead({
  title: "Browser Download Tool",
  meta: [
    {
      name: "description",
      content:
        "Easily download any version of chromium or firefox directly from the source.",
    },
  ],
  htmlAttrs: {
    class: "dark font-mono",
  },
  script: [
    {
      src: "https://reasonable.pabue.workers.dev/js/script.js",
      "data-domain": "browsers.zip",
    },
  ],
});

const languages = usePreferredLanguages();

const browser = ref<(typeof BROWSERS)[number]>();
const selectedBrowser = computed(() => {
  return BROWSER_OPTIONS.find((b) => b.value === browser.value);
});
const browserOptions = computed(() => BROWSER_OPTIONS);

const platform = ref<(typeof PLATFORMS)[number]>(getCurrentPlatform());
const platformOptions = computed(() => PLATFORM_OPTIONS);

const versions = ref<Version[]>([]);
const version = ref<Version["value"]>();
const selectedVersion = computed(() => {
  return versions.value.find((v) => v.value === version.value);
});

const versionDisplay = computed(() => {
  return selectedVersion.value?.fullVersion;
});

const channels = computed(() => {
  return browser.value === "chromium" ? CHROMIUM_CHANNELS : FIREFOX_CHANNELS;
});

const channel = ref(CHROMIUM_CHANNELS[0].value);

const isFetchingVersions = ref(false);
const isLookingUp = ref(false);

watch(browser, () => {
  channel.value = channels.value[0].value;
});

watch(version, () => {
  showResult.value = false;
});

watch(
  [browser, channel, platform],
  async () => {
    isFetchingVersions.value = true;
    showResult.value = false;

    version.value = undefined;
    versions.value = [];

    if (!browser.value) return;

    const action = {
      chromium: async () => await fetchChromiumReleases(),
      firefox: async () => await fetchFirefoxReleases(),
    }[browser.value];

    versions.value = await action();

    version.value = versions.value[0].value;

    isFetchingVersions.value = false;
  },
  {
    // immediate: true
  }
);

let firefoxReleases: {
  [key: string]: FirefoxRelease[];
};
const fetchFirefoxReleases = async (): Promise<Version[]> => {
  let data = firefoxReleases;

  if (!data) {
    const { releases } = await $fetchWithCache<{
      releases: Record<string, FirefoxRelease>;
    }>("https://product-details.mozilla.org/1.0/all.json");

    const byCatByVersion = mapValues(
      groupBy(
        Object.values(releases).filter((item) => item.product === "firefox"),
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
    ) as Record<string, Record<string, FirefoxRelease>>;

    data = {
      stable: Object.values(byCatByVersion.stability),
      dev: Object.values(byCatByVersion.dev),
      esr: Object.values(byCatByVersion.esr),
    };
    firefoxReleases = data;
  }

  return data[channel.value as any]
    ?.map((item) => ({
      label: item.version.split(".")[0],
      value: item.version,
      date: dayjs(item.date),
      fullVersion: item.version,
    }))
    .reverse();
};

let chromiumMilestones: {
  milestone: number;
  chromium_main_branch_position: number;
}[] = [];
const fetchChromiumReleases = async (): Promise<Version[]> => {
  const data = {
    browser: ucfirst(browser.value),
    channel: ucfirst(channel.value),
    platform: CHROMIUM_PLATFORM_API_NAME[platform.value],
  };

  version.value = undefined;
  versions.value = [];

  if (!chromiumMilestones.length) {
    chromiumMilestones = await $fetchWithCache(
      "https://chromiumdash.appspot.com/fetch_milestones?only_branched=true"
    );
  }

  const responseData = await $fetchWithCache<ChromiumRelease[]>(
    `https://chromiumdash.appspot.com/fetch_releases?channel=${data.channel}&platform=${data.platform}&num=${CHROMIUM_FETCH_RELEASES_COUNT}`
  );

  return uniqBy(
    responseData
      .map((v) => ({
        label: v.milestone.toString(),
        value:
          v.chromium_main_branch_position?.toString() ||
          chromiumMilestones
            .find((m) => m.milestone === v.milestone)
            ?.chromium_main_branch_position?.toString() ||
          "",
        date: dayjs.unix(v.time / 1000),
        fullVersion: v.version,
      }))
      .filter((v) => !!v.value),
    "value"
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

  const makeRequest = async (revision: number) => {
    const checkUrl = `https://www.googleapis.com/storage/v1/b/chromium-browser-snapshots/o/${
      CHROMIUM_PLATFORM_DIRNAME[platform.value]
    }%2F${revision}%2F${CHROMIUM_PLATFORM_FILENAME[platform.value]}`;
    const res = await fetch(checkUrl, {
      method: "HEAD",
    });
    return res;
  };

  const searchRevision = async (
    direction: "past" | "future",
    abortSignal: AbortSignal
  ) => {
    let attempts = 0;
    let revision = startRevision;

    while (
      attempts < CHROMIUM_FIND_REVISION_MAX_ATTMEPTS &&
      !abortSignal.aborted
    ) {
    const res = await makeRequest(revision);
    if (res.status === 200) {
      return revision;
    }
      revision += direction === "past" ? -1 : 1;
    attempts++;
  }
  };

  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  const revision = await Promise.any([
    searchRevision("past", abortSignal),
    searchRevision("future", abortSignal),
  ]);

  abortController.abort();

  if (revision) {
      return revision;
  }

  throw new Error(`Could not find revision for version ${version}`);
};

const makeFirefoxFileName = ({
  version,
  platform,
}: {
  version: string;
  platform: string;
}) => {
  switch (platform) {
    case "windows":
      return `Firefox Setup ${version}.exe`;
    case "mac":
    case "mac-arm":
      return `Firefox ${version}.dmg`;
    case "linux":
      return `firefox-${version}.tar.bz2`;
  }
};

const lookup = async () => {
  isLookingUp.value = true;
  showResult.value = false;
  result.value = null;

  if (!version.value) {
    ElMessage({
      message: "Please select a version.",
      type: "error",
    });
    return;
  }

  switch (browser.value) {
    case "chromium":
      try {
        const revision = await findChromiumSnapshotRevision(version.value);
        const links = buildChromiumLinks(revision);
        result.value = {
          revision,
          ...links,
        };
      } catch (error) {
        ElMessage({
          message: `Could not find chromium revision for version ${version.value}.`,
          type: "error",
        });
      }
      break;
    case "firefox":
      let url = `https://ftp.mozilla.org/pub/firefox/releases/${
        version.value
      }/${FIREFOX_PLATFORM_DIRNAME[platform.value]}/${
        languages.value[0] ?? "en-US"
      }`;

      // Older versions don't have win64 builds
      const { ok } = await $fetch<{ ok: boolean }>("/api/ok", {
        method: "POST",
        body: {
          url,
        },
      });

      if (!ok) {
        url = url.replace("win64", "win32");
      }

      const downloadUrl = `${url}/${makeFirefoxFileName({
        version: version.value,
        platform: platform.value,
      })}`;

      result.value = {
        revision: version.value,
        directoryUrl: `${url}/`,
        downloadUrl,
      };
      break;
  }

  isLookingUp.value = false;

  if (result.value) {
    showResult.value = true;

    ElMessage({
      message: "Found matching version.",
      type: "success",
    });
  }
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
    <div class="mx-auto max-w-lg w-full py-20 px-5">
      <div class="mb-8">
        <h1 class="font-bold text-3xl text-left mb-2">Browser Download Tool</h1>
        <p class="text-gray-400 text-sm pr-10">
          Easily download any version of Chromium or Firefox directly from the
          source.
        </p>
      </div>
      <div class="grid gap-3 grid-cols-2 mb-10">
        <el-select
          v-model="platform"
          placeholder="Select platform"
          size="large"
          filterable
          class="relative z-10"
        >
          <el-option
            v-for="item in platformOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select
          v-model="browser"
          placeholder="Select browser"
          size="large"
          class="relative z-10"
        >
          <el-option
            v-for="item in browserOptions"
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
          placeholder="Select version"
          size="large"
          :loading="isFetchingVersions"
          filterable
          :disabled="isFetchingVersions || !browser"
        >
          <el-option
            v-for="(item, i) in displayedVersions"
            :key="i"
            :label="`${item.label} (${item.date
              .toDate()
              .toLocaleDateString()})`"
            :value="item.value"
          >
            <div class="flex justify-between items-center">
              <div>{{ item.label }}</div>
              <div class="opacity-40">
                {{ item.date.toDate().toLocaleDateString() }}
              </div>
            </div>
          </el-option>
        </el-select>
        <div class="w-full col-span-2">
          <el-button
            type="primary"
            size="large"
            @click="lookup"
            class="w-full"
            :disabled="!browser || !channel || !platform || !version"
            :loading="isLookingUp"
          >
            Lookup
          </el-button>
        </div>
      </div>

      <el-collapse-transition>
        <div v-if="showResult">
          <div
            class="w-full rounded-xl border border-primary-600 p-8 bg-gradient-to-br from-primary-600/[0.15] to-primary-600/[0.01]"
          >
            <div class="space-y-6">
              <div>
                <h2 class="font-bold text-xl">
                  {{ selectedBrowser?.label }} {{ versionDisplay }}
                </h2>
                <p class="opacity-50 text-sm mt-1">
                  Release:
                  {{ selectedVersion?.date.toDate().toLocaleDateString() }}
                </p>
              </div>

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

              <div class="space-y-4 text-sm !mt-8">
                <div>
                  <h5 class="font-semibold mb-1">Download:</h5>
                  <a
                    :href="result.downloadUrl"
                    target="_blank"
                    class="block text-gray-400 transition hover:text-gray-200 break-words"
                    >{{ result.downloadUrl }}</a
                  >
                </div>
                <div>
                  <h5 class="font-semibold mb-1">Source:</h5>
                  <a
                    :href="result.directoryUrl"
                    target="_blank"
                    class="block text-gray-400 transition hover:text-gray-200 break-words"
                    >{{ result.directoryUrl }}</a
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-collapse-transition>

      <div
        :class="{ 'opacity-0': !isFetchingVersions }"
        class="text-xs text-gray-500 col-span-2 mt-2 transition duration-200"
      >
        Loading versions. This can take a few seconds...
      </div>
    </div>
  </div>
</template>
