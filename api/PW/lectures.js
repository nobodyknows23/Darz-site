// ─── /api/vx/pw/video ───────────────────────────────────────────────────────
// GET ?batchId=...&childId=...&subjectId=...
//
// PRIMARY  : video-services.onrender.com (no auth, returns MPD + ClearKeys)
// SECONDARY: pimaxer.in API (no auth, returns MPD + ClearKeys)
// TERTIARY : studyratna / pwthor / penpencil fallbacks
// ────────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");
const { setCors } = require("../../../lib/pw");

// ─── PRIMARY SOURCE: video-services.onrender.com ─────────────────────────────
// No auth required.
// awsVideo  → live lectures (CloudFront signed .m3u8)
// penpencilvdo → recorded videos (MPD/HLS + DRM ClearKeys)
// ─────────────────────────────────────────────────────────────────────────────

// Helper: fetch from video-services with a given urlType
async function _fetchVideoServices(batchId, childId, urlType) {
  const url = `https://video-services.onrender.com/api/video-url-details?parentId=${encodeURIComponent(batchId)}&childId=${encodeURIComponent(childId)}&urlType=${encodeURIComponent(urlType)}`;
  console.log(`[video.js] Fetching video-services (${urlType}): ${url}`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.warn(`[video.js] video-services (${urlType}) returned status ${res.status}`);
    return null;
  }

  try {
    const text = await res.text();
    if (text.trim() === "live to vod") {
      console.log(`[video.js] video-services (${urlType}) returned raw "live to vod" text`);
      return "live to vod";
    }
    const json = JSON.parse(text);
    if (!json.success || !json.data) {
      console.warn(`[video.js] video-services (${urlType}) returned success:false or no data`);
      return null;
    }
    return json.data;
  } catch (parseErr) {
    console.warn(`[video.js] video-services (${urlType}) failed to parse JSON: ${parseErr.message}`);
    return null;
  }
}

// Helper: Extract HLS (.m3u8) URL from response payload if available or non-DRM
function extractPlayableHlsUrl(data) {
  if (!data) return "";

  // Helper: Decode JWT and extract URL if it contains .m3u8
  function extractM3u8FromJwt(jwtStr) {
    if (!jwtStr || typeof jwtStr !== "string") return "";
    try {
      const parts = jwtStr.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        if (payload.url && payload.url.includes(".m3u8")) {
          return payload.url;
        }
      }
    } catch (err) {
      console.warn(`[video.js] Failed to decode JWT for m3u8: ${err.message}`);
    }
    return "";
  }

  // 1. Try to extract from hls_url JWT
  if (data.videoDetails?.hls_url) {
    const url = extractM3u8FromJwt(data.videoDetails.hls_url);
    if (url) return url;
  }

  // 2. Try to extract from Live_Streaming_Url JWT
  if (data.videoDetails?.Live_Streaming_Url) {
    const url = extractM3u8FromJwt(data.videoDetails.Live_Streaming_Url);
    if (url) return url;
  }

  // 3. Check if data.url contains .m3u8
  if (data.url && data.url.includes(".m3u8")) {
    return data.url;
  }

  // 4. Check if data.videoDetails.videoUrl contains .m3u8
  if (data.videoDetails?.videoUrl && data.videoDetails.videoUrl.includes(".m3u8")) {
    return data.videoDetails.videoUrl;
  }

  // 5. If DRM is disabled/false and we have an MPD URL, we can convert it to HLS
  const isDrmProtected = data.isDrmEnabled !== false && data.videoDetails?.drmProtected !== false;
  if (!isDrmProtected) {
    const mpdUrl = data.url || data.videoDetails?.videoUrl || "";
    if (mpdUrl && mpdUrl.includes(".mpd")) {
      return mpdUrl.replace(/\.mpd(\?.*)?$/, ".m3u8$1");
    }
  }

  return "";
}

