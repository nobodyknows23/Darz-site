
/*****************************************************************
 * LearnByAKP Custom Player JS
 * Fixed for signed CloudFront live .m3u8 links
 *
 * Query params supported:
 * ?file_url=
 * ?url=
 * ?video_id=&subject_slug=&batch_id=&schedule_id=&subject_id=&topicSlug=
 *****************************************************************/

const CONFIG = {
  BASE_API: "https://mtaiirus-api.onrender.com",

  REQUIRE_DELTA_KEY: false,
  DELTA_ACCESS_KEY: "delta-access-key",
  DELTA_KEY_EXPIRATION: "delta-key-expiration",

  LOGO: "https://i.ibb.co/9Hm0NqsH/f69ed82b-7169-45fc-a82b-915e453c6340.png"
};

const $ = (id) => document.getElementById(id);

const state = {
  loading: true,
  loadingText: "Initializing...",
  loadingProgress: 0,

  videoUrl: null,
  youtubeId: null,

  playing: false,
  duration: 0,
  currentTime: 0,
  loadedTime: 0,

  seeking: false,
  buffering: false,
  controlsVisible: true,

  playbackSpeed: 1,

  qualities: [],
  selectedQuality: null,
  manualQuality: false,
  preferredHeight: null,

  lectures: [],
  attachments: [],
  currentScheduleId: null,

  volume: 1,
  muted: false
};

const refs = {
  video: $("video"),
  root: $("rootPlayer"),
  player: $("player"),

  youtubeLayer: $("youtubeLayer"),
  ytContainer: $("ytContainer"),

  loader: $("loader"),
  loaderText: $("loaderText"),
  loaderBar: $("loaderBar"),
  loaderPercent: $("loaderPercent"),

  buffering: $("buffering"),

  settingsPanel: $("settingsPanel"),
  settingsMain: $("settingsMain"),
  speedSub: $("speedSub"),
  qualitySub: $("qualitySub"),
  qualityRow: $("qualityRow"),
  speedValue: $("speedValue"),
  qualityValue: $("qualityValue"),

  progressBar: $("progressBar"),
  progressLoaded: $("progressLoaded"),
  progressPlayed: $("progressPlayed"),
  progressThumb: $("progressThumb"),
  currentTime: $("currentTime"),
  durationTime: $("durationTime"),

  playIcon: $("playIcon"),
  centerPlay: $("centerPlay"),

  errorState: $("errorState"),
  errorTitle: $("errorTitle"),
  errorText: $("errorText"),

  volumeFill: $("volumeFill"),
  volumeThumb: $("volumeThumb"),

  lecturePanel: $("lecturePanel"),
  attachmentPanel: $("attachmentPanel"),
  lectureList: $("lectureList"),
  attachmentList: $("attachmentList")
};

let shakaPlayer = null;
let ytPlayer = null;
let controlsTimer = null;
let ytProgressTimer = null;

const params = new URLSearchParams(location.search);

const qp = {
  videoId: params.get("video_id") || params.get("video") || params.get("id"),
  subjectSlug: params.get("subject_slug"),
  batchId: params.get("batch_id"),
  scheduleId: params.get("schedule_id"),
  subjectId: params.get("subject_id"),
  topicSlug: params.get("topicSlug")
};

state.currentScheduleId = qp.scheduleId;

/* -------------------------------------------------------
   BASIC HELPERS
------------------------------------------------------- */

function isKeyValid() {
  if (!CONFIG.REQUIRE_DELTA_KEY) return true;

  const key = localStorage.getItem(CONFIG.DELTA_ACCESS_KEY);
  const exp = localStorage.getItem(CONFIG.DELTA_KEY_EXPIRATION);

  if (!key || !exp) return false;

  const expMs = parseInt(exp, 10);

  if (Date.now() < expMs) return true;

  localStorage.removeItem(CONFIG.DELTA_ACCESS_KEY);
  localStorage.removeItem(CONFIG.DELTA_KEY_EXPIRATION);

  return false;
}

