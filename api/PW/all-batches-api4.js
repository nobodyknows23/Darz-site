export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { batch_id, subject_id, chapter_id, topic_id, tab } = req.query;

    // FIX: Underscore ka dhyan rakhein
    const targetTopicId = topic_id || chapter_id;
    const activeTab = tab || 'videos';

    if (!batch_id || !subject_id || !targetTopicId) {
        return res.status(400).json({ error: "Missing required parameters." });
    }

    try {
        const targetUrl = `https://eduvibe-pw-api.wasmer.app/get-lectures.php?batch_id=${encodeURIComponent(batch_id)}&subject_id=${encodeURIComponent(subject_id)}&topic_id=${encodeURIComponent(targetTopicId)}&tab=${encodeURIComponent(activeTab)}`;

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error("Wasmer API failed");

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: "Upstream fetch error" });
    }
}
