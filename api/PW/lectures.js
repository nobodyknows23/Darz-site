export default async function handler(req, res) {
    const { 
        batch_id, 
        subject_id, 
        chapter_id, 
        topic_id, 
        tab,
        page = 1,
        limit = 20,
        search,
        sort = 'newest'
    } = req.query;

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Validate required parameters
    const targetTopicId = topic_id || chapter_id;
    const activeTab = tab || 'videos';

    if (!batch_id || !subject_id || !targetTopicId) {
        return res.status(400).json({ 
            success: false,
            error: "Required identity parameters (batch_id, subject_id, or topic_id) missing.",
            required: { batch_id, subject_id, topic_id: targetTopicId }
        });
    }

    // Multiple API endpoints with fallback
    const endpoints = [
        {
            name: 'EduVibe Wasmer',
            url: `https://eduvibe-pw-api.wasmer.app/get-lectures.php?batch_id=${encodeURIComponent(batch_id)}&subject_id=${encodeURIComponent(subject_id)}&topic_id=${encodeURIComponent(targetTopicId)}&tab=${encodeURIComponent(activeTab)}&page=${page}&limit=${limit}`,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
            }
        },
        {
            name: 'StudySpark Proxy',
            url: `https://thestudyspark.site/api-server/v2/batches/${batch_id}/subject/${subject_id}/content?page=${page}&contentType=${activeTab}&tag=${targetTopicId}`,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://pw.live/',
                'Accept': 'application/json',
                'Origin': 'https://pw.live'
            }
        },
        {
            name: 'DevCoderZ Proxy',
            url: `/api/lectures2?batch_id=${batch_id}&subject_id=${subject_id}&topic_id=${targetTopicId}&tab=${activeTab}&page=${page}`,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }
    ];

    let lastError = null;

    // Try each endpoint sequentially
    for (const endpoint of endpoints) {
        try {
            console.log(`🔄 Trying ${endpoint.name}...`);
            
            const response = await fetch(endpoint.url, {
                headers: endpoint.headers,
                timeout: 15000 // 15 second timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Validate response structure
            if (data && (data.data || data.lectures || data.items || Array.isArray(data))) {
                console.log(`✅ ${endpoint.name} succeeded`);
                
                // Standardize response format
                const standardizedData = standardizeResponse(data);
                
                return res.status(200).json({
                    success: true,
                    source: endpoint.name,
                    data: standardizedData,
                    metadata: {
                        total: standardizedData.length,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        hasMore: standardizedData.length >= parseInt(limit)
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                throw new Error('Invalid response structure');
            }

        } catch (error) {
            console.warn(`❌ ${endpoint.name} failed:`, error.message);
            lastError = error;
            continue;
        }
    }

    // If search query, try to filter from fallback data
    if (search) {
        try {
            const searchResults = await searchLectures(batch_id, subject_id, search);
            if (searchResults && searchResults.length > 0) {
                return res.status(200).json({
                    success: true,
                    source: 'Search Fallback',
                    data: searchResults,
                    metadata: { total: searchResults.length, searchQuery: search },
                    timestamp: new Date().toISOString()
                });
            }
        } catch (e) {
            console.warn('Search fallback failed:', e.message);
        }
    }

    // All endpoints failed
    console.error('All lecture sources failed:', lastError?.message);
    
    return res.status(500).json({
        success: false,
        error: "All lecture sources failed",
        details: lastError?.message || 'Unknown error',
        attempted: endpoints.map(e => e.name)
    });
}

/**
 * Standardize response from different API formats
 */
function standardizeResponse(data) {
    let lectures = [];

    // Try different response formats
    if (data.data && Array.isArray(data.data)) {
        lectures = data.data;
    } else if (data.lectures && Array.isArray(data.lectures)) {
        lectures = data.lectures;
    } else if (data.items && Array.isArray(data.items)) {
        lectures = data.items;
    } else if (data.result && Array.isArray(data.result)) {
        lectures = data.result;
    } else if (Array.isArray(data)) {
        lectures = data;
    } else if (data.videos && Array.isArray(data.videos)) {
        lectures = data.videos;
    }

    // Filter and map to standard format
    return lectures
        .filter(item => item && (item._id || item.id || item.videoId || item.video_id))
        .map(item => ({
            id: item._id || item.id || item.videoId || item.video_id || item.lectureId,
            title: item.topic || item.title || item.name || item.lectureName || 'Untitled Lecture',
            description: item.description || item.videoDetails?.description || item.lectureDescription || '',
            thumbnail: item.videoDetails?.image || item.image || item.thumbnail || item.poster || item.thumb || '',
            duration: item.duration || item.videoDetails?.duration || item.lectureDuration || '0:00',
            videoUrl: item.videoUrl || item.url || item.video_url || item.lectureUrl || '',
            isPremium: item.isPremium || item.premium || false,
            isFree: item.isFree || item.free || false,
            views: item.views || item.viewCount || 0,
            likes: item.likes || item.likeCount || 0,
            createdAt: item.createdAt || item.created_at || item.publishedAt,
            chapter: item.chapter || item.chapterName || '',
            subject: item.subject || item.subjectName || '',
            batch: item.batch || item.batchName || '',
            tags: item.tags || item.tag || []
        }))
        .sort((a, b) => {
            // Sort by creation date if available
            if (a.createdAt && b.createdAt) {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            return 0;
        });
}

/**
 * Search lectures using available APIs
 */
async function searchLectures(batchId, subjectId, query) {
    const searchUrl = `https://thestudyspark.site/api-server/v2/batches/${batchId}/subject/${subjectId}/search?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();
    return standardizeResponse(data);
}