// Performs GitHub content operations for the pipeline using a single server-side
// admin token (GITHUB_TOKEN). Lets invited reviewers publish/edit reviews without
// ever holding the token. Locked to one repo (GITHUB_REPO) to prevent misuse.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REPO = process.env.GITHUB_REPO || 'holly-cyber/WSS-Review-Site';
const DEFAULT_BRANCH = process.env.GITHUB_BRANCH || 'main';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  if (!process.env.GITHUB_TOKEN) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'GitHub is not configured — add GITHUB_TOKEN (and optionally GITHUB_REPO) in the Netlify environment variables.' }) };
  }

  try {
    const { action, path, ref, branch, message, content, sha } = JSON.parse(event.body || '{}');
    const api = `https://api.github.com/repos/${REPO}`;
    const headers = {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'wss-review-pipeline',
      'Content-Type': 'application/json',
    };

    let res;
    if (action === 'get') {
      res = await fetch(`${api}/contents/${path}?ref=${encodeURIComponent(ref || DEFAULT_BRANCH)}`, { headers });
    } else if (action === 'tree') {
      res = await fetch(`${api}/git/trees/${encodeURIComponent(ref || DEFAULT_BRANCH)}?recursive=1&_=${Date.now()}`, { headers });
    } else if (action === 'commits') {
      res = await fetch(`${api}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(ref || DEFAULT_BRANCH)}&per_page=30&_=${Date.now()}`, { headers });
    } else if (action === 'put') {
      const b = { message, content, branch: branch || DEFAULT_BRANCH };
      if (sha) b.sha = sha;
      res = await fetch(`${api}/contents/${path}`, { method: 'PUT', headers, body: JSON.stringify(b) });
    } else if (action === 'delete') {
      res = await fetch(`${api}/contents/${path}`, { method: 'DELETE', headers, body: JSON.stringify({ message, sha, branch: branch || DEFAULT_BRANCH }) });
    } else {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Unknown action' }) };
    }

    const text = await res.text();
    return { statusCode: res.status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: text };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: err.message }) };
  }
};
