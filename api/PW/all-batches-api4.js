export default async function handler(req, res) {
    const { batchId, subjectId, contentType, topicId, tag } = req.query;

    // CHANGE THIS - use the working devcoderz-player API instead
    const targetUrl = `https://devcoderz-player.vercel.app/api/lectures?batchId=${batchId}&subjectId=${subjectId}&contentType=${contentType || 'videos'}&tag=${topicId || tag || ''}&page=1`;

    try {
        const response = await fetch(targetUrl);
        const data = await response.json();

        res.status(200).json({
            success: true,
            data: data.data || data || [],
            credits: "Developed by The DevCoderZ"
        });
    } catch (e) {
        res.status(500).json({ 
            success: false, 
            error: "Failed",
            credits: "Developed by The DevCoderZ"
        });
    }
}