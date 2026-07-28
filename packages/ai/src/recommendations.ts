import { type PrismaClient } from '@platform/db';

import { findMatchingProjects, findMatchingFreelancers } from './matching';

export interface ProjectRecommendation {
  projectId: string;
  title: string;
  slug: string;
  budgetMinAgorot: number;
  budgetMaxAgorot: number;
  skills: string[];
  similarity: number;
}

export interface FreelancerRecommendation {
  userId: string;
  displayName: string;
  slug: string;
  headline: string | null;
  skills: string[];
  averageRating: number;
  similarity: number;
}

/**
 * Get recommended projects for a freelancer based on profile embedding similarity.
 */
export async function getRecommendedProjectsForFreelancer(
  prisma: PrismaClient,
  userId: string,
  limit = 5,
): Promise<ProjectRecommendation[]> {
  const matches = await findMatchingProjects(prisma, userId, limit);

  if (matches.length === 0) return [];

  const projectIds = matches.map((m) => m.entityId);

  const projects = await prisma.project.findMany({
    where: {
      id: { in: projectIds },
      status: 'OPEN',
      moderationStatus: 'APPROVED',
    },
    select: {
      id: true,
      title: true,
      slug: true,
      budgetMinAgorot: true,
      budgetMaxAgorot: true,
      skills: true,
    },
  });

  return projects.map((project) => {
    const match = matches.find((m) => m.entityId === project.id);
    return {
      projectId: project.id,
      title: project.title,
      slug: project.slug,
      budgetMinAgorot: project.budgetMinAgorot,
      budgetMaxAgorot: project.budgetMaxAgorot,
      skills: project.skills,
      similarity: match?.similarity ?? 0,
    };
  }).sort((a, b) => b.similarity - a.similarity);
}

/**
 * Get recommended freelancers for a project based on embedding similarity.
 */
export async function getRecommendedFreelancersForProject(
  prisma: PrismaClient,
  projectId: string,
  limit = 5,
): Promise<FreelancerRecommendation[]> {
  const matches = await findMatchingFreelancers(prisma, projectId, limit);

  if (matches.length === 0) return [];

  const userIds = matches.map((m) => m.entityId);

  const profiles = await prisma.freelancerProfile.findMany({
    where: {
      userId: { in: userIds },
      availability: 'AVAILABLE',
    },
    include: {
      user: { select: { id: true, displayName: true, slug: true } },
    },
  });

  return profiles.map((profile) => {
    const match = matches.find((m) => m.entityId === profile.userId);
    return {
      userId: profile.userId,
      displayName: profile.user.displayName,
      slug: profile.user.slug,
      headline: profile.headline,
      skills: profile.skills,
      averageRating: profile.averageRating,
      similarity: match?.similarity ?? 0,
    };
  }).sort((a, b) => b.similarity - a.similarity);
}
