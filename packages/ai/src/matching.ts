import { type PrismaClient } from '@platform/db';

import { generateEmbedding } from './embeddings';

interface MatchResult {
  entityId: string;
  entityType: string;
  similarity: number;
  content: string;
}

/**
 * Generate and store an embedding for a freelancer profile.
 * Combines headline, description, and skills into a single text for embedding.
 */
export async function embedFreelancerProfile(
  prisma: PrismaClient,
  profile: {
    userId: string;
    headline: string | null;
    description: string | null;
    skills: string[];
  },
): Promise<void> {
  const text = [
    profile.headline ?? '',
    profile.description ?? '',
    `מיומנויות: ${profile.skills.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');

  const embedding = await generateEmbedding(text);
  const vectorStr = `[${embedding.join(',')}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO search_embeddings (id, entity_type, entity_id, embedding, content, created_at, updated_at)
     VALUES (gen_random_uuid(), 'FREELANCER', $1, $2::vector, $3, NOW(), NOW())
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET
       embedding = $2::vector,
       content = $3,
       updated_at = NOW()`,
    profile.userId,
    vectorStr,
    text,
  );
}

/**
 * Generate and store an embedding for a project listing.
 * Combines title, description, and skills into a single text.
 */
export async function embedProject(
  prisma: PrismaClient,
  project: {
    id: string;
    title: string;
    description: string;
    skills: string[];
  },
): Promise<void> {
  const text = [
    project.title,
    project.description,
    `דרישות: ${project.skills.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');

  const embedding = await generateEmbedding(text);
  const vectorStr = `[${embedding.join(',')}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO search_embeddings (id, entity_type, entity_id, embedding, content, created_at, updated_at)
     VALUES (gen_random_uuid(), 'PROJECT', $1, $2::vector, $3, NOW(), NOW())
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET
       embedding = $2::vector,
       content = $3,
       updated_at = NOW()`,
    project.id,
    vectorStr,
    text,
  );
}

/**
 * Find freelancers matching a project using cosine similarity.
 * Uses pgvector to find the closest embeddings.
 */
export async function findMatchingFreelancers(
  prisma: PrismaClient,
  projectId: string,
  limit = 10,
): Promise<MatchResult[]> {
  const results = await prisma.$queryRawUnsafe<MatchResult[]>(
    `SELECT
       se2.entity_id AS "entityId",
       se2.entity_type AS "entityType",
       1 - (se1.embedding <=> se2.embedding) AS similarity,
       se2.content
     FROM search_embeddings se1
     JOIN search_embeddings se2
       ON se2.entity_type = 'FREELANCER'
       AND se1.entity_id != se2.entity_id
     WHERE se1.entity_type = 'PROJECT'
       AND se1.entity_id = $1
     ORDER BY se1.embedding <=> se2.embedding ASC
     LIMIT $2`,
    projectId,
    limit,
  );

  return results;
}

/**
 * Find projects matching a freelancer profile using cosine similarity.
 */
export async function findMatchingProjects(
  prisma: PrismaClient,
  userId: string,
  limit = 10,
): Promise<MatchResult[]> {
  const results = await prisma.$queryRawUnsafe<MatchResult[]>(
    `SELECT
       se2.entity_id AS "entityId",
       se2.entity_type AS "entityType",
       1 - (se1.embedding <=> se2.embedding) AS similarity,
       se2.content
     FROM search_embeddings se1
     JOIN search_embeddings se2
       ON se2.entity_type = 'PROJECT'
       AND se1.entity_id != se2.entity_id
     WHERE se1.entity_type = 'FREELANCER'
       AND se1.entity_id = $1
     ORDER BY se1.embedding <=> se2.embedding ASC
     LIMIT $2`,
    userId,
    limit,
  );

  return results;
}

/**
 * Semantic search across all entity types.
 * Generates an embedding for the query text and finds similar content.
 */
export async function semanticSearch(
  prisma: PrismaClient,
  query: string,
  entityType?: string,
  limit = 20,
): Promise<MatchResult[]> {
  const embedding = await generateEmbedding(query);
  const vectorStr = `[${embedding.join(',')}]`;

  const typeFilter = entityType ? `AND entity_type = '${entityType}'` : '';

  const results = await prisma.$queryRawUnsafe<MatchResult[]>(
    `SELECT
       entity_id AS "entityId",
       entity_type AS "entityType",
       1 - (embedding <=> $1::vector) AS similarity,
       content
     FROM search_embeddings
     WHERE 1=1 ${typeFilter}
     ORDER BY embedding <=> $1::vector ASC
     LIMIT $2`,
    vectorStr,
    limit,
  );

  return results;
}
