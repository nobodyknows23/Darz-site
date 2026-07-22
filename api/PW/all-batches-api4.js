export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { batchId, subjectId, topicId, contentType, page, tag } = req.query;

    // Validate required parameters
    if (!batchId) {
        return res.status(400).json({ 
            success: false,
            error: "Missing required parameter: batchId" 
        });
    }

    if (!subjectId) {
        return res.status(400).json({ 
            success: false,
            error: "Missing required parameter: subjectId" 
        });
    }

    // Build the URL - if topicId or tag is provided, include it
    let targetUrl = `https://thestudyspark.site/api-server/v2/batches/${batchId}/subject/${subjectId}/content?page=${page || 1}&contentType=${contentType || 'videos'}`;
    
    // If tag or topicId is provided, add it to the URL
    if (tag) {
        targetUrl += `&tag=${tag}`;
    } else if (topicId) {
        targetUrl += `&tag=${topicId}`;
    }

    console.log('🔄 Fetching from:', targetUrl);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
                "Referer": "https://pw.live/",
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9"
            }
        });

        // Handle rate limiting
        if (response.status === 429) {
            return res.status(429).json({ 
                success: false,
                error: "Rate limit exceeded. Please try again later." 
            });
        }

        // Handle other errors
        if (!response.ok) {
            console.error('❌ API Error:', response.status, response.statusText);
            return res.status(response.status).json({ 
                success: false,
                error: `External API error: ${response.status} ${response.statusText}` 
            });
        }

        const data = await response.json();
        
        // Check if data is valid
        if (!data) {
            return res.status(404).json({
                success: false,
                error: "No data found"
            });
        }

        // Return the data in a consistent format
        return res.status(200).json({
            success: true,
            data: data.data || data,
            credits: "Developed by The Unknown"
        });

    } catch (error) {
        console.error('❌ Server Error:', error.message);
        return res.status(500).json({ 
            success: false,
            error: "Internal Server Error",
            details: error.message 
        });
    }
}