const TOKEN_KEY = 'hk_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// AuthContext registers a function here that logs the user out when the server says 401
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, body, raw = false) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is it running?');
  }

  if (!res.ok) {
    let message = 'Something went wrong';
    try { message = (await res.json()).message || message; } catch { /* not JSON */ }
    if (res.status === 401 && token && path !== '/auth/login') onUnauthorized();
    throw new ApiError(res.status, message);
  }
  return raw ? res : res.json();
}

// POST/PUT/PATCH always send a JSON body (even an empty one), which keeps req.body defined on the server
export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path),
};

// Saves an authenticated response (CSV export, etc.) as a file
export async function download(path, filename) {
  const res = await request('GET', path, undefined, true);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fetches an authenticated response as a Blob (for viewing uploaded IDs)
export async function fetchBlob(path) {
  const res = await request('GET', path, undefined, true);
  return res.blob();
}