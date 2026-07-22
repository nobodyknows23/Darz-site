export default async function handler(req, res) {
    const { batchId, subjectId, contentType, chapterSlug, chapterName } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Validate required params
    if (!batchId || !subjectId) {
        return res.status(400).json({ 
            success: false,
            error: "Required parameters: batchId and subjectId",
            debug: { batchId, subjectId }
        });
    }

    try {
        console.log('📥 Request received:', { batchId, subjectId, chapterSlug, chapterName });

        // ============================================================
        // STEP 1: Fetch topics for this subject
        // ============================================================
        const topicsUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/topics?page=1`;
        console.log('🔄 Fetching topics from:', topicsUrl);

        const topicsResponse = await fetch(topicsUrl, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9',
                'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36'
            }
        });

        if (!topicsResponse.ok) {
            throw new Error(`Topics API returned ${topicsResponse.status}`);
        }

        // Check if response is JSON
        const topicsContentType = topicsResponse.headers.get('content-type') || '';
        let topicsData;

        if (topicsContentType.includes('application/json')) {
            topicsData = await topicsResponse.json();
        } else {
            const text = await topicsResponse.text();
            console.log('⚠️ Topics API returned HTML, trying to extract data...');
            
            // Try to extract JSON from HTML
            const jsonMatch = text.match(/\{[^{]*"data"[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    topicsData = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    throw new Error('Could not parse topics data');
                }
            } else {
                throw new Error('Topics API returned HTML instead of JSON');
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
                error: 'No topics found for this subject',
                debug: { batchId, subjectId }
            });
        }

        // ============================================================
        // STEP 2: Find matching topic
        // ============================================================
        let foundTopic = null;
        const searchSlug = chapterSlug ? chapterSlug.toLowerCase().replace(/-/g, '') : '';
        const searchName = chapterName ? chapterName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

        console.log('🔍 Searching for topic:', { searchSlug, searchName });

        // Try exact match first
        for (const topic of topics) {
            const topicSlug = (topic.slug || topic.name || topic.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const topicName = (topic.name || topic.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (searchSlug && (topicSlug === searchSlug || topicSlug.includes(searchSlug) || searchSlug.includes(topicSlug))) {
                foundTopic = topic;
                console.log('✅ Found by slug match:', topic.name || topic.title);
                break;
            }
            if (searchName && (topicName === searchName || topicName.includes(searchName) || searchName.includes(topicName))) {
                foundTopic = topic;
                console.log('✅ Found by name match:', topic.name || topic.title);
                break;
            }
        }

        // If not found, try partial match
        if (!foundTopic && chapterName) {
            const searchTerms = chapterName.toLowerCase().split(' ');
            let bestMatch = null;
            let bestScore = 0;

            for (const topic of topics) {
                const topicName = (topic.name || topic.title || '').toLowerCase();
                let score = 0;
                for (const term of searchTerms) {
                    if (term.length > 2 && topicName.includes(term)) {
                        score++;
                    }
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = topic;
                }
            }

            if (bestMatch && bestScore >= searchTerms.length * 0.3) {
                foundTopic = bestMatch;
                console.log('✅ Found by partial match:', bestMatch.name || bestMatch.title, 'Score:', bestScore);
            }
        }

        // If still not found, use first topic as fallback
        if (!foundTopic) {
            console.log('⚠️ No matching topic found, using first topic as fallback');
            foundTopic = topics[0];
        }

        const topicId = foundTopic._id || foundTopic.id || foundTopic.topicId;
        const topicName = foundTopic.name || foundTopic.title || chapterName || 'Chapter';
        console.log('🎯 Selected topic:', topicName, 'ID:', topicId);

        // ============================================================
        // STEP 3: Fetch videos for this topic
        // ============================================================
        const videosUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/contents?tag=${topicId}&contentType=${contentType || 'videos'}&page=1`;
        console.log('🔄 Fetching videos from:', videosUrl);

        const videosResponse = await fetch(videosUrl, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9',
                'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36'
            }
        });

        let videos = [];
        const videosContentType = videosResponse.headers.get('content-type') || '';

        if (videosResponse.ok && videosContentType.includes('application/json')) {
            const videosData = await videosResponse.json();
            videos = videosData.data || videosData.contents || videosData.videos || videosData;
        } else {
            const text = await videosResponse.text();
            console.log('⚠️ Videos API returned non-JSON, trying to extract...');
            
            // Try to extract JSON
            const jsonMatch = text.match(/\{[^{]*"data"[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const videosData = JSON.parse(jsonMatch[0]);
                    videos = videosData.data || videosData.contents || videosData.videos || videosData;
                } catch (e) {
                    console.log('Could not parse videos data');
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

        // ============================================================
        // STEP 4: Format response
        // ============================================================
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
            credits: "Developed by The Unknown",
            debug: {
                topicsFound: topics.length,
                videosFound: formattedVideos.length,
                topicId: topicId
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
                chapterSlug,
                chapterName
            }
        });
    }
}