import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value)
  );
const text = z.string().max(20000);
const quantitySchema = z.object({
  amount: z.number().finite().nonnegative().max(1e9),
  unit: z.string().max(40),
  from: id.optional(),
  share: z.number().finite().nonnegative().max(1).optional()
});
export const contentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: text,
    tags: z.array(z.string().max(60)).max(30),
    time: z.string().max(200),
    oven: z.string().max(100),
    servings: z.tuple([
      z.number().positive().max(10000),
      z.number().positive().max(10000)
    ]),
    equipment: text,
    source: z.object({
      label: z.string().max(300),
      url: z.union([
        z.literal(''),
        z
          .url()
          .max(8192)
          .refine((u) => /^https?:/.test(u))
      ])
    }),
    quantities: z.record(id, quantitySchema),
    ingredients: z
      .array(
        z.object({
          id,
          group: z.string().max(100),
          name: z.string().max(500),
          quantities: z.array(id).max(8)
        })
      )
      .min(1)
      .max(200),
    steps: z
      .array(
        z.object({
          id,
          group: z.string().max(100),
          title: z.string().max(200),
          text
        })
      )
      .min(1)
      .max(100),
    shaping: z
      .object({
        rolls: z.number().positive(),
        perPan: z.number().positive(),
        width: z.number().positive(),
        height: z.number().positive()
      })
      .optional()
  })
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    for (const [key, q] of Object.entries(c.quantities)) {
      if (
        q.from &&
        (!c.quantities[q.from] ||
          c.quantities[q.from].from ||
          q.from === key ||
          q.share === undefined)
      )
        fail(`Invalid quantity allocation: ${key}`);
    }
    if (Object.keys(c.quantities).length > 500) fail('Too many quantities');
    if (new TextEncoder().encode(JSON.stringify(c)).length > 512 * 1024)
      fail('Recipe exceeds the 512 KB content limit');
    const refs = [
      ...c.ingredients.flatMap((i) => i.quantities),
      ...[c.equipment, ...c.steps.map((s) => s.text)].flatMap((s) =>
        [...s.matchAll(/\{\{([\w-]+)\}\}/g)].map((m) => m[1])
      )
    ];
    for (const key of refs)
      if (
        !Object.hasOwn(c.quantities, key) &&
        !(
          c.shaping &&
          [
            'rolls',
            'pans',
            'portions',
            'width',
            'height',
            'portion-label',
            'pan-label'
          ].includes(key)
        )
      )
        fail(`Unknown quantity: ${key}`);
    if (
      new Set(c.ingredients.map((i) => i.id)).size !== c.ingredients.length ||
      new Set(c.steps.map((i) => i.id)).size !== c.steps.length
    )
      fail('Ingredient and step identities must be unique');
  });
export type Content = z.infer<typeof contentSchema>;
export const versionSchema = z.object({
  id,
  recipeId: id,
  parent: id.nullable(),
  created: z.string().datetime(),
  summary: z.string().max(1000),
  content: contentSchema
});
export type Version = z.infer<typeof versionSchema>;
export type Recipe = { id: string; current: string; favorite?: string };
export const attemptSchema = z.object({
  id,
  recipeId: id,
  versionId: id,
  created: z.string().datetime(),
  multiplier: z.number().positive().max(100),
  notes: text,
  worked: text,
  improve: text,
  changes: text,
  photos: z.array(id).max(20)
});
export type Attempt = z.infer<typeof attemptSchema>;
export const importSchema = z.object({
  id,
  created: z.string().datetime(),
  url: z.union([
    z.literal(''),
    z
      .url()
      .max(8192)
      .refine((u) => /^https?:/.test(u))
  ]),
  text,
  instruction: text,
  photos: z.array(id).max(20)
});
export type ImportSource = z.infer<typeof importSchema>;
export const operationSchema = z.discriminatedUnion('kind', [
  z.object({
    id,
    kind: z.literal('publish'),
    base: id.nullable(),
    version: versionSchema
  }),
  z.object({ id, kind: z.literal('attempt'), attempt: attemptSchema }),
  z.object({ id, kind: z.literal('import'), source: importSchema })
]);
export type Operation = z.infer<typeof operationSchema>;
export const librarySchema = z.object({
  recipes: z.record(id, z.object({ id, current: id, favorite: id.optional() })),
  versions: z.record(id, versionSchema),
  attempts: z.record(id, attemptSchema),
  imports: z.record(id, importSchema)
});
export type Library = z.infer<typeof librarySchema>;
export const emptyLibrary = (): Library => ({
  recipes: {},
  versions: {},
  attempts: {},
  imports: {}
});
export const replySchema = z.object({
  sequence: z.number().int().nonnegative(),
  library: librarySchema,
  results: z.array(
    z.object({
      id,
      status: z.enum(['accepted', 'conflict', 'blocked']),
      message: z.string().optional(),
      recipeId: id.optional(),
      versionId: id.optional()
    })
  )
});
export type SyncReply = z.infer<typeof replySchema>;
export type Conflict = { recipeId: string; versionId: string };
export type Progress = {
  versionId: string;
  multiplier: number;
  checked: string[];
  stepChecks: string[];
  started: string;
  position: number;
};
export type Pending = { seq?: number; op: Operation };
export function attachments(op: Operation): string[] {
  return op.kind === 'attempt'
    ? op.attempt.photos
    : op.kind === 'import'
      ? op.source.photos
      : [];
}

// Apply local intent over acknowledged server state. Acking an older save never changes a newer queued save.
export function overlay(
  base: Library,
  pending: Pending[],
  conflicts: Conflict[]
): Library {
  const library = structuredClone(base);
  for (const conflict of conflicts)
    if (
      library.recipes[conflict.recipeId] &&
      library.versions[conflict.versionId]
    )
      library.recipes[conflict.recipeId].current = conflict.versionId;
  for (const { op } of pending) {
    if (op.kind === 'publish') {
      library.versions[op.version.id] = op.version;
      library.recipes[op.version.recipeId] = {
        ...library.recipes[op.version.recipeId],
        id: op.version.recipeId,
        current: op.version.id
      };
    } else if (op.kind === 'attempt')
      library.attempts[op.attempt.id] = op.attempt;
    else library.imports[op.source.id] = op.source;
  }
  return library;
}
