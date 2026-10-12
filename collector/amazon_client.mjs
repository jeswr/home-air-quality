import { sessionRegion, websiteOrigin } from './amazon.mjs';

// Shared read-only connection for the dashboard and capability diagnostic.
export function createAmazonClient(getSession, fetchImpl = fetch) {
  let apiOrigin, routedSession;
  return async function amazon(path, body) {
    const session = getSession();
    const cookie = session?.localCookie || session?.cookie;
    const csrf = session?.csrf || cookie?.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1];
    if (!cookie || !csrf) throw new Error('Sign in to Amazon to connect your monitor.');
    const region = sessionRegion(session);
    const headers = { Cookie: cookie, csrf, 'Content-Type': 'application/json',
      'User-Agent': 'AppleWebKit PitanguiBridge/2.2.595606.0-[HARDWARE=iPhone14_7][SOFTWARE=17.4.1][DEVICE=iPhone]' };
    if (!apiOrigin || routedSession !== session) {
      const discovery = await fetchImpl(`https://alexa.${region}/api/endpoints`, {
        headers, redirect: 'error', signal: AbortSignal.timeout(30000)
      });
      if (!discovery.ok) throw new Error('Amazon could not resolve the regional service.');
      const routing = await discovery.json();
      apiOrigin = websiteOrigin(routing.websiteApiUrl, region);
      routedSession = session;
    }
    const response = await fetchImpl(`${apiOrigin}${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers,
      body: JSON.stringify(body)
    });
    if ([401, 403].includes(response.status)) throw new Error('Amazon rejected this session. Sign in again.');
    if (!response.ok) throw new Error(`Amazon returned HTTP ${response.status}. Try again later.`);
    try { return await response.json(); }
    catch { throw new Error('Amazon returned an unexpected response. Sign in again.'); }
  };
}
