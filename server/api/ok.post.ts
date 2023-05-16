export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const url = body.url;
  const res = await fetch(url, { method: "HEAD" });

  return {
    ok: res.ok,
  }
})