import { z } from "zod";

const id = z.uuid().transform(value => value.toLowerCase());
const platform = { platformID: z.string().trim().min(1).max(80), platformName: z.string().trim().min(1).max(80) };
const recordedAt = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
export const reputationTopics = ["communication", "timing", "accuracy", "handling", "professionalism", "other"] as const;
export const sentiments = ["positive", "mixed", "negative", "unreviewed"] as const;
export const ratingSchema = z.object({ id, ...platform, recordedAt, score: z.number().finite().min(0),
  scale: z.union([z.literal(5), z.literal(100)]), reviewCount: z.number().int().min(0).max(1_000_000_000).optional(),
  notes: z.string().max(500), deleted: z.boolean() }).strict().refine(value => value.score <= value.scale, "The rating must be within its selected scale.");
export const reviewSchema = z.object({ id, ...platform, recordedAt, text: z.string().trim().min(1).max(2000),
  sentiment: z.enum(sentiments), topics: z.array(z.enum(reputationTopics)).max(6).refine(value => new Set(value).size === value.length, "Choose each review topic once."), deleted: z.boolean() }).strict();
export const reputationMutation = z.discriminatedUnion("action", [
  z.object({ mutationId: id, action: z.literal("addRating"), rating: ratingSchema.refine(row => !row.deleted, "Use the delete action to remove a rating.") }).strict(),
  z.object({ mutationId: id, action: z.literal("addReview"), review: reviewSchema.refine(row => !row.deleted, "Use the delete action to remove a review.") }).strict(),
  z.object({ mutationId: id, action: z.literal("deleteRating"), id }).strict(),
  z.object({ mutationId: id, action: z.literal("deleteReview"), id }).strict(),
]);
export type ReputationRating = z.infer<typeof ratingSchema>;
export type ReputationReview = z.infer<typeof reviewSchema>;
export type ReputationTopic = typeof reputationTopics[number];
export type ReputationState = { apiVersion: 1; ratings: ReputationRating[]; reviews: ReputationReview[]; acknowledgedMutationId?: string };
