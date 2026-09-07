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

export type Version = {
  label: string;
  value: string;
  date: Dayjs;
  fullVersion: string;
  branchPosition?: number;
};
