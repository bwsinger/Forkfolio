import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { operationSchema } from '#lib/model.ts';
import { authorized, boundedBody, repo, sameOrigin } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';
const schema = z.object({ operations: z.array(operationSchema).max(100) });
export const POST: RequestHandler = async (event) => {
  authorized(event);
  sameOrigin(event);
  const bytes = await boundedBody(event.request, 2 * 1024 * 1024);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    error(400, 'Invalid JSON.');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) error(400, 'Invalid recipe or sync operation.');
  return json(repo().sync(parsed.data.operations), {
    headers: { 'Cache-Control': 'no-store' }
  });
};