function setLoading(show, text = state.loadingText, progress = state.loadingProgress) {
  state.loading = show;
  state.loadingText = text;
  state.loadingProgress = Math.max(0, Math.min(100, Number(progress || 0)));

  if (!refs.loader) return;

  refs.loader.classList.toggle("show", show);

  if (refs.loaderText) refs.loaderText.textContent = text;
  if (refs.loaderBar) refs.loaderBar.style.width = state.loadingProgress + "%";
  if (refs.loaderPercent) refs.loaderPercent.textContent = Math.round(state.loadingProgress) + "%";
}

function setBuffering(show) {
  state.buffering = !!show;

  if (refs.buffering) {
    refs.buffering.style.display = show ? "block" : "none";
  }
}

function showError(title, message) {
  setLoading(false);

  if (refs.errorTitle) refs.errorTitle.textContent = title || "Video Not Available";
  if (refs.errorText) refs.errorText.textContent = message || "This video is not available right now.";
  if (refs.errorState) refs.errorState.classList.add("show");
}

function formatTime(value) {
  value = Number(value || 0);

  if (!isFinite(value)) return "00:00";

  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

async function fetchJSON(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Request failed " + res.status);
  }

  return res.json();
}

function extractYouTubeId(input) {
  if (!input) return null;

  try {
    const url = new URL(input);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).split("?")[0];
    }

    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");

      if (v) return v;

      const m = url.pathname.match(/(?:embed|shorts|v)\/([^/?&]+)/);

      if (m) return m[1];
    }
  } catch (e) {}

  return /^[a-zA-Z0-9_-]{11}$/.test(input) ? input : null;
}

/* -------------------------------------------------------
   DECRYPT HELPER
------------------------------------------------------- */

async function decryptPayload(payload) {
  if (!payload) return payload;
  if (typeof payload !== "string") return payload;

  try {
    return JSON.parse(payload);
  } catch (e) {}

  if (!payload.includes(":")) return payload;

  const secret =
    "maggikhalo" ||
    localStorage.getItem("maggikhalo") ||
    "";

  if (!secret) {
    console.warn("DECRYPT_SECRET_KEY missing. Returning encrypted payload.");
    return payload;
  }

  function hexToBytes(hex) {
    const clean = hex.trim();

    if (!/^[0-9a-fA-F]+$/.test(clean)) {
      throw new Error("Invalid hex");
    }

    return new Uint8Array(clean.match(/.{1,2}/g).map((x) => parseInt(x, 16)));
  }

  function secretToKeyBytes(secretText) {
    const enc = new TextEncoder().encode(secretText);
    const key = new Uint8Array(32);

    for (let i = 0; i < 32; i++) {
      key[i] = i < enc.length ? enc[i] : 0;
    }

    return key;
  }

  try {
    const [ivHex, dataHex] = payload.split(":");

    const key = await crypto.subtle.importKey(
      "raw",
      secretToKeyBytes(secret),
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexToBytes(ivHex) },
      key,
      hexToBytes(dataHex)
    );

    const text = new TextDecoder().decode(plain);

    return JSON.parse(text);
  } catch (err) {
    console.warn("Payload decrypt failed:", err);
    return payload;
  }
}

/* -------------------------------------------------------
   DRM / KEY HELPERS
------------------------------------------------------- */

async function extractKID(mpdUrl) {
  const url = `${CONFIG.BASE_API}/api/pw/kid?mpdUrl=${encodeURIComponent(mpdUrl)}`;
  const data = await fetchJSON(url);

  if (!data.success || !data.kid) {
    throw new Error(data.error || data.details || "Failed to extract KID");
  }

  return data.kid;
}

async function getClearKey(kid) {
  const url = `${CONFIG.BASE_API}/api/pw/otp?kid=${encodeURIComponent(kid)}`;
  const data = await fetchJSON(url);

  if (!data.success || !data.key) {
    throw new Error(data.error || "Invalid key data received from API.");
  }

  return data.key;
}

/* -------------------------------------------------------
   IMPORTANT LIVE HLS FIX
   Signed CloudFront m3u8 ke child segment me query add karega
------------------------------------------------------- */

