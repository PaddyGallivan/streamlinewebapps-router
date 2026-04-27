export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /setup route: configure CF zones and worker routes
    if (url.pathname === '/setup') {
      return await handleSetup(env);
    }

    // Proxy route: forward to Supabase function based on subdomain
    return await handleProxy(request, env);
  }
};

async function handleSetup(env) {
  const CF_API_TOKEN = env.CF_API_TOKEN;
  const ACCOUNT_ID = env.CF_ACCOUNT_ID;
  const results = [];

  // Step 1: GET zone for streamlinewebapps.com
  const zoneRes = await fetch('https://api.cloudflare.com/client/v4/zones?name=streamlinewebapps.com', {
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const zoneData = await zoneRes.json();

  if (!zoneData.success || !zoneData.result || zoneData.result.length === 0) {
    return new Response(JSON.stringify({ error: 'Zone not found', details: zoneData }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const zoneId = zoneData.result[0].id;
  results.push({ step: 'zone_lookup', zone_id: zoneId, zone_name: 'streamlinewebapps.com' });

  // Step 2: Define all route patterns
  const patterns = [
    'streamline.streamlinewebapps.com/*',
    'support.streamlinewebapps.com/*',
    'school.streamlinewebapps.com/*',
    'kbt.streamlinewebapps.com/*',
    'family.streamlinewebapps.com/*',
    'likeumm.streamlinewebapps.com/*',
    'chat.streamlinewebapps.com/*',
    'lessonlab.streamlinewebapps.com/*',
    'streamlinewebapps.com/*',
    'www.streamlinewebapps.com/*'
  ];

  // Step 3: POST worker routes for each pattern
  for (const pattern of patterns) {
    const routeRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pattern: pattern,
        script: 'streamlinewebapps-proxy'
      })
    });

    const routeData = await routeRes.json();
    results.push({
      pattern,
      success: routeData.success,
      result: routeData.result,
      errors: routeData.errors
    });
  }

  return new Response(JSON.stringify({ success: true, results }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleProxy(request, env) {
  const url = new URL(request.url);
  const hostname = url.hostname; // e.g. kbt.streamlinewebapps.com

  // Extract subdomain
  const parts = hostname.split('.');
  let subdomain = 'streamlinewebapps'; // default for root domain
  if (parts.length >= 3) {
    subdomain = parts[0]; // e.g. "kbt", "lessonlab", "school"
  } else if (parts.length === 2) {
    subdomain = 'streamlinewebapps'; // root domain
  }

  const SUPABASE_BASE = 'https://huvfgenbcaiicatvtxak.supabase.co/functions/v1/';
  const targetUrl = SUPABASE_BASE + subdomain + url.pathname + url.search;

  // Clone and forward request
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow'
  });

  try {
    const response = await fetch(proxyRequest);
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error', message: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}