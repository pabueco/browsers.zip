<script lang="ts" setup>
import { groupBy, last, mapValues } from "es-toolkit";
import dayjs from "dayjs";
import "./assets/index.scss";
import type { Version, FirefoxRelease } from "./types";
import type {
  ChromiumSnapshot,
  ChromiumVersionsResponse,
} from "~~/shared/chromium";

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

const channel = ref<string>(CHROMIUM_CHANNELS[0]?.value ?? "stable");

const isFetchingVersions = ref(false);
const isLookingUp = ref(false);

watch(browser, () => {
  channel.value = channels.value[0]?.value ?? "stable";
});

watch(version, () => {
  showResult.value = false;
});

watch([browser, channel, platform], async () => {
  isFetchingVersions.value = true;
  showResult.value = false;

  version.value = undefined;
  versions.value = [];

  if (!browser.value) {
    isFetchingVersions.value = false;
    return;
  }

  try {
    const action = {
      chromium: async () => await fetchChromiumReleases(),
      firefox: async () => await fetchFirefoxReleases(),
    }[browser.value];

    versions.value = await action();

    version.value = versions.value[0]?.value;
  } catch (error) {
    console.error("Failed to load browser versions", error);
    ElMessage({
      message: "Could not load browser versions. Please try again.",
      type: "error",
    });
  } finally {
    isFetchingVersions.value = false;
  }
});

let firefoxReleases: Record<string, FirefoxRelease[]> | undefined;
const fetchFirefoxReleases = async (): Promise<Version[]> => {
  let data = firefoxReleases;

  if (!data) {
    const { releases } = await $fetchWithCache<{
      releases: Record<string, FirefoxRelease>;
    }>("https://product-details.mozilla.org/1.0/all.json");

    const byCatByVersion = mapValues(
      groupBy(
        Object.values(releases).filter((item) => item.product === "firefox"),
        (item) => item.category,
      ),
      (items) =>
        mapValues(
          groupBy(items, (x) => x.version.split(".", 1)[0] ?? x.version),
          (values: any) => {
            return last(
              values.sort((a: any, b: any) => {
                return a.version.localeCompare(b.version, undefined, {
                  numeric: true,
                  sensitivity: "base",
                });
              }),
            );
          },
        ),
    ) as Record<string, Record<string, FirefoxRelease>>;

    data = {
      stable: Object.values(byCatByVersion.stability ?? {}),
      dev: Object.values(byCatByVersion.dev ?? {}),
      esr: Object.values(byCatByVersion.esr ?? {}),
    };
    firefoxReleases = data;
  }

  return (data[channel.value] ?? [])
    .map((item) => ({
      label: item.version.split(".", 1)[0] ?? item.version,
      value: item.version,
      date: dayjs(item.date),
      fullVersion: item.version,
    }))
    .reverse();
};

const fetchChromiumReleases = async (): Promise<Version[]> => {
  const response = await $fetch<ChromiumVersionsResponse>(
    `/api/chromium/versions/${platform.value}/${channel.value}`,
  );

  return response.versions.map((item) => ({
    label: item.milestone.toString(),
    value: item.milestone.toString(),
    date: dayjs(item.releaseDate),
    fullVersion: item.releaseVersion,
    branchPosition: item.branchPosition,
  }));
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
    isLookingUp.value = false;
    return;
  }

  switch (browser.value) {
    case "chromium":
      try {
        const branchPosition = selectedVersion.value?.branchPosition;
        if (!branchPosition) {
          throw new Error("Selected Chromium version has no branch position");
        }

        const snapshot = await $fetch<ChromiumSnapshot>(
          `/api/chromium/snapshot/${platform.value}/${branchPosition}`,
        );
        result.value = {
          revision: snapshot.revision,
          directoryUrl: snapshot.directoryUrl,
          downloadUrl: snapshot.downloadUrl,
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
type DownloadResult = {
  revision: number | string;
  directoryUrl: string;
  downloadUrl: string;
};

const result = ref<DownloadResult | null>(null);

const displayedVersions = computed(() => {
  return versions.value;
});
</script>

<template>
  <div class="min-h-screen bg-gray-950 flex items-center relative">
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
          :placeholder="isFetchingVersions ? 'Loading...' : 'Select version'"
          size="large"
          :loading="isFetchingVersions"
          filterable
          :disabled="isFetchingVersions || !browser"
        >
          <el-option
            v-for="item in displayedVersions"
            :key="item.value"
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
            Get download link
          </el-button>
        </div>
      </div>

      <el-collapse-transition>
        <div v-if="showResult && result">
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
                <p
                  v-if="browser === 'chromium'"
                  class="opacity-50 text-xs mt-2"
                >
                  Archived snapshot {{ result.revision }} near this release's
                  branch point.
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

          <div class="mt-4">
            <el-alert type="warning" :closable="false" show-icon>
              <template #title>
                <span class="font-semibold text-base"
                  >Old browser versions are unsafe!</span
                >
              </template>
              <template #default>
                <p class="text-xs">
                  They contain known security vulnerabilities. <br />
                  Run them only in a sandboxed or isolated environment.
                  <br />Never run them unsandboxed on your primary system or use
                  them with sensitive data.
                </p>
              </template>
            </el-alert>
          </div>
        </div>
      </el-collapse-transition>

      <div
        :class="{ 'opacity-0': !isFetchingVersions }"
        class="text-xs text-gray-500 col-span-2 mt-2 transition duration-200 flex items-center gap-2"
      >
        <el-icon :size="16" class="animate-spin-slow">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
            <path
              fill="currentColor"
              d="M512 64a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V96a32 32 0 0 1 32-32m0 640a32 32 0 0 1 32 32v192a32 32 0 1 1-64 0V736a32 32 0 0 1 32-32m448-192a32 32 0 0 1-32 32H736a32 32 0 1 1 0-64h192a32 32 0 0 1 32 32m-640 0a32 32 0 0 1-32 32H96a32 32 0 0 1 0-64h192a32 32 0 0 1 32 32M195.2 195.2a32 32 0 0 1 45.248 0L376.32 331.008a32 32 0 0 1-45.248 45.248L195.2 240.448a32 32 0 0 1 0-45.248zm452.544 452.544a32 32 0 0 1 45.248 0L828.8 783.552a32 32 0 0 1-45.248 45.248L647.744 692.992a32 32 0 0 1 0-45.248zM828.8 195.264a32 32 0 0 1 0 45.184L692.992 376.32a32 32 0 0 1-45.248-45.248l135.808-135.808a32 32 0 0 1 45.248 0m-452.544 452.48a32 32 0 0 1 0 45.248L240.448 828.8a32 32 0 0 1-45.248-45.248l135.808-135.808a32 32 0 0 1 45.248 0z"
            ></path>
          </svg>
        </el-icon>

        <span>Loading versions. This can take a few seconds...</span>
      </div>
    </div>

    <div
      class="absolute bottom-10 text-sm text-gray-500 inset-x-0 flex justify-center items-center gap-1"
    >
      <span>by</span>
      <a
        href="https://pabue.co"
        target="_blank"
        class="text-gray-400 hover:text-primary-500 transition"
        >pabueco</a
      >
      <span>on</span>
      <a
        href="https://github.com/pabueco/browsers.zip"
        target="_blank"
        class="text-gray-400 hover:text-primary-500 transition"
        >github</a
      >
    </div>
  </div>
</template>
