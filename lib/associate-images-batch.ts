/** Slice size for POST /api/repositories/[id]/associate-images when body includes productTake. */
export const ASSOCIATE_IMAGES_STAGING_BATCH_SIZE = 80;

/** Stesso valore; utile per test o doc (non esportare da `route.ts` — Next.js accetta solo export di route). */
export const STAGING_PRODUCT_BATCH_DEFAULT = ASSOCIATE_IMAGES_STAGING_BATCH_SIZE;
