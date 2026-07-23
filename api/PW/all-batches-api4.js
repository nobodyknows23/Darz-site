export default async function handler(req, res) {
    const { batchId, subjectId, contentType, topicId, tag, page } = req.query;

    if (!batchId || !subjectId) {
        return res.status(400).json({
            success: false,
            error: "Missing batchId or subjectId"
        });
    }

    // Your own proxy API
    const targetUrl =
        `https://darzwallah-playerv1.vercel.app/api/lectures?` +
        `batchId=${encodeURIComponent(batchId)}` +
        `&subjectId=${encodeURIComponent(subjectId)}` +
        `&contentType=${encodeURIComponent(contentType || "videos")}` +
        `&tag=${encodeURIComponent(topicId || tag || "")}` +
        `&page=${encodeURIComponent(page || 1)}`;

    try {
        const response = await fetch(targetUrl, {
            headers: {
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: `Upstream API returned ${response.status}`
            });
        }

        const data = await response.json();

        return res.status(200).json({
            success: true,
            data: data.data || data || [],
            paginate: data.paginate || null,
            credits: "Developed by Unknown"
        });

    } catch (e) {
        console.error(e);

        return res.status(500).json({
            success: false,
            error: e.message || "Failed",
            credits: "Developed by Unknown"
        });
    }
}