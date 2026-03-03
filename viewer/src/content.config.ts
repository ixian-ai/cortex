import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const characters = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: '../world/characters' }),
  schema: z.object({
    name: z.string(),
    type: z.string().default('character'),
    realm: z.string().default('unknown'),
    model: z.string(),
    maxTokens: z.number(),
    triggers: z.object({
      keywords: z.array(z.string()),
      alwaysRespondTo: z.array(z.string()),
      randomChance: z.number(),
    }),
    energy: z.object({
      max: z.number(),
      responseCost: z.number(),
      emoteCost: z.number(),
      rechargeRate: z.number(),
    }),
    boredom: z.object({
      threshold: z.number(),
      increaseRate: z.number(),
    }),
    cooldownTicks: z.number(),
    emotes: z.record(z.array(z.string())),
  }),
});

const scenes = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: '../world/scenes' }),
  schema: z.object({
    name: z.string(),
    type: z.string().default('scene'),
    realm: z.string().default('unknown'),
    tone: z.string(),
    tickRate: z.number().optional(),
    maxMessages: z.number().optional(),
    dmModel: z.string().optional(),
    dmMaxTokens: z.number().optional(),
    dmEscalationThreshold: z.number().optional(),
    tensionKeywords: z.array(z.string()).optional(),
    toneMap: z.record(z.array(z.string())).optional(),
    events: z.record(z.array(z.object({
      weight: z.number(),
      content: z.string(),
    }))).optional(),
  }),
});

export const collections = { characters, scenes };
