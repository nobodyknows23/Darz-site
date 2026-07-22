export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { batchId, subjectId, contentType, tag } = req.query;

    if (!batchId || !subjectId) {
        return res.status(400).json({ 
            success: false,
            error: "Missing required: batchId and subjectId" 
        });
    }

    // Build the URL
    let targetUrl = `https://thestudyspark.site/api-server/v2/batches/${batchId}/subject/${subjectId}/content?page=1&contentType=${contentType || 'videos'}`;
    
    if (tag) {
        targetUrl += `&tag=${tag}`;
    }

    console.log('🔄 Fetching:', targetUrl);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36",
                "Referer": "https://pw.live/",
                "Accept": "application/json"
            }
        });

        if (response.status === 429) {
            return res.status(429).json({ 
                success: false,
                error: "Rate limit exceeded" 
            });
        }

        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false,
                error: `API error: ${response.status}` 
            });
        }

        const data = await response.json();
        
        // Extract videos from response
        let videos = data?.data || data?.videos || data?.contents || [];
        
        if (!Array.isArray(videos) && videos && typeof videos === 'object') {
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

        // Format videos
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
            count: formattedVideos.length,
            credits: "Developed by The Unknown"
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({ 
            success: false,
            error: "Internal Server Error",
            details: error.message 
        });
    }
}