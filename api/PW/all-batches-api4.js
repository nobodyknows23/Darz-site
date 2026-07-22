export default async function handler(req, res) {
    const { batchId, subjectId, contentType, topicId, tag } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!batchId) {
        return res.status(400).json({ 
            error: "Required parameter 'batchId' missing." 
        });
    }

    try {
        // Use the WORKING API endpoints from your network logs
        let targetUrl = '';
        let responseData = null;

        // Determine which endpoint to use based on parameters
        if (topicId || tag) {
            // For videos/contents (from your network logs)
            targetUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/contents?tag=${topicId || tag}&contentType=${contentType || 'videos'}&page=1`;
        } else if (subjectId) {
            // For topics (from your network logs)
            targetUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/topics?page=1`;
        } else {
            // For batch details (from your network logs)
            targetUrl = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/details`;
        }

        console.log('🔄 Fetching from:', targetUrl);

        const response = await fetch(targetUrl, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9',
                'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();

        // Transform data to match expected format (like wasmer API)
        if (data.data) {
            responseData = data.data;
        } else if (data.topics) {
            responseData = data.topics;
        } else if (data.contents) {
            responseData = data.contents;
        } else {
            responseData = data;
        }

        return res.status(200).json({
            success: true,
            data: responseData,
            credits: "Developed by The Unknown",
            source: targetUrl
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        
        // FALLBACK: Try studypanda.site as a backup
        try {
            console.log('🔄 Attempting fallback to studypanda.site...');
            
            let fallbackUrl = `https://studypanda.site/study/batches/${batchId}`;
            if (subjectId) {
                fallbackUrl += `/subject/${subjectId}`;
                if (topicId || tag) {
                    fallbackUrl += `/topic/${topicId || tag}`;
                }
            }
            fallbackUrl += '?_rsc=1';

            const fallbackResponse = await fetch(fallbackUrl, {
                headers: {
                    'accept': '*/*',
                    'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
                    'sec-ch-ua-mobile': '?1',
                    'sec-ch-ua-platform': '"Android"',
                    'Referer': 'https://studypanda.site/',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36'
                }
            });

            const fallbackData = await fallbackResponse.text();
            
            // Try to parse as JSON if possible
            try {
                const jsonData = JSON.parse(fallbackData);
                return res.status(200).json({
                    success: true,
                    data: jsonData,
                    credits: "Developed by The Unknown (Fallback)",
                    source: fallbackUrl
                });
            } catch {
                // Return as HTML if not JSON
                return res.status(200).json({
                    success: true,
                    data: {
                        html: fallbackData.substring(0, 1000) + '...',
                        note: 'HTML response from studypanda.site'
                    },
                    credits: "Developed by The Unknown (Fallback)"
                });
            }

        } catch (fallbackError) {
            console.error('❌ Fallback failed:', fallbackError.message);
            return res.status(500).json({ 
                success: false, 
                error: "Failed to fetch data from both primary and fallback sources.",
                details: error.message,
                credits: "Developed by The Unknown"
            });
        }
    }
}