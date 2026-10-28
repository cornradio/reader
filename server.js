/*!
 * Local server for tReader.
 * Serves the app and downloads online URLs on behalf of the page,
 * so the browser is not blocked by cross-origin rules.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, 'src');
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '127.0.0.1';
const maxBytes = 32 * 1024 * 1024;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function charsetName(value) {
  const name = String(value || '').trim().toLowerCase().replace(/['"]/g, '');
  if (!name) return '';
  if (name === 'gb2312' || name === 'gb_2312' || name === 'x-gbk') return 'gbk';
  if (name === 'utf8') return 'utf-8';
  return name;
}

function charsetFrom(contentType, buffer) {
  const header = /charset=([^;]+)/i.exec(contentType || '');
  if (header) return charsetName(header[1]);
  const head = buffer.subarray(0, 4096).toString('latin1');
  const meta = /charset\s*=\s*["']?\s*([\w.-]+)/i.exec(head);
  return meta ? charsetName(meta[1]) : '';
}

function decodeBuffer(buffer, contentType) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  const hinted = charsetFrom(contentType, buffer);
  const list = [];
  if (hinted) list.push(hinted);
  for (const encoding of ['utf-8', 'gbk', 'big5', 'gb18030']) {
    if (!list.includes(encoding)) list.push(encoding);
  }
  for (let i = 0; i < list.length; i++) {
    try {
      return new TextDecoder(list[i], { fatal: i !== list.length - 1 }).decode(buffer);
    } catch (e) {
      // try the next encoding
    }
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, '&');
}

const skipTags = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'head', 'aside', 'form', 'button']);
const blockTags = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'blockquote', 'section', 'article', 'pre', 'hr', 'br']);

function htmlTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return '';
  return decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function htmlToText(html) {
  let text = '';
  let skip = 0;
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][\w:-]*)[^>]*>|[^<]+/gi;
  let match;
  while ((match = tokens.exec(html))) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('<')) {
      if (!match[1]) continue;
      const name = match[1].toLowerCase();
      const closing = token.startsWith('</');
      const selfClosing = token.endsWith('/>') || ['br', 'hr', 'img', 'meta', 'link', 'input', 'source', 'wbr'].includes(name);
      if (skipTags.has(name)) {
        if (!selfClosing) skip += closing ? -1 : 1;
        if (skip < 0) skip = 0;
        continue;
      }
      if (skip) continue;
      if (name === 'br' || name === 'hr' || blockTags.has(name)) text += '\n';
      continue;
    }
    if (skip) continue;
    text += decodeEntities(token);
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function looksBinary(text) {
  const sample = text.slice(0, 8000);
  for (let i = 0; i < sample.length; i++) {
    if (sample.charCodeAt(i) === 0) return true;
  }
  return false;
}

function isHtml(contentType, text) {
  if (/text\/html|application\/xhtml\+xml/i.test(contentType)) return true;
  if (/^text\//i.test(contentType)) return false;
  const head = text.slice(0, 1200).trim().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || /<head[\s>]|<body[\s>]/.test(head);
}

function filenameFrom(target, headers) {
  const disposition = headers.get('content-disposition') || '';
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^UTF-8''/i, '').replace(/^"|"$/g, ''));
    } catch (e) {
      // fall through
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  if (plain) return plain[1];
  try {
    return decodeURIComponent(path.posix.basename(new URL(target).pathname));
  } catch (e) {
    return '';
  }
}

function titleFromName(name, target) {
  let title = name || '';
  let previous = '';
  while (title && title !== previous) {
    previous = title;
    title = title.replace(/\.(txt|text|md|markdown|html?|xhtml|gz)$/i, '');
  }
  if (title && title !== '/') return title;
  try {
    return new URL(target).hostname;
  } catch (e) {
    return target;
  }
}

async function readLimited(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      const error = new Error('size');
      error.code = 'size';
      throw error;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function fetchRemote(target) {
  let response;
  try {
    response = await fetch(target, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'tReader',
        'Accept': 'text/plain, text/html, application/xhtml+xml, */*;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    const error = new Error(e.name === 'TimeoutError' ? 'timeout' : (e.cause && e.cause.code) || e.message);
    error.code = 'fetch';
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.code = 'fetch';
    throw error;
  }
  let buffer = await readLimited(response);
  const contentType = response.headers.get('content-type') || '';
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      buffer = zlib.gunzipSync(buffer);
    } catch (e) {
      const error = new Error('gzip');
      error.code = 'type';
      throw error;
    }
  }
  if (buffer.length > maxBytes) {
    const error = new Error('size');
    error.code = 'size';
    throw error;
  }
  const decoded = decodeBuffer(buffer, contentType);
  if (looksBinary(decoded)) {
    const error = new Error('type');
    error.code = 'type';
    throw error;
  }
  const name = filenameFrom(target, response.headers);
  if (isHtml(contentType, decoded)) {
    const content = htmlToText(decoded);
    if (!content) {
      const error = new Error('empty');
      error.code = 'empty';
      throw error;
    }
    return { title: htmlTitle(decoded) || titleFromName(name, target), content };
  }
  const content = decoded.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
  if (!content.trim()) {
    const error = new Error('empty');
    error.code = 'empty';
    throw error;
  }
  return { title: titleFromName(name, target), content };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/fetch') {
    const target = url.searchParams.get('url') || '';
    let parsed;
    try {
      parsed = new URL(target);
    } catch (e) {
      sendJson(res, 400, { error: 'url' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      sendJson(res, 400, { error: 'url' });
      return;
    }
    try {
      sendJson(res, 200, await fetchRemote(parsed.href));
    } catch (e) {
      const code = e.code === 'size' || e.code === 'type' || e.code === 'empty' || e.code === 'fetch' ? e.code : 'fetch';
      sendJson(res, code === 'size' ? 413 : 502, { error: code, detail: code === 'fetch' ? String(e.message || '') : undefined });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }
  serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`tReader http://${host}:${port}/`);
});
