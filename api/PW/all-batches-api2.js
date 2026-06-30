export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');        // Change to your domain later for security
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  // Handle OPTIONS request (pre-flight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { batch_id } = req.query;

  if (!batch_id) {
    return res.status(400).json({ success: false, error: "Batch ID missing" });
  }

  try {
    const url = `https://api.penpencil.co/v3/batches/${encodeURIComponent(batch_id)}/details?page=1`;

    const response = await fetch(url);
    const data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Failed to fetch data" });
  }
}