exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { apiKey, method = 'GET', path, body } = payload;

  if (!apiKey) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing apiKey' }) };
  }
  if (!path || !path.startsWith('/')) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing or invalid path' }) };
  }

  const url = `https://api.usemotion.com/v1${path}`;
  const fetchOptions = {
    method,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const upstream = await fetch(url, fetchOptions);
    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      body: text || '{}',
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Upstream request failed', detail: err.message }),
    };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
