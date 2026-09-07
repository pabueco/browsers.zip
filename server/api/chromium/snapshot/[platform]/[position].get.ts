import { isChromiumPlatform } from "~~/shared/chromium";
import { getChromiumSnapshot } from "~~/server/utils/chromium-service";

export default defineEventHandler(async (event) => {
  const platform = getRouterParam(event, "platform");
  const position = Number(getRouterParam(event, "position"));

  if (
    !isChromiumPlatform(platform) ||
    !Number.isInteger(position) ||
    position <= 0
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid Chromium snapshot query",
    });
  }

  let snapshot;
  try {
    snapshot = await getChromiumSnapshot(platform, position);
  } catch (error) {
    console.error("Failed to resolve Chromium snapshot", error);
    throw createError({
      statusCode: 502,
      statusMessage: "Could not resolve Chromium snapshot",
    });
  }

  if (!snapshot) {
    throw createError({
      statusCode: 404,
      statusMessage: "No Chromium snapshot found",
    });
  }

  return snapshot;
});
