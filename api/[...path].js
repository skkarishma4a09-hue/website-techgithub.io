import app from '../server/server.js';

export default function handler(req, res) {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const apiPath = requestUrl.searchParams.get('__api_path');

  if (apiPath !== null) {
    requestUrl.searchParams.delete('__api_path');
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${apiPath.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
  }

  return app(req, res);
}