// Try awsVideo urlType first → handles live lectures with CloudFront signed HLS and VOD fallback when penpencilvdo is raw text
async function tryVideoServicesLive(batchId, childId, req) {
  try {
    const data = await _fetchVideoServices(batchId, childId, "awsVideo");
    if (!data || data === "live to vod") return null;

    const playableHlsUrl = extractPlayableHlsUrl(data);

    // If we resolved a non-DRM live HLS URL, return it ONLY if it is currently ONGOING/LIVE
    if (playableHlsUrl && data.status === "ONGOING") {
      const authHeader = req.headers.authorization || req.headers.Authorization || "";
      const host = req.headers.host || "vxproxy.vercel.app";
      const proto = req.headers["x-forwarded-proto"] || "https";
      const base64Url = Buffer.from(playableHlsUrl).toString("base64");
      const proxyHlsUrl = `${proto}://${host}/api/vx/pw/hls-proxy?url=${encodeURIComponent(base64Url)}&videoKey=&token=${encodeURIComponent(authHeader)}`;

      console.log(`[video.js] video-services (awsVideo): HLS resolution SUCCESS (URL=${playableHlsUrl.substring(0, 60)}...)`);
      return {
        success: true,
        video: {
          hlsUrl: proxyHlsUrl,
          drm: false,
          source: "1",
          isLive: true,
        },
      };
    }

    // Fallback: If no .m3u8 but we have a .mpd URL, this is a DRM VOD (live to VOD)
    const mpdUrl = data.url || data.videoDetails?.videoUrl || "";
    if (mpdUrl && mpdUrl.includes(".mpd")) {
      console.log("[video.js] video-services (awsVideo): Found VOD MPD URL, checking DRM keys");

      // Extract DRM keys from JWT if available
      let kid = "";
      let key = "";
      const drmKeysJwt = data.videoDetails?.drmKeys;
      if (drmKeysJwt && typeof drmKeysJwt === "string") {
        try {
          const parts = drmKeysJwt.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
            kid = payload.kid || "";
            key = payload.key || "";
          }
        } catch (jwtErr) {
          console.warn(`[video.js] Failed to decode drmKeys JWT: ${jwtErr.message}`);
        }
      }

      if (kid && key) {
        console.log(`[video.js] video-services (awsVideo): DRM VOD resolution SUCCESS (kid=${kid.substring(0, 8)}...)`);
        return {
          success: true,
          video: {
            mpdUrl: mpdUrl,
            drm: true,
            source: "1",
          },
          drm: {
            kid: kid,
            key: key,
          },
        };
      }
    }

    console.warn("[video.js] video-services (awsVideo): No playable HLS (.m3u8) or VOD (.mpd) URL found");
    return null;
  } catch (err) {
    console.error(`[video.js] tryVideoServicesLive exception: ${err.message}`);
    return null;
  }
}

// Try penpencilvdo urlType → handles recorded videos with DRM/HLS
async function tryVideoServicesPrimary(batchId, childId, req) {
  try {
    const data = await _fetchVideoServices(batchId, childId, "penpencilvdo");
    if (!data || data === "live to vod") return null;

    const mpdUrl = data.url || data.videoDetails?.videoUrl || "";

    // Extract DRM keys from JWT if available
    let kid = "";
    let key = "";
    const drmKeysJwt = data.videoDetails?.drmKeys;
    if (drmKeysJwt && typeof drmKeysJwt === "string") {
      try {
        const parts = drmKeysJwt.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
          kid = payload.kid || "";
          key = payload.key || "";
        }
      } catch (jwtErr) {
        console.warn(`[video.js] Failed to decode drmKeys JWT: ${jwtErr.message}`);
      }
    }

    // 1. PRIMARY: Try DRM (DASH MPD + ClearKeys) first
    if (mpdUrl && kid && key) {
      console.log(`[video.js] video-services (penpencilvdo): DRM resolution SUCCESS (kid=${kid.substring(0, 8)}...)`);
      return {
        success: true,
        video: {
          mpdUrl: mpdUrl,
          drm: true,
          source: "1",
        },
        drm: {
          kid: kid,
          key: key,
        },
      };
    }

    // 2. FALLBACK: Try HLS (m3u8) if available
    const playableHlsUrl = extractPlayableHlsUrl(data);
    if (playableHlsUrl) {
      const authHeader = req.headers.authorization || req.headers.Authorization || "";
      const host = req.headers.host || "vxproxy.vercel.app";
      const proto = req.headers["x-forwarded-proto"] || "https";
      const base64Url = Buffer.from(playableHlsUrl).toString("base64");
      const proxyHlsUrl = `${proto}://${host}/api/vx/pw/hls-proxy?url=${encodeURIComponent(base64Url)}&videoKey=&token=${encodeURIComponent(authHeader)}`;

      console.log(`[video.js] video-services (penpencilvdo): HLS resolution FALLBACK (URL=${playableHlsUrl.substring(0, 60)}...)`);
      return {
        success: true,
        video: {
          hlsUrl: proxyHlsUrl,
          drm: false,
          source: "1",
        },
      };
    }

    // 3. SECONDARY FALLBACK: convert MPD to HLS even if DRM is true but no keys are found
    if (mpdUrl) {
      const authHeader = req.headers.authorization || req.headers.Authorization || "";
      const hlsUrl = mpdUrl.replace(/\.mpd(\?.*)?$/, ".m3u8$1");
      const host = req.headers.host || "vxproxy.vercel.app";
      const proto = req.headers["x-forwarded-proto"] || "https";
      const base64Url = Buffer.from(hlsUrl).toString("base64");
      const proxyHlsUrl = `${proto}://${host}/api/vx/pw/hls-proxy?url=${encodeURIComponent(base64Url)}&videoKey=&token=${encodeURIComponent(authHeader)}`;

      console.log("[video.js] video-services (penpencilvdo): HLS fallback resolution (no DRM keys)");
      return {
        success: true,
        video: {
          hlsUrl: proxyHlsUrl,
          drm: false,
          source: "1",
        },
      };
    }

    console.warn("[video.js] video-services (penpencilvdo): no playable URL found in response");
    return null;
  } catch (err) {
    console.error(`[video.js] tryVideoServicesPrimary exception: ${err.message}`);
    return null;
  }
}

