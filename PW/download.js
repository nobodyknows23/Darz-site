(function () {
    const API_BASE = "https://learnbyakp.onrender.com";
    const els = {
        masterUrl: document.getElementById("masterUrl"),
        urlPrefix: document.getElementById("urlPrefix"),
        keyInput: document.getElementById("keyInput"),
        fetchPlaylist: document.getElementById("fetchPlaylist"),
        progressBar: document.getElementById("progressBar"),
        statusText: document.getElementById("statusText"),
        logList: document.getElementById("logList")
    };

    function log(msg) {
        const time = new Date().toLocaleTimeString();
        els.logList.innerHTML += `<div>[${time}] ${msg}</div>`;
        els.logList.scrollTop = els.logList.scrollHeight;
    }

    async function autoFillFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const encodedUrl = params.get("url");
        if (!encodedUrl) return;
        
        const decoded = decodeURIComponent(encodedUrl);
        const parts = decoded.split("?");
        els.masterUrl.value = parts[0];
        els.urlPrefix.value = parts[1] ? "?" + parts.slice(1).join("?") : "";
        
        try {
            const mpdUrl = parts[0].replace(/\.m3u8/i, ".mpd") + els.urlPrefix.value;
            const res = await fetch(`${API_BASE}/api/pw/kid?mpdUrl=${encodeURIComponent(mpdUrl)}`);
            const data = await res.json();
            if (data.success) {
                const oRes = await fetch(`${API_BASE}/api/pw/otp?kid=${encodeURIComponent(data.kid)}`);
                const oData = await oRes.json();
                if (oData.key) {
                    els.keyInput.value = oData.key;
                    log("Key fetched automatically.");
                }
            }
        } catch (e) {
            log("Auto-fill failed.");
        }
    }

    autoFillFromQuery();
})();
