export default async function handler(req, res) {
    const { video_id, batch_id, subject_id } = req.query;

    try {
        // 1. Pehle manifest URL fetch karo
        const videoApiUrl = `https://apiserver.deltastudy.site/api/pw/video-url-details?batchId=${batch_id}&childId=${video_id}&subjectId=${subject_id}`;
        const vRes = await fetch(videoApiUrl);
        const vData = await vRes.json();
        
        if (!vData.success) return res.status(404).json({ error: "Video not found" });
        const manifestUrl = vData.data[0].url;

        // 2. Yahan apni "Key Provider" API call karein
        // Man lijiye aapki API ka format ye hai: /api/get-key?id=video_id
        const keyApiUrl = `https://apiserver.deltastudy.site/api/pw/get-key?contentId=${video_id}`;
        const kRes = await fetch(keyApiUrl);
        const kData = await kRes.json(); 

        // 3. Dynamic KID aur K return karein
        res.status(200).json({
            manifest: manifestUrl,
            kid: kData.kid, // API se aaya hua dynamic KID
            k: kData.key    // API se aayi hui dynamic KEY
        });

    } catch (error) {
        res.status(500).json({ error: "Failed to fetch stream details" });
    }
}
