import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ModerationResult {
  isApproved: boolean;
  confidence: number;
  flaggedCategories: string[];
  reason?: string;
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const response = await openai.moderations.create({
    model: 'text-moderation-latest',
    input: text,
  });

  const result = response.results[0];
  if (!result) {
    return { isApproved: true, confidence: 1, flaggedCategories: [] };
  }

  const flaggedCategories = Object.entries(result.categories)
    .filter(([, flagged]) => flagged)
    .map(([category]) => category);

  return {
    isApproved: !result.flagged,
    confidence: 1 - Math.max(...Object.values(result.category_scores)),
    flaggedCategories,
    reason: flaggedCategories.length > 0 ? `Flagged: ${flaggedCategories.join(', ')}` : undefined,
  };
}

export async function moderateImage(imageUrl: string): Promise<ModerationResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a content moderation system for a Haredi (ultra-Orthodox Jewish) professional community. Check the image for: 1) Images of women or immodest content, 2) Violent/graphic content, 3) Inappropriate symbols. Respond with JSON: {"approved": boolean, "reason": string | null}',
      },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: imageUrl } }],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { isApproved: false, confidence: 0, flaggedCategories: ['parse_error'], reason: 'Failed to parse moderation response' };
  }

  const parsed = JSON.parse(content) as { approved: boolean; reason: string | null };
  return {
    isApproved: parsed.approved,
    confidence: 1,
    flaggedCategories: parsed.approved ? [] : ['modesty_violation'],
    reason: parsed.reason ?? undefined,
  };
}
