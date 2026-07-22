// test-api.js
export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    
    const { batchId, subjectId } = req.query;
    
    try {
        // Test the topics API directly
        const url = `https://jitu.iownprince5.workers.dev/api/batch/${batchId}/subject/${subjectId}/topics?page=1`;
        
        const response = await fetch(url, {
            headers: {
                'accept': '*/*',
                'Referer': 'https://studypanda.site/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36'
            }
        });
        
        const text = await response.text();
        
        // Try to parse as JSON
        let json = null;
        try {
            json = JSON.parse(text);
        } catch (e) {
            // Not JSON
        }
        
        return res.status(200).json({
            url: url,
            status: response.status,
            contentType: response.headers.get('content-type'),
            isJSON: !!json,
            data: json || text.substring(0, 500),
            fullResponse: text.length > 500 ? text.substring(0, 500) + '...' : text
        });
        
    } catch (error) {
        return res.status(500).json({
            error: error.message
        });
    }
}