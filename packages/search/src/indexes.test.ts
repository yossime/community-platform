import { describe, it, expect } from 'vitest';

import { INDEXES, type IndexName } from './indexes';

describe('Search Indexes', () => {
  it('defines all 7 expected indexes', () => {
    expect(Object.keys(INDEXES)).toHaveLength(7);
  });

  it('includes threads index', () => {
    expect(INDEXES.threads).toBe('threads');
  });

  it('includes projects index', () => {
    expect(INDEXES.projects).toBe('projects');
  });

  it('includes classifieds index', () => {
    expect(INDEXES.classifieds).toBe('classifieds');
  });

  it('includes articles index', () => {
    expect(INDEXES.articles).toBe('articles');
  });

  it('includes courses index', () => {
    expect(INDEXES.courses).toBe('courses');
  });

  it('includes users index', () => {
    expect(INDEXES.users).toBe('users');
  });

  it('includes portfolios index', () => {
    expect(INDEXES.portfolios).toBe('portfolios');
  });

  it('type safety - IndexName accepts valid names', () => {
    const name: IndexName = 'threads';
    expect(name).toBe('threads');
  });
});
