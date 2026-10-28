// IndexNow (indexnow.org) tells Bing, Yandex, Seznam, Naver and others that
// pages changed, so they recrawl them without waiting. The key is public by
// design: search engines confirm it by fetching public/<key>.txt from the site.

export const indexNowKey = "0683720af2ab380a954513ce648f6d4a"

export const indexNowEndpoint = "https://api.indexnow.org/indexnow"

/** IndexNow accepts up to 10,000 URLs per request. */
const maxUrls = 10_000

/**
 * The JSON body for an IndexNow submission. Every URL must be on `siteUrl`'s
 * host, or the whole request is rejected.
 */
export function indexNowPayload(siteUrl: string, urls: readonly string[]) {
  const { host, origin } = new URL(siteUrl)
  const urlList = [...new Set(urls)]
  for (const url of urlList) {
    if (new URL(url).host !== host) {
      throw new Error(`${url} is not on ${host}`)
    }
  }
  if (urlList.length === 0) throw new Error("No URLs to submit")
  if (urlList.length > maxUrls) {
    throw new Error(`IndexNow takes at most ${maxUrls} URLs per request`)
  }
  return {
    host,
    key: indexNowKey,
    keyLocation: `${origin}/${indexNowKey}.txt`,
    urlList,
  }
}
