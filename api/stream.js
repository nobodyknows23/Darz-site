export default async function handler(req, res) {
    const { video_id, batch_id, subject_id } = req.query;

    try {
        // Step 1: Video details API se URL fetch karein
        const videoApiUrl = `https://apiserver.deltastudy.site/api/pw/video-url-details?batchId=${batch_id}&childId=${video_id}&subjectId=${subject_id}`;
        
        const response = await fetch(videoApiUrl);
        const videoData = await response.json();

        if (!videoData.success) {
            return res.status(404).json({ error: "Video not found" });
        }

        // Step 2: Manifest URL mil gaya
        const manifestUrl = videoData.data[0].url;

        // Step 3: KID aur K (Key) return karein
        // Note: Agar KID/K har video ke liye alag hain, toh aapko apni 
        // internal database ya kisi decoder API se fetch karke yahan dalne honge.
        res.status(200).json({
            manifest: manifestUrl,
            kid: "554eb551054a0ed3e3d9e0527930529b", // Yahan dynamic fetch logic lagayein
            k: "85c2f3ba10c45fdd9147757a29ce066c"    // Yahan dynamic fetch logic lagayein
        });

    } catch (error) {
        res.status(500).json({ error: "Failed to fetch stream details" });
    }
}
