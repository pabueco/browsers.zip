import type { Dayjs } from "dayjs";

export type FirefoxRelease = {
  build_number: number;
  category: "dev" | "stability" | "esr";
  date: string;
  description: null | string;
  is_security_driven: boolean;
  product: "devedition" | "firefox";
  version: string;
};

export type ChromiumRelease = {
  channel: (typeof CHROMIUM_CHANNELS)[number]["value"];
  chromium_main_branch_position: number;
  hashes: Record<string, string>;
  milestone: number;
  platform: (typeof PLATFORMS)[number]["value"];
  time: number;
  version: string;
  previous_version: string;
};

export type Version = {
  label: string;
  value: string;
  date: Dayjs;
  fullVersion: string;
};
