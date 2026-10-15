import { inspectImage, MAX_IMAGE_BYTES, UUID } from '../_shared/campaign-utils.js';
import { readBytes, RequestLimitError } from '../security.js';

// Called only after admin-api verifies Auth, session, active membership and quota.
// Product uploads keep their existing bucket and user-owned path. No delivery
// table grants or Storage policies need to be widened for this operation.
export async function uploadProductImage(req, db, user) {
  if (!UUID.test(user?.id || '')) throw new RequestLimitError('Entre novamente no painel.', 401);
  const bytes = await readBytes(req, MAX_IMAGE_BYTES);
  let metadata;
  try { metadata = inspectImage(bytes, req.headers.get('content-type')?.split(';')[0]); }
  catch (error) { throw new RequestLimitError(error.message, 400); }
  const bucket = db.storage.from('product-images');
  const path = `${user.id}/${crypto.randomUUID()}.${metadata.extension}`;
  const { error } = await bucket.upload(path, bytes, { contentType: metadata.mime, upsert: false });
  if (error) throw new RequestLimitError('Não foi possível guardar a imagem. Tente novamente em instantes.', 503);
  return { url: bucket.getPublicUrl(path).data.publicUrl };
}