// ─── Constant initData — replace with your actual secret ────────────────────
const INIT_DATA = "query_id=AAFLWuV_AwAAAEta5X_3qb_2&user=%7B%22id%22%3A8588188235%2C%22first_name%22%3A%22Zyrox%20Official%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22Official_zyrox%22%2C%22language_code%22%3A%22en%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FpQ059bLbhG3leut6tQI7cDC5-9zSRI-4Jytk8yFL1BiL3B48veJOVfXTI0aYsW5E.svg%22%7D&auth_date=1782475421&signature=tISDYdxuAYpJY1PnXn2faQrRPrMvGTbIOlbFEW0f8JbCgfu0QOuNXMvLbZKtX8qBFyRMMxH_XEae2dLWu00PCg&hash=fcc32d42fdf01da280c3f16add7d7e25a92bf36f09440b67257423dbfa9b74bd";
// ────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!global.pimaxerMemoryCache) {
  global.pimaxerMemoryCache = new Map();
}

const MEMORY_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

async function getCachedPimaxer(batchId, childId) {
  const cacheKey = `pimaxer:${batchId}:${childId}`;

  // 1. Check L1 Memory Cache first
  if (global.pimaxerMemoryCache.has(cacheKey)) {
    const entry = global.pimaxerMemoryCache.get(cacheKey);
    const now = Date.now();
    if (now - entry.timestamp < MEMORY_CACHE_TTL) {
      console.log(`L1 Cache Hit for key: ${cacheKey}`);
      return entry.data;
    } else {
      console.log(`L1 Cache Expired for key: ${cacheKey}`);
      global.pimaxerMemoryCache.delete(cacheKey);
    }
  }

  // 2. Check L2 Database Cache
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/maintenance?section=eq.${encodeURIComponent(cacheKey)}`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });
    if (dbRes.ok) {
      const data = await dbRes.json();
      if (data && data.length > 0) {
        const parsed = JSON.parse(data[0].message);
        // Save to L1 Memory Cache
        global.pimaxerMemoryCache.set(cacheKey, {
          data: parsed,
          timestamp: Date.now()
        });
        console.log(`L2 Cache Hit and L1 updated for key: ${cacheKey}`);
        return parsed;
      }
    }
  } catch (err) {
    console.error("Failed to query Pimaxer DB cache:", err.message);
  }
  return null;
}

async function cachePimaxer(batchId, childId, videoData) {
  const cacheKey = `pimaxer:${batchId}:${childId}`;

  // Write to L1 Memory Cache first
  global.pimaxerMemoryCache.set(cacheKey, {
    data: videoData,
    timestamp: Date.now()
  });
  console.log(`Saved to L1 Cache for key: ${cacheKey}`);

  // Write to L2 Database Cache
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/maintenance?on_conflict=section`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        section: cacheKey,
        message: JSON.stringify(videoData),
        enabled: false
      })
    });
    console.log(`Saved to L2 DB Cache for key: ${cacheKey}`);
  } catch (err) {
    console.error("Failed to save Pimaxer cache to DB:", err.message);
  }
}

