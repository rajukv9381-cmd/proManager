let refreshInFlight;

async function responseError(response) {
  const data = await response.json().catch(() => ({}));
  const err = new Error(data.error || `Request failed (${response.status}).`);
  err.status = response.status;
  return err;
}

function sessionExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('session:expired'));
}

async function refreshSession() {
  if (!refreshInFlight) {
    const refresh = async () => {
      const response = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!response.ok) {
        if (response.status === 401) sessionExpired();
        throw await responseError(response);
      }
    };
    const locks = globalThis.navigator?.locks;
    refreshInFlight = (locks ? locks.request('promanage-session-refresh', refresh) : refresh())
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function api(url, options = {}) {
  const { body, responseType, ...rest } = options;
  const request = () => fetch(url, {
    ...rest,
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
  });
  let response;
  if (url === '/api/auth/logout') {
    const locks = globalThis.navigator?.locks;
    if (locks) response = await locks.request('promanage-session-refresh', request);
    else {
      if (refreshInFlight) await refreshInFlight;
      response = await request();
    }
  } else {
    response = await request();
  }
  const authEndpoint = ['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/refresh'].includes(url);
  if (response.status === 401 && !authEndpoint) {
    await refreshSession();
    response = await request();
    if (response.status === 401) sessionExpired();
  }
  if (!response.ok) {
    throw await responseError(response);
  }
  return response.status === 204 ? null : responseType === 'blob' ? response.blob() : response.json();
}
