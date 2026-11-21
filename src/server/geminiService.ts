import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const MODEL_NAME = 'gemini-4-hydrogen';

export const AI_CATEGORIES = [
  'Teaching Quality',
  'Communication',
  'Subject Knowledge',
  'Classroom Environment',
  'Laboratory Facilities',
  'Infrastructure',
  'Examination and Evaluation',
  'Learning Resources',
  'Other',
] as const;

export type AiCategory = (typeof AI_CATEGORIES)[number];

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please configure GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503')) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 700 * Math.pow(2, attempt)));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

export interface SentimentAnalysisResult {
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  confidence_score: number;
  primary_category: AiCategory;
  urgency_level: 'low' | 'medium' | 'high';
  key_phrases: string[];
  model_name: string;
}

export async function analyzeSubmissionWithGemini(input: {
  commentText: string;
  subjectName: string;
  departmentName: string;
  overallSatisfaction: number;
  infrastructureScore: number;
}): Promise<SentimentAnalysisResult> {
  const ai = getGeminiClient();

  const prompt = `Analyze the following student course feedback from Sapthagiri NPS University.
Subject: ${input.subjectName}
Department: ${input.departmentName}
Overall Satisfaction Rating (1-5): ${input.overallSatisfaction}
Infrastructure Rating (1-5): ${input.infrastructureScore}
Student Written Comment: "${input.commentText || 'No written comment provided; base assessment on ratings.'}"

Classify the sentiment (Positive, Negative, or Neutral), confidence score (0.0 to 1.0), primary category (choose strictly from the allowed categories), urgency level (low, medium, high — high if severe facility/safety/teaching issue or rating <= 2.5), and up to 4 concise key phrases.`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction:
          'You are an objective academic quality analyst. Treat sentiment classifications as advisory indicators, never absolute verdicts. Always follow the JSON schema strictly.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentiment: {
              type: Type.STRING,
              enum: ['Positive', 'Negative', 'Neutral'],
            },
            confidence_score: {
              type: Type.NUMBER,
            },
            primary_category: {
              type: Type.STRING,
              enum: [...AI_CATEGORIES],
            },
            urgency_level: {
              type: Type.STRING,
              enum: ['low', 'medium', 'high'],
            },
            key_phrases: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['sentiment', 'confidence_score', 'primary_category', 'urgency_level', 'key_phrases'],
        },
      },
    })
  );

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    sentiment?: 'Positive' | 'Negative' | 'Neutral';
    confidence_score?: number;
    primary_category?: AiCategory;
    urgency_level?: 'low' | 'medium' | 'high';
    key_phrases?: string[];
  };

  const validCategory = AI_CATEGORIES.includes(parsed.primary_category as AiCategory)
    ? (parsed.primary_category as AiCategory)
    : 'Other';

  return {
    sentiment: parsed.sentiment ?? 'Neutral',
    confidence_score: Math.max(0, Math.min(1, Number(parsed.confidence_score ?? 0.85))),
    primary_category: validCategory,
    urgency_level: parsed.urgency_level ?? 'low',
    key_phrases: Array.isArray(parsed.key_phrases) ? parsed.key_phrases.slice(0, 5) : [],
    model_name: MODEL_NAME,
  };
}

export interface InsightsGenerationResult {
  summary_text: string;
  frequent_topics: string[];
  positive_highlights: string[];
  recurring_complaints: string[];
  recommendations: Array<{
    target_type: 'faculty' | 'department' | 'institution';
    recommendation_title: string;
    recommendation_body: string;
    priority: 'low' | 'medium' | 'high';
    is_alert: boolean;
    alert_reason: string;
  }>;
  model_name: string;
}

export async function generateInsightsWithGemini(input: {
  scopeLabel: string;
  submissionsSummary: Array<{
    department: string;
    subject: string;
    faculty: string;
    overall: number;
    infrastructure: number;
    teaching: number;
    comment: string;
  }>;
}): Promise<InsightsGenerationResult> {
  const ai = getGeminiClient();

  const prompt = `Synthesize an executive academic feedback report for "${input.scopeLabel}" at Sapthagiri NPS University based on these anonymized student evaluations:
${JSON.stringify(input.submissionsSummary.slice(0, 40), null, 2)}

Produce:
1. A concise executive summary (2-3 clear sentences).
2. Up to 5 frequent topics mentioned.
3. Up to 4 positive highlights.
4. Up to 4 recurring complaints or bottlenecks.
5. 3 to 5 actionable recommendations (faculty pedagogy advice, department improvements, or institutional alerts when satisfaction drops below 3.5 or facility complaints repeat).`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction:
          'You are a university academic quality advisor. Generate concrete, constructive, privacy-preserving insights grounded strictly in the provided evaluations.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary_text: { type: Type.STRING },
            frequent_topics: { type: Type.ARRAY, items: { type: Type.STRING } },
            positive_highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            recurring_complaints: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  target_type: { type: Type.STRING, enum: ['faculty', 'department', 'institution'] },
                  recommendation_title: { type: Type.STRING },
                  recommendation_body: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                  is_alert: { type: Type.BOOLEAN },
                  alert_reason: { type: Type.STRING },
                },
                required: [
                  'target_type',
                  'recommendation_title',
                  'recommendation_body',
                  'priority',
                  'is_alert',
                  'alert_reason',
                ],
              },
            },
          },
          required: [
            'summary_text',
            'frequent_topics',
            'positive_highlights',
            'recurring_complaints',
            'recommendations',
          ],
        },
      },
    })
  );

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Partial<InsightsGenerationResult>;

  return {
    summary_text: parsed.summary_text || 'Analysis completed.',
    frequent_topics: Array.isArray(parsed.frequent_topics) ? parsed.frequent_topics : [],
    positive_highlights: Array.isArray(parsed.positive_highlights) ? parsed.positive_highlights : [],
    recurring_complaints: Array.isArray(parsed.recurring_complaints) ? parsed.recurring_complaints : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    model_name: MODEL_NAME,
  };
}

export async function chatAssistantWithGemini(input: {
  message: string;
  userRole: string;
  language: string;
  activeCampaigns: Array<{ title: string; open_date: string; close_date: string }>;
}): Promise<{ reply: string; model_name: string }> {
  const ai = getGeminiClient();

  const langMap: Record<string, string> = {
    en: 'English',
    hi: 'Hindi',
    kn: 'Kannada',
    te: 'Telugu',
  };
  const targetLang = langMap[input.language] || 'English';

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `User Role: ${input.userRole}
Preferred Language: ${targetLang}
Active University Feedback Campaigns: ${JSON.stringify(input.activeCampaigns)}
User Question: ${input.message}`,
      config: {
        systemInstruction: `You are the Sapthagiri NPS University Feedback Assistant. Answer clearly and concisely in ${targetLang}. Help students and staff understand how to submit feedback, save drafts, edit before deadlines, protect anonymity, use QR codes, and interpret analytics. Never invent fake campaign dates—use only the active campaigns provided.`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })
  );

  return {
    reply: (response.text ?? 'I could not generate a response right now.').trim(),
    model_name: MODEL_NAME,
  };
}
