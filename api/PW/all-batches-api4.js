export default async function handler(req, res) {
    const { batch_id, subject_id, chapter_id, topic_id, chapter_slug } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Validate required parameters
    if (!batch_id || !subject_id) {
        return res.status(400).json({ 
            success: false,
            error: "Required: batch_id and subject_id"
        });
    }

    // Need chapter_id or topic_id to get lectures
    const chapterId = chapter_id || topic_id;
    if (!chapterId) {
        return res.status(400).json({ 
            success: false,
            error: "Required: chapter_id or topic_id"
        });
    }

    try {
        // ============================================================
        // DIRECTLY FETCH LECTURES FOR THIS CHAPTER/TOPIC
        // ============================================================
        // Using the working API from your network logs
        const targetUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batch_id}/subject/${subject_id}/contents?tag=${chapterId}&contentType=videos&page=1`;
        console.log('🔄 Fetching lectures:', targetUrl);

        const response = await fetch(targetUrl, {
            headers: {
                'accept': '*/*',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Extract lectures/videos from response
        let lectures = data?.data || data?.contents || data?.videos || data || [];

        // Ensure lectures is an array
        if (!Array.isArray(lectures)) {
            if (lectures && typeof lectures === 'object') {
                for (const key of Object.keys(lectures)) {
                    if (Array.isArray(lectures[key])) {
                        lectures = lectures[key];
                        break;
                    }
                }
            }
            if (!Array.isArray(lectures)) {
                lectures = [];
            }
        }

        console.log(`📺 Found ${lectures.length} lectures`);

        // ============================================================
        // FORMAT LECTURES FOR player.js
        // ============================================================
        const formattedLectures = lectures.map((lecture, index) => ({
            id: lecture._id || lecture.id || lecture.video_id || `lecture_${index}`,
            title: lecture.title || lecture.name || lecture.video_title || `Lecture ${index + 1}`,
            url: lecture.url || lecture.video_url || lecture.link || lecture.video || '',
            thumbnail: lecture.thumbnail || lecture.thumb || lecture.image || '',
            duration: lecture.duration || lecture.video_duration || '',
            description: lecture.description || lecture.desc || '',
            order: lecture.order || lecture.sequence || index + 1
        }));

        return res.status(200).json({
            success: true,
            data: formattedLectures,
            count: formattedLectures.length,
            chapter_id: chapterId,
            credits: "Developed by The Unknown"
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({ 
            success: false,
            error: error.message || "Failed to fetch lectures"
        });
    }
}