// ============================================================
// PixelPal — Grsai image-generation client (main process)
// ============================================================
// Minimal, dependency-free port of the Grsai async image API
// (see Documents/_grsai_deploy/GRSAI_API_REFERENCE.md).  Used to
// generate cute pixel-art assets (pet avatar, card background)
// on demand.  Network is optional — every call fails gracefully.
//
//   submit:  POST {node}/v1/api/generate   body: replyType=async
//   poll:    GET  {node}/v1/api/result?id={taskId}
//   download:GET  {results[0].url}          → image bytes → base64
// ============================================================

import { app } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { URL } from 'url';

import { GRSAI } from '../shared/constants';

// API key resolution: env var only; remove hardcoded default from public source.
function getApiKey(): string {
  const key = process.env.IMAGE_GEN_GRSAI_API_KEY;
  return key ? key.trim() : '';
}

export interface GenerateOptions {
  aspectRatio?: string; // e.g. "1:1", "16:9"
  model?: string;
}

export interface GenerateResult {
  ok: boolean;
  dataUrl?: string;   // data:image/png;base64,...
  filePath?: string;  // saved copy under userData/generated
  error?: string;
}

// ---- Low-level HTTP helpers ----

interface RawResponse {
  status: number;
  text: string;
}

function requestJson(
  method: 'GET' | 'POST',
  urlStr: string,
  headers: Record<string, string>,
  body?: string,
  timeoutMs = 60000,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

function downloadBinary(urlStr: string, timeoutMs = 120000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && (res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          // Follow a single redirect (CDN)
          downloadBinary(res.headers.location, timeoutMs).then(resolve, reject);
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        const MAX_DOWNLOAD = 10 * 1024 * 1024; // 10 MB
        res.on('data', (c) => {
          total += c.length;
          if (total > MAX_DOWNLOAD) { req.destroy(new Error('download too large')); return; }
          chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('download timeout')));
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- Public API ----

/**
 * Generate one image from a text prompt.  Returns a base64 data URL
 * plus a saved file path on success, or { ok:false, error } on failure.
 * Safe to call without network — it simply resolves ok:false.
 */
export async function generateImage(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: 'no api key' };

  const model = opts.model || GRSAI.defaultModel;
  const aspectRatio = opts.aspectRatio || '1:1';
  const payload = JSON.stringify({ model, prompt, aspectRatio, replyType: 'async' });
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  // 1) Submit (dual-node fallback)
  let baseNode = '';
  let submitBody: any = null;
  for (const node of GRSAI.nodes) {
    try {
      const r = await requestJson('POST', `${node}/v1/api/generate`, headers, payload, 30000);
      if (r.status < 400) {
        baseNode = node;
        submitBody = safeParse(r.text);
        break;
      }
    } catch {
      // try next node
    }
  }
  if (!baseNode || !submitBody) {
    return { ok: false, error: 'all nodes failed to submit' };
  }

  // 2) Resolve the result URL (may be inline, else poll)
  let imageUrl: string | undefined = submitBody?.results?.[0]?.url;
  if (!imageUrl) {
    const taskId = submitBody?.id;
    if (!taskId) return { ok: false, error: 'no task id' };

    for (let i = 0; i < GRSAI.maxPolls; i++) {
      await sleep(GRSAI.pollIntervalMs);
      try {
        const pr = await requestJson(
          'GET',
          `${baseNode}/v1/api/result?id=${encodeURIComponent(taskId)}`,
          { Authorization: `Bearer ${apiKey}` },
          undefined,
          30000,
        );
        const pb = safeParse(pr.text);
        const status = pb?.status;
        if (status === 'succeeded') {
          imageUrl = pb?.results?.[0]?.url;
          break;
        }
        if (status === 'failed' || status === 'violation') {
          return { ok: false, error: `task ${status}` };
        }
      } catch {
        // transient — keep polling
      }
    }
  }

  if (!imageUrl) return { ok: false, error: 'poll timeout' };

  // 3) Download → base64 → save to disk
  try {
    const bin = await downloadBinary(imageUrl);
    const base64 = bin.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    let filePath: string | undefined;
    try {
      const dir = path.join(app.getPath('userData'), 'generated');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      filePath = path.join(dir, `gen_${Date.now()}.png`);
      fs.writeFileSync(filePath, bin);
    } catch {
      // disk write optional
    }

    return { ok: true, dataUrl, filePath };
  } catch (err) {
    return { ok: false, error: `download failed: ${(err as Error).message}` };
  }
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