function addManifestQueryFilter(manifestUrl) {
  if (!shakaPlayer || !manifestUrl) return;

  const queryIndex = manifestUrl.indexOf("?");

  if (queryIndex === -1) return;

  const signedQuery = manifestUrl.slice(queryIndex + 1);
  const manifestBase = manifestUrl.slice(0, queryIndex);

  let manifestOrigin = "";

  try {
    manifestOrigin = new URL(manifestBase).origin;
  } catch (error) {}

  const net = shakaPlayer.getNetworkingEngine && shakaPlayer.getNetworkingEngine();

  if (!net) return;

  net.registerRequestFilter((type, request) => {
    const isManifestOrSegment =
      type === shaka.net.NetworkingEngine.RequestType.MANIFEST ||
      type === shaka.net.NetworkingEngine.RequestType.SEGMENT;

    if (!isManifestOrSegment) return;
    if (!request.uris || !request.uris[0]) return;

    try {
      const u = new URL(request.uris[0], manifestBase);

      if (manifestOrigin && u.origin !== manifestOrigin) return;

      const alreadySigned =
        u.searchParams.has("Signature") ||
        u.searchParams.has("Policy") ||
        u.searchParams.has("Key-Pair-Id") ||
        u.searchParams.has("Expires");

      if (!alreadySigned) {
        const joiner = u.search ? "&" : "?";
        request.uris[0] = u.href + joiner + signedQuery;
      } else {
        request.uris[0] = u.href;
      }
    } catch (error) {
      const reqUrl = request.uris[0];

      const alreadySigned =
        reqUrl.includes("Signature=") ||
        reqUrl.includes("Policy=") ||
        reqUrl.includes("Key-Pair-Id=") ||
        reqUrl.includes("Expires=");

      if (!alreadySigned) {
        request.uris[0] = reqUrl + (reqUrl.includes("?") ? "&" : "?") + signedQuery;
      }
    }
  });
}

/* -------------------------------------------------------
   PLAYER UI
------------------------------------------------------- */

function updateControlsVisibility(show = true) {
  state.controlsVisible = show;

  if (refs.player) refs.player.classList.toggle("controls-visible", show);
  if (refs.root) refs.root.classList.toggle("controls-visible", show);

  if (controlsTimer) clearTimeout(controlsTimer);

  if (
    show &&
    !state.seeking &&
    refs.settingsPanel &&
    !refs.settingsPanel.classList.contains("show")
  ) {
    controlsTimer = setTimeout(() => {
      updateControlsVisibility(false);
    }, 3000);
  }
}

function updatePlayUI() {
  const playSvg = `<path d="M8 5v14l11-7z"/>`;
  const pauseSvg = `<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>`;

  const svg = state.playing ? pauseSvg : playSvg;

  if (refs.playIcon) refs.playIcon.innerHTML = svg;

  if (refs.centerPlay) {
    refs.centerPlay.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${svg}</svg>`;
    refs.centerPlay.classList.toggle("pause", state.playing);
  }

  if (refs.player) refs.player.classList.toggle("playing", state.playing);
  if (refs.root) refs.root.classList.toggle("playing", state.playing);
}

function updateProgressUI() {
  const duration = state.duration || 0;
  const current = state.currentTime || 0;
  const loaded = state.loadedTime || 0;

  const playedPercent = duration ? Math.max(0, Math.min(100, current / duration * 100)) : 0;
  const loadedPercent = duration ? Math.max(0, Math.min(100, loaded / duration * 100)) : 0;

  if (refs.currentTime) refs.currentTime.textContent = formatTime(current);
  if (refs.durationTime) refs.durationTime.textContent = formatTime(duration);

  if (refs.progressPlayed) refs.progressPlayed.style.width = playedPercent + "%";
  if (refs.progressLoaded) refs.progressLoaded.style.width = loadedPercent + "%";
  if (refs.progressThumb) refs.progressThumb.style.left = playedPercent + "%";
}

function updateVolumeUI() {
  const percent = state.muted ? 0 : state.volume * 100;

  if (refs.volumeFill) refs.volumeFill.style.width = percent + "%";
  if (refs.volumeThumb) refs.volumeThumb.style.left = percent + "%";

  const volumeIcon = $("volumeIcon");

  if (volumeIcon) {
    volumeIcon.innerHTML = percent === 0
      ? `<path d="M3 9v6h4l5 4V5L7 9H3zm13 0l5 5m0-5l-5 5"/>`
      : `<path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0014 8v8a4.5 4.5 0 002.5-4z"/>`;
  }
}

