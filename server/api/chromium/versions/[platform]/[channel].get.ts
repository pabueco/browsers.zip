import {
  isChromiumChannel,
  isChromiumPlatform,
} from "~~/shared/chromium";
import { getChromiumVersions } from "~~/server/utils/chromium-service";

export default defineEventHandler(async (event) => {
  const platform = getRouterParam(event, "platform");
  const channel = getRouterParam(event, "channel");

  if (!isChromiumPlatform(platform) || !isChromiumChannel(channel)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid Chromium query" });
  }

  try {
    return await getChromiumVersions(platform, channel);
  } catch (error) {
    console.error("Failed to load Chromium versions", error);
    throw createError({
      statusCode: 502,
      statusMessage: "Could not load Chromium versions",
    });
  }
});
