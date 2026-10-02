import { createHmac, timingSafeEqual } from 'node:crypto';
import { error, type RequestEvent } from '@sveltejs/kit';
import { resolve } from 'node:path';
import { Repository } from './repository';
let repository: Repository;
export function repo() {
  return (repository ??= new Repository(
    resolve(process.env.FORKFOLIO_DATA_DIR ?? 'data', 'forkfolio.sqlite')
  ));
}
export function secret() {
  const value = process.env.FORKFOLIO_SECRET;
  if (!value || value.length < 24)
    error(
      503,
      'Server sync is not configured. Set FORKFOLIO_SECRET to at least 24 characters.'
    );
  return value;
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function signature(expiry: string) {
  return createHmac('sha256', secret())
    .update(`forkfolio-owner:${expiry}`)
    .digest('hex');
}
export function session() {
  const expiry = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return `${expiry}.${signature(expiry)}`;
}
export function authorized(event: RequestEvent) {
  secret();
  const token = event.cookies.get('forkfolio-owner') ?? '';
  const [expiry, mac] = token.split('.');
  if (
    !expiry ||
    !mac ||
    !/^\d+$/.test(expiry) ||
    Number(expiry) < Date.now() ||
    !equal(mac, signature(expiry))
  )
    error(401, 'Sign in to sync. Local recipes remain available.');
}
export function sameOrigin(event: RequestEvent) {
  if (event.request.headers.get('origin') !== event.url.origin)
    error(403, 'This request must come from the application origin.');
}
export async function boundedBody(
  request: Request,
  max: number
): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > max)
    error(413, 'Request exceeds the size limit.');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        error(413, 'Request exceeds the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
