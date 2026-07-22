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
        // First try the working API from your network logs
        let targetUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/topics?page=1`;
        console.log('🔄 Fetching topics from:', targetUrl);

        let response = await fetch(targetUrl, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36'
            }
        });

        // Check if response is JSON or HTML
        const contentType = response.headers.get('content-type') || '';
        let topicsData;

        if (contentType.includes('application/json')) {
            topicsData = await response.json();
        } else {
            // If not JSON, it might be HTML error page
            console.log('⚠️ Received non-JSON response, trying alternative API...');
            
            // Try alternative API endpoint from your logs
            const altUrl = `https://studypanda.site/study/batches/${batchId}/subject/${subjectId}/topics?page=1&_rsc=1`;
            console.log('🔄 Trying alternative:', altUrl);
            
            const altResponse = await fetch(altUrl, {
                headers: {
                    'accept': '*/*',
                    'rsc': '1',
                    'Referer': 'https://studypanda.site/',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36'
                }
            });
            
            const altText = await altResponse.text();
            
            // Try to extract JSON from the response
            try {
                // Look for JSON in the response
                const jsonMatch = altText.match(/\{.*\}/s);
                if (jsonMatch) {
                    topicsData = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON found in response');
                }
            } catch (e) {
                throw new Error('Failed to get topics data from both APIs');
            }
        }

        // Extract topics from response
        let topics = topicsData?.data || topicsData?.topics || topicsData;
        
        if (!Array.isArray(topics)) {
            if (topics && typeof topics === 'object') {
                // Try to find array in object
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
                error: 'No topics found for this subject',
                debug: { batchId, subjectId }
            });
        }

        // Find matching topic
        let foundTopic = null;
        const searchSlug = chapterSlug ? chapterSlug.toLowerCase().replace(/-/g, '') : '';
        const searchName = chapterName ? chapterName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

        // Try to find by slug first
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

        // If not found, try by name match
        if (!foundTopic && chapterName) {
            const searchTerms = chapterName.toLowerCase().split(' ');
            for (const topic of topics) {
                const topicName = (topic.name || topic.title || '').toLowerCase();
                let matchCount = 0;
                for (const term of searchTerms) {
                    if (term.length > 2 && topicName.includes(term)) {
                        matchCount++;
                    }
                }
                if (matchCount >= searchTerms.length * 0.5) {
                    foundTopic = topic;
                    break;
                }
            }
        }

        // If still not found, use first topic
        if (!foundTopic) {
            console.log('⚠️ Topic not found, using first topic as fallback');
            foundTopic = topics[0];
        }

        const topicId = foundTopic._id || foundTopic.id || foundTopic.topicId;
        console.log('🎯 Found topic:', foundTopic.name || foundTopic.title, 'ID:', topicId);

        // Fetch videos
        const videosUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/contents?tag=${topicId}&contentType=${contentType || 'videos'}&page=1`;
        console.log('🔄 Fetching videos:', videosUrl);

        const videosResponse = await fetch(videosUrl, {
            headers: {
                'accept': '*/*',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36'
            }
        });

        let videos = [];
        const videoContentType = videosResponse.headers.get('content-type') || '';

        if (videoContentType.includes('application/json')) {
            const videosData = await videosResponse.json();
            videos = videosData.data || videosData.contents || videosData.videos || videosData;
        } else {
            console.log('⚠️ Videos API returned non-JSON, trying to extract data...');
            const videoText = await videosResponse.text();
            try {
                const jsonMatch = videoText.match(/\{.*\}/s);
                if (jsonMatch) {
                    const videosData = JSON.parse(jsonMatch[0]);
                    videos = videosData.data || videosData.contents || videosData.videos || videosData;
                }
            } catch (e) {
                console.log('Could not extract video data');
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

        // Format videos for frontend
        const formattedVideos = videos.map(video => ({
            title: video.title || video.name || video.videoTitle || 'Lecture',
            url: video.url || video.videoUrl || video.link || video.video || '',
            thumbnail: video.thumbnail || video.thumb || video.image || '',
            duration: video.duration || video.videoDuration || ''
        }));

        return res.status(200).json({
            success: true,
            data: formattedVideos,
            topic: {
                id: topicId,
                name: foundTopic.name || foundTopic.title || chapterName || 'Chapter'
            },
            credits: "Developed by The Unknown",
            debug: {
                topicsCount: topics.length,
                videosCount: formattedVideos.length
            }
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