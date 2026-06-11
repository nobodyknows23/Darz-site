async function fetchContent(bId, sId, tId, tab, callback) {
    // Ham direct API hit nahi karenge, ham apni Vercel API ko hit karenge
    // Vercel API aage Cloudflare bypass handle karegi
    const proxyUrl = `/api/get-lectures?batch_id=${bId}&subject_id=${sId}&topic_id=${tId}&tab=${tab}`;

    try {
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        callback(data);
    } catch (error) {
        console.error("Fetch Error:", error);
        // Agar error aaye to user ko batane ke liye
        document.getElementById("loadingScreen").innerText = "Failed to load content. Please refresh.";
    }
}
