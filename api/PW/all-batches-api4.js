export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { batchId, subjectId, contentType, chapterSlug, chapterName } = req.query;

    // Validate required params
    if (!batchId || !subjectId) {
        return res.status(400).json({ 
            success: false,
            error: "Required parameters: batchId and subjectId"
        });
    }

    try {
        console.log('📥 API Request:', { batchId, subjectId, chapterSlug });

        // ============================================================
        // STEP 1: Get topics for this subject
        // ============================================================
        const topicsUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/topics?page=1`;
        console.log('🔄 Fetching topics:', topicsUrl);

        const topicsResponse = await fetch(topicsUrl, {
            headers: {
                'accept': '*/*',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36'
            }
        });

        if (!topicsResponse.ok) {
            throw new Error(`Topics API error: ${topicsResponse.status}`);
        }

        let topicsData;
        const contentTypeHeader = topicsResponse.headers.get('content-type') || '';

        if (contentTypeHeader.includes('application/json')) {
            topicsData = await topicsResponse.json();
        } else {
            const text = await topicsResponse.text();
            // Try to extract JSON from HTML
            const jsonMatch = text.match(/\{[\s\S]*"data"[\s\S]*\}/);
            if (jsonMatch) {
                topicsData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Could not parse topics data');
            }
        }

        // Extract topics array
        let topics = topicsData?.data || topicsData?.topics || topicsData;
        
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

        if (topics.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No topics found for this subject'
            });
        }

        // ============================================================
        // STEP 2: Find matching topic
        // ============================================================
        let foundTopic = null;
        const searchSlug = chapterSlug ? chapterSlug.toLowerCase().replace(/-/g, '') : '';
        const searchName = chapterName ? chapterName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

        // Try to find by slug
        for (const topic of topics) {
            const topicSlug = (topic.slug || topic.name || topic.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const topicName = (topic.name || topic.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (searchSlug && (topicSlug === searchSlug || topicSlug.includes(searchSlug) || searchSlug.includes(topicSlug))) {
                foundTopic = topic;
                console.log('✅ Found by slug:', topic.name);
                break;
            }
            if (searchName && (topicName === searchName || topicName.includes(searchName) || searchName.includes(topicName))) {
                foundTopic = topic;
                console.log('✅ Found by name:', topic.name);
                break;
            }
        }

        // If not found, use first topic
        if (!foundTopic) {
            console.log('⚠️ Using first topic as fallback');
            foundTopic = topics[0];
        }

        const topicId = foundTopic._id || foundTopic.id || foundTopic.topicId;
        const topicName = foundTopic.name || foundTopic.title || chapterName || 'Chapter';
        console.log('🎯 Topic:', topicName, 'ID:', topicId);

        // ============================================================
        // STEP 3: Get videos for this topic
        // ============================================================
        const videosUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/contents?tag=${topicId}&contentType=${contentType || 'videos'}&page=1`;
        console.log('🔄 Fetching videos:', videosUrl);

        const videosResponse = await fetch(videosUrl, {
            headers: {
                'accept': '*/*',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36'
            }
        });

        let videos = [];
        const videoContentType = videosResponse.headers.get('content-type') || '';

        if (videosResponse.ok && videoContentType.includes('application/json')) {
            const videosData = await videosResponse.json();
            videos = videosData.data || videosData.contents || videosData.videos || videosData;
        } else {
            const text = await videosResponse.text();
            const jsonMatch = text.match(/\{[\s\S]*"data"[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const videosData = JSON.parse(jsonMatch[0]);
                    videos = videosData.data || videosData.contents || videosData.videos || videosData;
                } catch (e) {
                    console.log('Could not parse videos');
                }
            }
        }

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

        // Format response
        const formattedVideos = videos.map(video => ({
            title: video.title || video.name || video.videoTitle || 'Lecture',
            url: video.url || video.videoUrl || video.link || video.video || '',
            thumbnail: video.thumbnail || video.thumb || video.image || '',
            duration: video.duration || video.videoDuration || '',
            description: video.description || video.desc || ''
        }));

        return res.status(200).json({
            success: true,
            data: formattedVideos,
            topic: {
                id: topicId,
                name: topicName
            },
            credits: "Developed by The Unknown"
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message || "Failed to fetch data",
            debug: {
                batchId,
                subjectId,
                chapterSlug
            }
        });
    }
}