export default async function handler(req, res) {
    const { batchId, subjectId, contentType } = req.query;
    const BEARER_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3ODMxNjEzNDUuNzE2LCJkYXRhIjp7Il9pZCI6IjY2ZDJmMzcwMmZkMGM1N2Q2OGFhMjBmNCIsInVzZXJuYW1lIjoiODkyMDgyMjg0MSIsImZpcnN0TmFtZSI6IlNoaXZhbSIsImxhc3ROYW1lIjoiQWh1amEiLCJvcmdhbml6YXRpb24iOnsiX2lkIjoiNWViMzkzZWU5NWZhYjc0NjhhNzlkMTg5Iiwid2Vic2l0ZSI6InBoeXNpY3N3YWxsYWguY29tIiwibmFtZSI6IlBoeXNpY3N3YWxsYWgifSwiZW1haWwiOiJzaGl2YW1haHVqYTY0NUBnbWFpbC5jb20iLCJyb2xlcyI6WyI1YjI3YmQ5NjU4NDJmOTUwYTc3OGM2ZWYiLCI1Y2M5NWEyZThiZGU0ZDY2ZGU0MDBiMzciXSwiY291bnRyeUdyb3VwIjoiSU4iLCJ0eXBlIjoiVVNFUiJ9LCJqdGkiOiJvcTVxRjN3WVRWQ0RQb0JkNU5xTkhRXzY2ZDJmMzcwMmZkMGM1N2Q2OGFhMjBmNCIsImlhdCI6MTc4MjU1NjU0NX0.5vrqWvBjDtGax6_VAR-_kjEwEOuoqxfKUsy_A4TFYHk";
    
    const targetUrl = `https://api.penpencil.co/v3/batch/contents/${batchId}?subjectSlug=${subjectId}&contentType=${contentType}`;
    
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'authorization': `Bearer ${BEARER_TOKEN}`,
                'client-id': '5eb393ee95fab7468a79d189',
                'accept': 'application/json'
            }
        });
        const data = await response.json();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
