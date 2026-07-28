export { moderateText, moderateImage } from './moderation';
export { generateEmbedding, generateEmbeddings } from './embeddings';
export { sanitizeText, validateLength } from './sanitize';
export { runContentModeration } from './pipeline';
export {
  embedFreelancerProfile,
  embedProject,
  findMatchingFreelancers,
  findMatchingProjects,
  semanticSearch,
} from './matching';
export {
  getRecommendedProjectsForFreelancer,
  getRecommendedFreelancersForProject,
} from './recommendations';

export type { ModerationResult } from './moderation';
export type { SanitizeResult } from './sanitize';
export type { ContentModerationInput, ContentModerationOutput } from './pipeline';
export type {
  ProjectRecommendation,
  FreelancerRecommendation,
} from './recommendations';
