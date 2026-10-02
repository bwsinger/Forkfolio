import { json, error } from '@sveltejs/kit';
import {
  boundedBody,
  equal,
  sameOrigin,
  secret,
  session
} from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';
const failures = new Map<string, { count: number; until: number }>();
export const POST: RequestHandler = async (event) => {
  sameOrigin(event);
  const configured = secret();
  const address = event.getClientAddress();
  const attempt = failures.get(address);
  if (attempt && attempt.until > Date.now() && attempt.count >= 10)
    error(429, 'Too many sign-in attempts. Try again in a few minutes.');
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder().decode(await boundedBody(event.request, 4096))
    );
  } catch {
    error(400, 'Invalid sign-in request.');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('secret' in value) ||
    typeof value.secret !== 'string' ||
    !equal(value.secret, configured)
  ) {
    if (failures.size > 1000) failures.clear();
    failures.set(address, {
      count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1,
      until: Date.now() + 5 * 60 * 1000
    });
    error(401, 'That owner secret does not match.');
  }
  failures.delete(address);
  event.cookies.set('forkfolio-owner', session(), {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: event.url.protocol === 'https:',
    maxAge: 30 * 24 * 60 * 60
  });
  return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
};