/* -------------------------------------------------------
   PLAY / SEEK / VOLUME
------------------------------------------------------- */

function getYTState() {
  if (!ytPlayer || !ytPlayer.getPlayerState) return -1;
  return ytPlayer.getPlayerState();
}

function togglePlay() {
  if (state.youtubeId && ytPlayer) {
    if (getYTState() === 1) {
      ytPlayer.pauseVideo();
      state.playing = false;
    } else {
      ytPlayer.playVideo();
      state.playing = true;
    }

    updatePlayUI();
    updateControlsVisibility(true);
    return;
  }

  const v = refs.video;

  if (!v) return;

  if (v.paused) {
    v.play()
      .then(() => {
        state.playing = true;
        updatePlayUI();
        updateControlsVisibility(true);
      })
      .catch((err) => {
        console.warn(err);
        showError("Playback Blocked", "Browser ne autoplay block kiya. Play button dobara dabao.");
      });
  } else {
    v.pause();
    state.playing = false;
    updatePlayUI();
    updateControlsVisibility(true);
  }
}

function seekBy(seconds) {
  if (state.youtubeId && ytPlayer) {
    const current = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    const target = Math.max(0, Math.min(current + seconds, state.duration || 0));

    ytPlayer.seekTo(target, true);

    state.currentTime = target;
    updateProgressUI();
    return;
  }

  if (refs.video && state.duration > 0) {
    refs.video.currentTime = Math.max(0, Math.min(refs.video.currentTime + seconds, state.duration));
  }
}

function seekToPosition(clientX) {
  if (!refs.progressBar) return;

  const rect = refs.progressBar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const time = ratio * (state.duration || 0);

  if (state.youtubeId && ytPlayer) {
    ytPlayer.seekTo(time, true);
  } else if (refs.video) {
    refs.video.currentTime = time;
  }

  state.currentTime = time;
  updateProgressUI();
}

function setVolume(value) {
  state.volume = Math.max(0, Math.min(1, Number(value)));
  state.muted = state.volume <= 0;

  if (state.youtubeId && ytPlayer) {
    ytPlayer.setVolume(Math.round(state.volume * 100));

    if (state.muted) ytPlayer.mute();
    else ytPlayer.unMute();
  } else if (refs.video) {
    refs.video.volume = state.volume;
    refs.video.muted = state.muted;
  }

  updateVolumeUI();
}

function setPlaybackSpeed(speed) {
  state.playbackSpeed = speed;

  if (refs.speedValue) {
    refs.speedValue.textContent = speed === 1 ? "1" : String(speed);
  }

  if (state.youtubeId && ytPlayer) {
    ytPlayer.setPlaybackRate(speed);
  } else if (refs.video) {
    refs.video.playbackRate = speed;
  }

  closeSettings();
}

/* -------------------------------------------------------
   QUALITY SETTINGS
------------------------------------------------------- */

function getUniqueTracks(tracks) {
  const out = [];

  tracks
    .filter((t) => t.height)
    .sort((a, b) => b.height - a.height)
    .forEach((t) => {
      if (!out.find((x) => x.height === t.height)) {
        out.push(t);
      }
    });

  return out;
}

function refreshQualities() {
  if (!shakaPlayer || !shakaPlayer.getVariantTracks) return;

  const tracks = shakaPlayer.getVariantTracks();

  state.qualities = getUniqueTracks(tracks);

  const active = tracks.find((t) => t.active);

  if (active) {
    state.selectedQuality = active;
  }

  if (refs.qualityRow) {
    refs.qualityRow.style.display = state.qualities.length ? "flex" : "none";
  }

  updateQualityText();

  const pref = parseInt(localStorage.getItem("videoQualityPreference") || "", 10);

  if (pref && !state.manualQuality) {
    const found = tracks.find((t) => t.height === pref);

    if (found) {
      selectQuality(found.id, false);
    }
  }
}

