export default async function handler(req, res) {
    const { batchId, subjectId, contentType, topicId, tag } = req.query;

    
    const targetUrl = `https://pw.studypanda.site/api/TopicInfo?BatchId=${batchId}&SubjectId=${subjectId}&TopicId=${topicId || tag || ''}&ContentType=${contentType}&page=1`;

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