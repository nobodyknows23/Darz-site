async function fetchContent(bId, sId, tId, tab, callback) {
    const targetUrl = `https://edunova-pw.site/api/get-lectures.php?batch_id=${bId}&subject_id=${sId}&topic_id=${tId}&tab=${tab}`;
    
    // Proxy list: Agar ek fail hoti hai, toh dusri try hogi
    const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`
    ];

    async function attemptFetch(index) {
        if (index >= proxies.length) {
            document.getElementById("loadingScreen").innerText = "All proxies failed. API is restricted.";
            return;
        }

        try {
            const response = await fetch(proxies[index], {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) throw new Error("Proxy Blocked");

            const data = await response.json();
            callback(data);
        } catch (error) {
            console.warn(`Proxy ${index} failed, trying next...`);
            attemptFetch(index + 1);
        }
    }

    attemptFetch(0);
}
