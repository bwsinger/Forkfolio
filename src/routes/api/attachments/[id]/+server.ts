import { error } from '@sveltejs/kit';
import { authorized, boundedBody, repo, sameOrigin } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';
const valid = (id: string | undefined) => {
  if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    error(400, 'Invalid attachment identity.');
  return id;
};
export const PUT: RequestHandler = async (event) => {
  authorized(event);
  sameOrigin(event);
  const id = valid(event.params.id);
  const type = event.request.headers.get('content-type') ?? '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type))
    error(400, 'Unsupported photo format.');
  const bytes = await boundedBody(event.request, 15 * 1024 * 1024);
  if (!bytes.length) error(400, 'Empty photo.');
  // Verify basic file signatures rather than trusting an uploaded MIME label.
  const png =
    bytes[0] === 137 &&
    Buffer.from(bytes.subarray(1, 8)).equals(
      Buffer.from([80, 78, 71, 13, 10, 26, 10])
    );
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP';
  if (!(
    (type === 'image/png' && png) ||
    (type === 'image/jpeg' && jpeg) ||
    (type === 'image/webp' && webp)
  ))
    error(400, 'Photo bytes do not match their format.');
  try {
    repo().putPhoto(id, type, bytes);
  } catch {
    error(409, 'Photo identity already has different content.');
  }
  return new Response(null, { status: 204 });
};
export const GET: RequestHandler = (event) => {
  authorized(event);
  const photo = repo().photo(valid(event.params.id));
  if (!photo) error(404, 'Photo not found.');
  return new Response(Buffer.from(photo.bytes), {
    headers: {
      'Content-Type': photo.mime,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
};
