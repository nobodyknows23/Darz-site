export default async function handler(req, res) {
    const { batchId, subjectId, contentType, topicId, tag } = req.query;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const targetUrl =
        `https://pw.studypanda.site/api/TopicInfo?BatchId=${encodeURIComponent(batchId || "")}` +
        `&SubjectId=${encodeURIComponent(subjectId || "")}` +
        `&TopicId=${encodeURIComponent(topicId || tag || "")}` +
        `&ContentType=${encodeURIComponent(contentType || "videos")}` +
        `&page=1`;

    try {
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: `Target API returned ${response.status}`,
                url: targetUrl
            });
        }

        const data = await response.json();

        return res.status(200).json({
            success: true,
            data: data.data || data,
            url: targetUrl
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
            url: targetUrl
        });
    }
}