function updateQualityText() {
  if (!refs.qualityValue) return;

  refs.qualityValue.textContent = state.selectedQuality
    ? `${state.selectedQuality.height}p`
    : "Auto";
}

function selectQuality(id, userAction = true) {
  if (!shakaPlayer) return;

  const track = shakaPlayer.getVariantTracks().find((t) => t.id === id);

  if (!track) return;

  shakaPlayer.configure({
    abr: {
      enabled: false
    }
  });

  shakaPlayer.selectVariantTrack(track, true);

  state.selectedQuality = track;
  state.manualQuality = true;
  state.preferredHeight = track.height;

  localStorage.setItem("videoQualityPreference", String(track.height));

  updateQualityText();

  if (userAction) {
    closeSettings();
  }
}

function autoQuality() {
  if (!shakaPlayer) return;

  shakaPlayer.configure({
    abr: {
      enabled: true
    }
  });

  state.selectedQuality = null;
  state.manualQuality = false;
  state.preferredHeight = null;

  localStorage.removeItem("videoQualityPreference");

  updateQualityText();
  closeSettings();
}

/* -------------------------------------------------------
   SETTINGS PANEL
------------------------------------------------------- */

function openSettingsPanel(type) {
  if (!refs.settingsMain || !refs.speedSub || !refs.qualitySub) return;

  refs.settingsMain.style.display = "none";
  refs.speedSub.style.display = type === "speed" ? "block" : "none";
  refs.qualitySub.style.display = type === "quality" ? "block" : "none";

  if (type === "speed") renderSpeedPanel();
  if (type === "quality") renderQualityPanel();
}

function closeSettings() {
  if (!refs.settingsPanel) return;

  refs.settingsPanel.classList.remove("show");

  if (refs.settingsMain) refs.settingsMain.style.display = "block";
  if (refs.speedSub) refs.speedSub.style.display = "none";
  if (refs.qualitySub) refs.qualitySub.style.display = "none";

  updateControlsVisibility(true);
}

function renderSpeedPanel() {
  if (!refs.speedSub) return;

  refs.speedSub.innerHTML = `
    <div class="settings-head">
      <button class="back-small" onclick="backToSettingsMain()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M15 18L9 12L15 6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <h3>Speed</h3>
    </div>
  `;

  [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].forEach((speed) => {
    const div = document.createElement("div");
    const active = state.playbackSpeed === speed;

    div.className = "option" + (active ? " active" : "");
    div.innerHTML = `<span>${speed === 1 ? "Normal (1x)" : speed + "x"}</span><span class="radio"></span>`;
    div.onclick = () => setPlaybackSpeed(speed);

    refs.speedSub.appendChild(div);
  });
}

function renderQualityPanel() {
  if (!refs.qualitySub) return;

  refs.qualitySub.innerHTML = `
    <div class="settings-head">
      <button class="back-small" onclick="backToSettingsMain()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M15 18L9 12L15 6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <h3>Quality</h3>
    </div>
  `;

  const auto = document.createElement("div");

  auto.className = "option" + (!state.selectedQuality ? " active" : "");
  auto.innerHTML = `<span>Auto (recommended)</span><span class="radio"></span>`;
  auto.onclick = autoQuality;

  refs.qualitySub.appendChild(auto);

  state.qualities.forEach((q) => {
    const active = state.selectedQuality && state.selectedQuality.height === q.height;

    const div = document.createElement("div");

    div.className = "option" + (active ? " active" : "");
    div.innerHTML = `<span>${q.height}p</span><span class="radio"></span>`;
    div.onclick = () => selectQuality(q.id);

    refs.qualitySub.appendChild(div);
  });
}

window.backToSettingsMain = function () {
  if (refs.settingsMain) refs.setting