// api/proxy.js (Video URL)
// api/proxy2.js (Data Content/Key)
// api/proxy3.js (Attachments)
export default async function handler(req, res) {
  const target = req.url.replace('/api/proxy', '').replace('/api/proxy2', '').replace('/api/proxy3', '');
  const response = await fetch(`https://apiserver.deltastudy.site/api/pw${target}`);
  const data = await response.json();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(data);
}
