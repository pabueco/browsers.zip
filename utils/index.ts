import { Detector } from "detector-js";

export const ucfirst = (str: string | undefined) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : str;

const DEFAULT_FETCH_CACHE_LIFETIME = 60 * 60 * 24; // 1 day

export const $fetchWithCache = async <T>(
  url: string,
  expiresInSeconds: number = DEFAULT_FETCH_CACHE_LIFETIME
) => {
  if (process.env.NODE_ENV !== "development") {
    return await $fetch<T>(url);
  }

  const cacheKey = `fetch:${url}`;
  const expiresAtKey = `${cacheKey}:expiresAt`;

  const cached = localStorage.getItem(cacheKey);

  const cacheExpiresAt = localStorage.getItem(expiresAtKey);
  const now = Date.now();
  const hasExpired = !cacheExpiresAt || now > Number(cacheExpiresAt);

  if (cached && !hasExpired) {
    return JSON.parse(cached) as T;
  }

  const result = await $fetch<T>(url);

  localStorage.setItem(cacheKey, JSON.stringify(result));
  localStorage.setItem(
    expiresAtKey,
    (now + expiresInSeconds * 1000).toString()
  );

  return result;
};

export const getCurrentPlatform = (): (typeof PLATFORMS)[number] => {
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

  return PLATFORMS[0];
};
