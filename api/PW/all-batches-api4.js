export default async function handler(req, res) {
    const { batchId, subjectId, contentType, chapterSlug, chapterName } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!batchId || !subjectId) {
        return res.status(400).json({ 
            success: false,
            error: "Required parameters: batchId and subjectId" 
        });
    }

    try {
        let targetUrl = '';
        let videos = [];

        // Step 1: Get all topics for this subject
        const topicsUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/topics?page=1`;
        console.log('🔄 Fetching topics:', topicsUrl);

        const topicsResponse = await fetch(topicsUrl, {
            headers: {
                'accept': '*/*',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36'
            }
        });

        if (!topicsResponse.ok) {
            throw new Error(`Topics API returned ${topicsResponse.status}`);
        }

        const topicsData = await topicsResponse.json();
        let topics = topicsData.data || topicsData.topics || topicsData;

        // Ensure topics is an array
        if (!Array.isArray(topics)) {
            if (topics && typeof topics === 'object') {
                for (const key of Object.keys(topics)) {
                    if (Array.isArray(topics[key])) {
                        topics = topics[key];
                        break;
                    }
                }
            }
            if (!Array.isArray(topics)) {
                topics = [];
            }
        }

        console.log(`📚 Found ${topics.length} topics`);

        // Step 2: Find the matching topic
        let foundTopic = null;
        const searchSlug = chapterSlug ? chapterSlug.toLowerCase().replace(/-/g, '') : '';
        const searchName = chapterName ? chapterName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

        for (const topic of topics) {
            const topicSlug = (topic.slug || topic.name || topic.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const topicName = (topic.name || topic.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (searchSlug && (topicSlug.includes(searchSlug) || searchSlug.includes(topicSlug))) {
                foundTopic = topic;
                break;
            }
            if (searchName && topicName.includes(searchName)) {
                foundTopic = topic;
                break;
            }
        }

        if (!foundTopic) {
            console.log('❌ Topic not found, using first topic as fallback');
            foundTopic = topics[0];
        }

        if (!foundTopic) {
            return res.status(404).json({
                success: false,
                error: 'No topics found for this subject'
            });
        }

        const topicId = foundTopic._id || foundTopic.id || foundTopic.topicId;
        console.log('🎯 Found topic:', foundTopic.name || foundTopic.title, 'ID:', topicId);

        // Step 3: Fetch videos for this topic
        targetUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/contents?tag=${topicId}&contentType=${contentType || 'videos'}&page=1`;
        console.log('🔄 Fetching videos:', targetUrl);

        const videosResponse = await fetch(targetUrl, {
            headers: {
                'accept': '*/*',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36'
            }
        });

        if (!videosResponse.ok) {
            throw new Error(`Videos API returned ${videosResponse.status}`);
        }

        const videosData = await videosResponse.json();
        videos = videosData.data || videosData.contents || videosData.videos || videosData;

        if (!Array.isArray(videos)) {
            if (videos && typeof videos === 'object') {
                for (const key of Object.keys(videos)) {
                    if (Array.isArray(videos[key])) {
                        videos = videos[key];
                        break;
                    }
                }
            }
            if (!Array.isArray(videos)) {
                videos = [];
            }
        }

        console.log(`📺 Found ${videos.length} videos`);

        return res.status(200).json({
            success: true,
            data: videos,
            topic: {
                id: topicId,
                name: foundTopic.name || foundTopic.title || chapterName || 'Chapter'
            },
            credits: "Developed by The Unknown",
            source: targetUrl
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message || "Failed to fetch data"
        });
    }
}