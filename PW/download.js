(function () {
    const API_BASE = "https://learnbyakp.onrender.com";
    const els = {
        masterUrl: document.getElementById("masterUrl"),
        urlPrefix: document.getElementById("urlPrefix"),
        keyInput: document.getElementById("keyInput"),
        logList: document.getElementById("logList")
    };

    function log(msg) {
        const time = new Date().toLocaleTimeString();
        els.logList.innerHTML += `<div>[${time}] ${msg}</div>`;
        els.logList.scrollTop = els.logList.scrollHeight;
        console.log(`[${time}] ${msg}`);
    }

    async function fetchKey() {
        const url = els.masterUrl.value.trim();
        const prefix = els.urlPrefix.value.trim();
        if (!url) return log("Error: Master URL missing!");

        log("Fetching KID...");
        try {
            const mpdUrl = url.replace(/\.m3u8/i, ".mpd") + prefix;
            
            // 1. Get KID
            const resKid = await fetch(`${API_BASE}/api/pw/kid?mpdUrl=${encodeURIComponent(mpdUrl)}`);
            if (!resKid.ok) throw new Error("Server connection failed");
            const dataKid = await resKid.json();
            
            if (!dataKid.success) throw new Error("KID not found");
            log("KID Found: " + dataKid.kid);

            // 2. Get Key
            log("Fetching Decryption Key...");
            const resKey = await fetch(`${API_BASE}/api/pw/otp?kid=${encodeURIComponent(dataKid.kid)}`);
            const dataKey = await resKey.json();

            if (dataKey.success && dataKey.key) {
                els.keyInput.value = dataKey.key;
                log("Success: Key populated!");
            } else {
                throw new Error("Key generation failed");
            }
        } catch (e) {
            log("Error: " + e.message);
        }
    }

    // Auto-fill on load
    const params = new URLSearchParams(window.location.search);
    if (params.get("url")) {
        const decoded = decodeURIComponent(params.get("url"));
        const parts = decoded.split("?");
        els.masterUrl.value = parts[0];
        els.urlPrefix.value = parts[1] ? "?" + parts.slice(1).join("?") : "";
        fetchKey();
    }

    document.getElementById("fetchKeyBtn").addEventListener("click", fetchKey);
})();
