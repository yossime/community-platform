import { MeiliSearch } from 'meilisearch';

const globalForMeili = globalThis as unknown as {
  meilisearch: MeiliSearch | undefined;
};

function createMeiliClient(): MeiliSearch {
  if (!process.env.MEILISEARCH_HOST) {
    return new Proxy({} as MeiliSearch, {
      get: (_, prop) => {
        if (typeof prop === 'string') {
          return () => { throw new Error('Meilisearch not configured: missing MEILISEARCH_HOST'); };
        }
      },
    });
  }
  return new MeiliSearch({
    host: process.env.MEILISEARCH_HOST,
    apiKey: process.env.MEILISEARCH_API_KEY,
  });
}

export const meilisearch = globalForMeili.meilisearch ?? createMeiliClient();

if (process.env.NODE_ENV !== 'production') globalForMeili.meilisearch = meilisearch;
