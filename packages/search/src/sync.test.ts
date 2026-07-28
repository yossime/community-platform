import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIndex = {
  addDocuments: vi.fn().mockResolvedValue({ taskUid: 1 }),
  updateDocuments: vi.fn().mockResolvedValue({ taskUid: 2 }),
  deleteDocument: vi.fn().mockResolvedValue({ taskUid: 3 }),
  search: vi.fn().mockResolvedValue({
    hits: [{ id: '1', title: 'Test' }],
    estimatedTotalHits: 1,
  }),
};

vi.mock('./client', () => ({
  meilisearch: {
    index: vi.fn(() => mockIndex),
  },
}));

import { indexDocument, updateDocument, deleteDocument, searchIndex } from './sync';

describe('Search Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('indexDocument', () => {
    it('adds a document to the specified index', async () => {
      const doc = { id: '1', title: 'Test Thread', content: 'Thread content' };
      const result = await indexDocument('threads', doc);

      expect(result.taskUid).toBe(1);
      expect(mockIndex.addDocuments).toHaveBeenCalledWith([doc]);
    });
  });

  describe('updateDocument', () => {
    it('updates a document in the index', async () => {
      const doc = { id: '1', title: 'Updated Title' };
      const result = await updateDocument('threads', doc);

      expect(result.taskUid).toBe(2);
      expect(mockIndex.updateDocuments).toHaveBeenCalledWith([doc]);
    });
  });

  describe('deleteDocument', () => {
    it('deletes a document from the index', async () => {
      const result = await deleteDocument('threads', 'doc-1');

      expect(result.taskUid).toBe(3);
      expect(mockIndex.deleteDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  describe('searchIndex', () => {
    it('searches with default options', async () => {
      const result = await searchIndex('threads', 'test query');

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]).toEqual({ id: '1', title: 'Test' });
      expect(mockIndex.search).toHaveBeenCalledWith('test query', {
        filter: undefined,
        sort: undefined,
        limit: 20,
        offset: 0,
      });
    });

    it('searches with custom options', async () => {
      await searchIndex('projects', 'javascript', {
        filter: 'status = "OPEN"',
        sort: ['createdAt:desc'],
        limit: 10,
        offset: 5,
      });

      expect(mockIndex.search).toHaveBeenCalledWith('javascript', {
        filter: 'status = "OPEN"',
        sort: ['createdAt:desc'],
        limit: 10,
        offset: 5,
      });
    });

    it('uses correct index name', async () => {
      const { meilisearch } = await import('./client');
      await searchIndex('articles', 'test');

      expect(meilisearch.index).toHaveBeenCalledWith('articles');
    });
  });
});
