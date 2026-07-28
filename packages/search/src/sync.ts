import { meilisearch } from './client';
import { type IndexName } from './indexes';

export async function indexDocument(indexName: IndexName, document: Record<string, unknown>) {
  const index = meilisearch.index(indexName);
  return index.addDocuments([document]);
}

export async function updateDocument(indexName: IndexName, document: Record<string, unknown>) {
  const index = meilisearch.index(indexName);
  return index.updateDocuments([document]);
}

export async function deleteDocument(indexName: IndexName, documentId: string) {
  const index = meilisearch.index(indexName);
  return index.deleteDocument(documentId);
}

export async function searchIndex(
  indexName: IndexName,
  query: string,
  options?: {
    filter?: string;
    sort?: string[];
    limit?: number;
    offset?: number;
  },
) {
  const index = meilisearch.index(indexName);
  return index.search(query, {
    filter: options?.filter,
    sort: options?.sort,
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
  });
}