// ─── STREAM HELPER ──────────────────────────────────────────────────────────
async function isStreamAvailable(hlsUrl) {
  try {
    const res = await fetch(hlsUrl, {
      method: "GET",
      headers: {
        "Range": "bytes=0-100",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    return res.ok;
  } catch (err) {
    console.warn(`[video.js] Stream health check failed for ${hlsUrl}: ${err.message}`);
    return false;
  }
}

// ─── FALLBACK: pimaxer.in API ─────────────────────────────────────────────────
// Called automatically when primary (studyratna) fails for any reason.
// Maps pimaxer response → same structure as primary so app never breaks.
// ─────────────────────────────────────────────────────────────────────────────

async function tryPimaxerFallback(batchId, childId, req) {
  try {
    const cachedData = await getCachedPimaxer(batchId, childId);
    if (cachedData && cachedData.mpdUrl) {
      const hlsUrl = cachedData.mpdUrl.replace(/\.mpd(\?.*)?$/, ".m3u8$1");
      
      console.log(`[video.js] Checking cached Pimaxer stream health: ${hlsUrl}`);
      const isHealthy = await isStreamAvailable(hlsUrl);
      if (isHealthy) {
        const host = req.headers.host || "vxproxy.vercel.app";
        const proto = req.headers["x-forwarded-proto"] || "https";
        const base64Url = Buffer.from(hlsUrl).toString("base64");
        const proxyHlsUrl = `${proto}://${host}/api/vx/pw/hls-proxy?url=${encodeURIComponent(base64Url)}&videoKey=`;

        return {
          success: true,
          video: {
            hlsUrl: proxyHlsUrl,
            drm: false,
            source: "2",
          },
        };
      }
      console.warn(`[video.js] Cached Pimaxer stream is unhealthy. Skipping cache.`);
    }

    const fallbackUrl = `https://api.pimaxer.in/v1/videos/video-url-details?parentId=${encodeURIComponent(batchId)}&childId=${encodeURIComponent(childId)}`;
    let fallbackJson = null;
    let attempts = 0;
    const maxAttempts = 3;
    const delayMs = 800;

    while (attempts < maxAttempts) {
      try {
        const fallbackRes = await fetch(fallbackUrl, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            Accept: "application/json",
          },
        });

        if (fallbackRes.ok) {
          fallbackJson = await fallbackRes.json();
          if (fallbackJson && fallbackJson.success && fallbackJson.data && fallbackJson.data.url) {
            break;
          }
        }
        console.warn(`Pimaxer fetch attempt ${attempts + 1} returned status ${fallbackRes.status}`);
      } catch (err) {
        console.error(`Pimaxer fetch attempt ${attempts + 1} threw error: ${err.message}`);
      }

      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    if (!fallbackJson || !fallbackJson.success || !fallbackJson.data || !fallbackJson.data.url) {
      return null;
    }

    const { url: mpdUrl } = fallbackJson.data;
    const hlsUrl = mpdUrl.replace(/\.mpd(\?.*)?$/, ".m3u8$1");

    console.log(`[video.js] Checking fresh Pimaxer stream health: ${hlsUrl}`);
    const isHealthy = await isStreamAvailable(hlsUrl);
    if (!isHealthy) {
      console.warn(`[video.js] Fresh Pimaxer stream is unhealthy/down. Failing Pimaxer fallback.`);
      return null;
    }

    cachePimaxer(batchId, childId, { mpdUrl }).catch(err => {
      console.error("Asynchronous cache insert failed:", err.message);
    });

    const host = req.headers.host || "vxproxy.vercel.app";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const base64Url = Buffer.from(hlsUrl).toString("base64");
    const proxyHlsUrl = `${proto}://${host}/api/vx/pw/hls-proxy?url=${encodeURIComponent(base64Url)}&videoKey=`;

    return {
      success: true,
      video: {
        hlsUrl: proxyHlsUrl,
        drm: false,
        source: "2",
      },
    };
  } catch (fallbackErr) {
    console.error(`[video.js] tryPimaxerFallback exception: ${fallbackErr.message}`);
    return null;
  }
}

// ─── FALLBACK 1: Direct Penpencil API (requires user token) ──────────────────
async function tryPenpencilFallback(batchId, childId, authHeader, req) {
  const configs = [
    {
      name: "BATCHES (DASH)",
      url: `https://api.penpencil.co/v1/videos/video-url-details?type=BATCHES&videoContainerType=DASH&reqType=query&childId=${encodeURIComponent(childId)}&parentId=${encodeURIComponent(batchId)}&clientVersion=200`,
    },
    {
      name: "OTT (DASH)",
      url: `https://api.penpencil.co/v1/videos/video-url-details?type=OTT&videoContainerType=DASH&reqType=query&childId=${encodeURIComponent(childId)}&clientVersion=201`,
    }
  ];

  const headers = {
    "accept": "*/*",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "authorization": authHeader,
    "client-id": "5eb393ee95fab7468a79d189",
    "client-type": "WEB",
    "client-version": "4.6.5",
    "x-sdk-version": "0.0.20",
    "origin": "https://www.pw.live",
    "referer": "https://www.pw.live/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "audiocodeccapability": '{"AAC-LC":{"isSupported":true,"Profile":[{"container":"audio/mp4","supported":true},{"container":"audio/webm","supported":false},{"container":"audio/ogg","supported":false}]},"HE-AAC v1":{"isSupported":true,"Profile":[{"container":"audio/mp4","supported":true},{"container":"audio/webm","supported":false},{"container":"audio/ogg","supported":false}]},"HE-AAC v2":{"isSupported":true,"Profile":[{"container":"audio/mp4","supported":true},{"container":"audio/webm","supported":false},{"container":"audio/ogg","supported":false}]}}',
    "devicememory": "8192",
    "devicestreamingtechnology": '{"dash":{"isSupported":true,"formats":["mp4","m4a"],"codecs":["avc1","aac"]},"hls":{"isSupported":false,"formats":[],"codecs":[]}}',
    "devicetype": "desktop",
    "drmcapability": '{"aesSupport":"yes","fairPlayDrmSupport":"no","playreadyDrmSupport":"no","widevineDRMSupport":"yes"}',
    "frameratecapability": '{"videoQuality":"720p (HD)"}',
    "networktype": "4g",
    "screenresolution": "1280 x 720",
    "videocodeccapability": '{"Hevc":{"isSupported":"true","Profile":[{"name":"Main"},{"name":"Main 10"},{"name":"Main 12"},{"name":"Main 4:2:2 10"},{"name":"Main 4:2:2 12"},{"name":"Main 4:4:4"},{"name":"Main 4:4:4 10"},{"name":"Main 4:4:4 12"},{"name":"Main 4:4:4 16 Intra"}]},"AV1":{"isSupported":"true","Profile":[{"name":"Main"},{"name":"High"},{"name":"Professional"}]}}'
  };

  for (const config of configs) {
    try {
      console.log(`[video.js] Penpencil fallback try: ${config.name} at ${config.url}`);
      const res = await fetch(config.url, {
        method: "GET",
        headers: headers
      });

      if (res.ok) {
        const body = await res.json();
        if (body && body.success && body.data) {
          const data = body.data;
          const dashUrl = data.dash?.url || "";
          const drmDetails = data.dash?.drmDetails;
          const keysList = drmDetails?.keys || [];

          if (dashUrl && keysList.length > 0) {
            console.log(`[video.js] Penpencil DRM resolution success via ${config.name}`);
            return {
              success: true,
              video: {
                mpdUrl: dashUrl,
                drm: true,
                source: "3",
              },
              drm: {
                kid: keysList[0].kid,
                key: keysList[0].key,
              }
            };
          } else if (data.hls?.url) {
            console.log(`[video.js] Penpencil HLS resolution success via ${config.name}`);
            const hlsUrl = data.hls.url;
            const host = req.headers.host || "vxproxy.vercel.app";
            const proto = req.headers["x-forwarded-proto"] || "https";
            const base64Url = Buffer.from(hlsUrl).toString("base64");
            const proxyHlsUrl = `${proto}://${host}/api/vx/pw/hls-proxy?url=${encodeURIComponent(base64Url)}&videoKey=`;

            return {
              success: true,
              video: {
                hlsUrl: proxyHlsUrl,
                drm: false,
                source: "3",
              }
            };
          }
        }
      }
      console.warn(`[video.js] Penpencil API returned non-OK status ${res.status} or success:false for config ${config.name}`);
    } catch (e) {
      console.error(`[video.js] Error fetching from Penpencil: ${e.message}`);
    }
  }

  return null;
}

async function tryPwthorFallback(batchId, childId, subjectId, req, res, debugInfo = {}) {
  try {
    const pwthorToken = process.env.PWTHOR_AUTH_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtb2JpbGUiOiI4MTA5OTQ0NzExIiwibmFtZSI6IkJoYXZpc2h5IiwiaWF0IjoxNzgzMjMxMjkwLCJleHAiOjE3OTEwMDcyOTB9.rO0xDMRjO-dAOMzwGEq0eY12qNiKpWUEvqB-KU5Ry7Q";
    const watchUrl = `https://pwthor.live/watch?batchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ChildId=${encodeURIComponent(childId)}&Type=penpencilvdo&VideoUrl=&isLocked=true`;

    console.log(`[video.js] Starting PWThor fallback flow for childId=${childId}`);
    debugInfo.watchUrl = watchUrl;

    const headers = {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
      'cookie': `auth_token=${pwthorToken}`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      'x-bypass-key': 'vxproxy-bypass-token'
    };

    const watchRes = await fetch(watchUrl, { headers });
    debugInfo.watchStatus = watchRes.status;
    if (!watchRes.ok) {
      const text = await watchRes.text();
      debugInfo.watchError = `PWThor watch page returned non-OK status: ${watchRes.status}, preview: ${text.substring(0, 200)}`;
      console.warn(`[video.js] PWThor watch page returned non-OK status: ${watchRes.status}`);
      return null;
    }

    const setCookieHeaders = watchRes.headers.getSetCookie ? watchRes.headers.getSetCookie() : [watchRes.headers.get('set-cookie')].filter(Boolean);
    let apiHandshakeCookie = '';
    for (const cookieStr of setCookieHeaders) {
      if (cookieStr.includes('api_handshake=')) {
        apiHandshakeCookie = cookieStr.split(';')[0];
        break;
      }
    }

    debugInfo.hasApiHandshakeCookie = !!apiHandshakeCookie;
    if (!apiHandshakeCookie) {
      debugInfo.watchError = "PWThor watch page did not return api_handshake cookie!";
      console.warn("[video.js] PWThor watch page did not return api_handshake cookie!");
      return null;
    }

    const html = await watchRes.text();
    const secureTokenMatch = html.match(/\\"secureToken\\"\s*:\s*\\"([^\\"]+)\\"/) || html.match(/"secureToken"\s*:\s*"([^"]+)"/);
    const dynamicKeyMatch = html.match(/\\"dynamicKey\\"\s*:\s*\\"([^\\"]+)\\"/) || html.match(/"dynamicKey"\s*:\s*"([^"]+)"/);

    debugInfo.hasSecureTokenMatch = !!secureTokenMatch;
    if (!secureTokenMatch) {
      debugInfo.watchError = "Could not find secureToken in PWThor watch page HTML! HTML Length: " + html.length;
      console.warn("[video.js] Could not find secureToken in PWThor watch page HTML!");
      return null;
    }

    const secureToken = secureTokenMatch[1];
    const dynamicKey = dynamicKeyMatch ? dynamicKeyMatch[1] : "v";

    const apiUrl = `https://pwthor.live/api/get-video-url?${dynamicKey}=${encodeURIComponent(secureToken)}`;
    debugInfo.apiUrl = apiUrl;
    const apiHeaders = {
      'accept': '*/*',
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
      'cookie': `auth_token=${pwthorToken}; ${apiHandshakeCookie}`,
      'referer': watchUrl,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      'priority': 'u=1, i',
      'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-bypass-key': 'vxproxy-bypass-token'
    };

    const apiRes = await fetch(apiUrl, { headers: apiHeaders });
    debugInfo.apiStatus = apiRes.status;
    if (!apiRes.ok) {
      const text = await apiRes.text();
      debugInfo.apiError = `PWThor get-video-url API returned non-OK status: ${apiRes.status}, preview: ${text.substring(0, 200)}`;
      console.warn(`[video.js] PWThor get-video-url API returned non-OK status: ${apiRes.status}`);
      return null;
    }

    const apiJson = await apiRes.json();
    debugInfo.apiJsonSuccess = !!(apiJson && apiJson.success);
    if (!apiJson || !apiJson.success || !apiJson.data || !apiJson.data.url) {
      debugInfo.apiError = "PWThor get-video-url API response success is false or missing URL data. Json: " + JSON.stringify(apiJson);
      console.warn("[video.js] PWThor get-video-url API response success is false or missing URL data");
      return null;
    }

    const videoData = apiJson.data;
    let fullSignedUrl = videoData.url;
    if (videoData.signedUrl) {
      if (videoData.signedUrl.startsWith("?") && fullSignedUrl.includes("?")) {
        fullSignedUrl = fullSignedUrl + "&" + videoData.signedUrl.substring(1);
      } else {
        fullSignedUrl = fullSignedUrl + videoData.signedUrl;
      }
    }

    const subodhProxyUrl = `https://pwthorproxy.subodhpgcollege.site/get-proxy?url=${encodeURIComponent(fullSignedUrl)}`;
    debugInfo.subodhProxyUrl = subodhProxyUrl;
    const proxyRes = await fetch(subodhProxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    debugInfo.proxyStatus = proxyRes.status;
    if (!proxyRes.ok) {
      const text = await proxyRes.text();
      debugInfo.proxyError = `Subodh proxy returned non-OK status: ${proxyRes.status}, preview: ${text.substring(0, 200)}`;
      console.warn(`[video.js] Subodh proxy returned non-OK status: ${proxyRes.status}`);
      return null;
    }

    const proxyJson = await proxyRes.json();
    debugInfo.proxyJsonSuccess = !!(proxyJson && proxyJson.status === 'success');
    if (!proxyJson || proxyJson.status !== 'success' || !proxyJson.m3u8_url) {
      debugInfo.proxyError = "Subodh proxy response status is not success or missing m3u8_url. Json: " + JSON.stringify(proxyJson);
      console.warn("[video.js] Subodh proxy response status is not success or missing m3u8_url");
      return null;
    }

    const rawHlsUrl = proxyJson.m3u8_url.replace(".mpd", ".m3u8");

    const host = req.headers.host || "vxproxy.vercel.app";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const base64Url = Buffer.from(rawHlsUrl).toString("base64");
    const proxyHlsUrl = `${proto}://${host}/api/vx/pw/hls-proxy?url=${encodeURIComponent(base64Url)}&videoKey=`;

    console.log(`[video.js] PWThor fallback successfully resolved for childId=${childId}`);
    return {
      success: true,
      video: {
        hlsUrl: proxyHlsUrl,
        drm: false,
        source: "4",
      }
    };
  } catch (err) {
    debugInfo.exception = err.message;
    console.error(`[video.js] Exception in tryPwthorFallback: ${err.message}`);
    return null;
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Sirf GET request allowed hai",
    });
  }

  // Support both case variations
  const batchId = req.query.batchId || req.query.BatchId;
  const childId = req.query.childId || req.query.ChildId || req.query.contentId || req.query.ContentId;
  const subjectId = req.query.subjectId || req.query.SubjectId;

  // Validation
  const missing = [];
  if (!batchId) missing.push("batchId");
  if (!childId) missing.push("childId");
  if (!subjectId) missing.push("subjectId");

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Ye query params missing hain: ${missing.join(", ")}`,
      example:
        "/api/vx/pw/video?batchId=6779345c20fa0756e4a7fd08&childId=6a1bad071422f1290d94baea&subjectId=688dd9660fb5f084935d611f",
    });
  }

  const isDebug = req.query.debug === "true" || req.query.Debug === "true";

  // ─── 0. LIVE STREAM CHECK: video-services (awsVideo) ──────────────────────
  console.log(`[video.js] [0/6] Trying LIVE STREAM: video-services.onrender.com (awsVideo) for childId=${childId}`);
  try {
    const liveResult = await tryVideoServicesLive(batchId, childId, req);
    if (liveResult) {
      if (isDebug) liveResult.debug = { source: "video-services.onrender.com (awsVideo/live)" };
      return res.status(200).json(liveResult);
    }
    console.warn(`[video.js] LIVE STREAM check returned no live stream for childId=${childId}`);
  } catch (liveErr) {
    console.error(`[video.js] LIVE STREAM check threw exception: ${liveErr.message}`);
  }

  // ─── 1. PRIMARY SOURCE: video-services.onrender.com (penpencilvdo) ────────
  console.log(`[video.js] [1/6] Trying PRIMARY: video-services.onrender.com (penpencilvdo) for childId=${childId}`);
  try {
    const vsResult = await tryVideoServicesPrimary(batchId, childId, req);
    if (vsResult) {
      if (isDebug) vsResult.debug = { source: "video-services.onrender.com (penpencilvdo)" };
      return res.status(200).json(vsResult);
    }
    console.warn(`[video.js] PRIMARY (video-services penpencilvdo) returned no streams for childId=${childId}`);
  } catch (vsErr) {
    console.error(`[video.js] PRIMARY (video-services penpencilvdo) threw exception: ${vsErr.message}`);
  }

  /*
  // ─── 2. SECONDARY SOURCE: pimaxer.in ─────────────────────────────────────
  console.log(`[video.js] [2/6] Trying SECONDARY: pimaxer.in for childId=${childId}`);
  try {
    const pimaxerResult = await tryPimaxerFallback(batchId, childId, req);
    if (pimaxerResult) {
      if (isDebug) pimaxerResult.debug = { source: "pimaxer.in" };
      return res.status(200).json(pimaxerResult);
    }
    console.warn(`[video.js] SECONDARY (pimaxer) returned no streams for childId=${childId}`);
  } catch (pimaxerErr) {
    console.error(`[video.js] SECONDARY (pimaxer) threw exception: ${pimaxerErr.message}`);
  }

  // ─── 3. TERTIARY SOURCE: PWThor ──────────────────────────────────────────
  console.log(`[video.js] [3/6] Trying TERTIARY: PWThor for childId=${childId}`);
  const pwthorDebug = {};
  try {
    const pwthorResult = await tryPwthorFallback(batchId, childId, subjectId, req, res, pwthorDebug);
    if (pwthorResult) {
      if (isDebug) pwthorResult.debug = { pwthor: pwthorDebug };
      return res.status(200).json(pwthorResult);
    }
    console.warn(`[video.js] TERTIARY (PWThor) returned no streams for childId=${childId}`);
  } catch (pwthorErr) {
    pwthorDebug.exception = pwthorErr.message;
    console.error(`[video.js] TERTIARY (PWThor) threw exception: ${pwthorErr.message}`);
  }

  // ─── 4. QUATERNARY SOURCE: Studyratna API ────────────────────────────────
  console.log(`[video.js] [4/6] Trying QUATERNARY: Studyratna API for childId=${childId}`);
  let primaryFailed = false;
  let primaryFailReason = "";

  try {
    const upstreamUrl = `https://api-lite.studyratna.org/v1/pw/playback-manifest/${childId}/${batchId}/${subjectId}`;

    let response;
    try {
      response = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
          Accept: "application/json",
          "x-init-data": INIT_DATA,
        },
      });
    } catch (fetchErr) {
      primaryFailed = true;
      primaryFailReason = `Studyratna network error: ${fetchErr.message}`;
    }

    if (!primaryFailed && !response.ok) {
      primaryFailed = true;
      primaryFailReason = `Studyratna returned HTTP ${response.status}`;
    }

    if (!primaryFailed) {
      const jsonRes = await response.json();
      const encryptedText = jsonRes.encrypted;

      if (!encryptedText) {
        primaryFailed = true;
        primaryFailReason = "Studyratna response missing encrypted field";
      }

      if (!primaryFailed) {
        let decryptedText;
        try {
          const parts = encryptedText.split(":");
          if (parts.length !== 2) {
            throw new Error("Invalid encrypted format (missing ':' split)");
          }
          const [ivHex, cipherHex] = parts;
          const iv = Buffer.from(ivHex, "hex");
          const ciphertext = Buffer.from(cipherHex, "hex");

          const key = crypto
            .createHash("sha256")
            .update(
              "939567f60cc4728ee81fc28fae7458af" +
              INIT_DATA.substring(0, 50)
            )
            .digest();

          const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
          let decrypted = decipher.update(ciphertext);
          decrypted = Buffer.concat([decrypted, decipher.final()]);
          decryptedText = decrypted.toString("utf8");
        } catch (decryptErr) {
          primaryFailed = true;
          primaryFailReason = `Decryption failed: ${decryptErr.message}`;
        }

        if (!primaryFailed) {
          let decryptedData;
          try {
            decryptedData = JSON.parse(decryptedText);
          } catch (jsonErr) {
            primaryFailed = true;
            primaryFailReason = `Decrypted JSON parse failed: ${jsonErr.message}`;
          }

          if (!primaryFailed) {
            if (!decryptedData.success || !decryptedData.data) {
              primaryFailed = true;
              primaryFailReason = "Studyratna decrypted payload returned success:false";
            }

            if (!primaryFailed) {
              const { videoUrl, signedUrl, clearkeys } = decryptedData.data;

              let fullUrl = videoUrl || "";
              const hasClearKeys = clearkeys && clearkeys.length > 0;

              if (hasClearKeys) {
                fullUrl = fullUrl.replace(".m3u8", ".mpd");
              }

              if (signedUrl) {
                if (signedUrl.startsWith("?") && fullUrl.includes("?")) {
                  fullUrl = `${fullUrl}&${signedUrl.substring(1)}`;
                } else {
                  fullUrl = `${fullUrl}${signedUrl}`;
                }
              }

              if (hasClearKeys) {
                return res.status(200).json({
                  success: true,
                  video: {
                    mpdUrl: fullUrl,
                    drm: true,
                    source: "4",
                  },
                  drm: {
                    kid: clearkeys[0].kid,
                    key: clearkeys[0].k,
                  },
                });
              } else {
                const host = req.headers.host || "vxproxy.vercel.app";
                const proto = req.headers["x-forwarded-proto"] || "https";
                const uuidMatch = fullUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                const extractedVideoKey = uuidMatch ? uuidMatch[0] : "";
                const proxyHlsUrl = `${proto}://${host}/api/vx/pw/hls-proxy?url=${encodeURIComponent(fullUrl)}&videoKey=${encodeURIComponent(extractedVideoKey)}`;

                return res.status(200).json({
                  success: true,
                  video: {
                    hlsUrl: proxyHlsUrl,
                    drm: false,
                    source: "4",
                  },
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    primaryFailed = true;
    primaryFailReason = `Studyratna threw exception: ${err.message}`;
  }

  if (primaryFailed) {
    console.warn(`[video.js] QUATERNARY (Studyratna) failed: ${primaryFailReason}`);
  }

  // ─── 5. LAST RESORT: Penpencil API (requires user Bearer token) ──────────
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    console.log(`[video.js] [5/6] Trying LAST RESORT: Penpencil API for childId=${childId}`);
    try {
      const penpencilResult = await tryPenpencilFallback(batchId, childId, authHeader, req);
      if (penpencilResult) {
        return res.status(200).json(penpencilResult);
      }
      console.warn(`[video.js] LAST RESORT (Penpencil) failed for childId=${childId}`);
    } catch (penpencilErr) {
      console.error(`[video.js] LAST RESORT (Penpencil) threw exception: ${penpencilErr.message}`);
    }
  }
  */

  return res.status(502).json({
    success: false,
    error: "All fallback pipelines failed to resolve a playable manifest.",
    source: "all_fallbacks_failed",
  });
};