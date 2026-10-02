import { describe, it, expect } from 'vitest';
import { seededLibrary } from './seed';
import {
  amount,
  parseRatio,
  shaping,
  quantity,
  renderText
} from './quantities';
import {
  overlay,
  contentSchema,
  operationSchema,
  type Operation,
  type Version
} from './model';
import { htmlSnapshot } from './export';
import { Repository } from './server/repository';
const seed = () => seededLibrary().versions['cinnamon-original'];
function publish(
  id: string,
  base = 'cinnamon-original',
  title = id
): Operation {
  const v: Version = {
    ...structuredClone(seed()),
    id,
    parent: base,
    created: new Date().toISOString(),
    summary: id
  };
  v.content.title = title;
  return { id: `op-${id}`, kind: 'publish', base, version: v };
}
describe('cooking quantities', () => {
  it('matches reference shaping, exact allocations, fractions, and fixed guidance', () => {
    const c = seed().content;
    for (const [ratio, rolls, pans, portions, width] of [
      [0.5, 6, 1, 1, 12],
      [0.75, 9, 2, 1, 18],
      [1, 12, 2, 1, 24],
      [1.5, 18, 3, 2, 18],
      [2, 24, 4, 2, 24]
    ]) {
      expect(shaping(c, ratio)).toEqual({
        rolls,
        pans,
        portions,
        width,
        height: 13
      });
      const flourParts = Object.entries(c.quantities)
        .filter(([, q]) => q.from === 'flour-g')
        .map(([id]) => amount(c, id) * ratio);
      expect(flourParts.reduce((a, b) => a + b, 0)).toBeCloseTo(719 * ratio);
    }
    expect(quantity(c, 'egg', 0.5)).toBe('≈ 1 large egg');
    expect(quantity(c, 'sugar', 0.5)).toBe('2 Tbsp. + 2 tsp.');
    expect(quantity(c, 'milk', 2)).toBe('4½ cups');
    expect(renderText(c, c.steps[6].text, 2)).toContain('350°F');
    expect(renderText(c, c.steps[6].text, 2)).toContain('25–30 minutes');
    expect(renderText(c, c.steps[4].text, 2)).toContain('24 × 13-inch');
    expect(parseRatio('3/4')).toBe(0.75);
    expect(parseRatio('3:4')).toBe(0.75);
    for (const value of ['1/0', '0', '101', '-1', 'hello', ''])
      expect(parseRatio(value)).toBeNull();
  });
  it('rejects missing and cyclic allocation references', () => {
    const c = structuredClone(seed().content);
    c.quantities.milk.from = 'missing';
    c.quantities.milk.share = 1;
    expect(contentSchema.safeParse(c).success).toBe(false);
  });
});
it('exports the chosen version and quantities as inert standalone HTML', () => {
  const v = structuredClone(seed());
  v.content.title = '<script>alert("unsafe")</script>';
  const html = htmlSnapshot(v, 0.5);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('0.5× batch');
  expect(html).toContain('359.5 g');
  expect(html).toContain('350°F');
});
it('rejects reserved identities before they can enter local or server records', () => {
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    const op = publish('valid');
    op.id = id;
    expect(operationSchema.safeParse(op).success).toBe(false);
  }
});
describe('durable synchronization', () => {
  it('deduplicates a lost acknowledgment and preserves later offline versions and pinned notes', () => {
    const repo = new Repository(':memory:');
    try {
      const b = publish('B');
      const c = publish('C', 'B');
      const a: Operation = {
        id: 'attempt-operation',
        kind: 'attempt',
        attempt: {
          id: 'attempt-C',
          recipeId: 'cinnamon',
          versionId: 'C',
          created: new Date().toISOString(),
          multiplier: 1,
          notes: 'Fluffy',
          worked: '',
          improve: '',
          changes: '',
          photos: []
        }
      };
      const first = repo.sync([b]);
      const queued = [{ op: c }, { op: a }];
      expect(overlay(first.library, queued, []).recipes.cinnamon.current).toBe(
        'C'
      );
      const next = repo.sync([b, c, a]);
      expect(next.results.map((r) => r.status)).toEqual([
        'accepted',
        'accepted',
        'accepted'
      ]);
      expect(Object.keys(next.library.versions)).toHaveLength(3);
      expect(next.library.attempts['attempt-C'].versionId).toBe('C');
      expect(repo.sync([b, c, a]).library).toEqual(next.library);
      const altered = structuredClone(b);
      if (altered.kind === 'publish')
        altered.version.content.title = 'Different';
      expect(repo.sync([altered]).results[0].status).toBe('blocked');
    } finally {
      repo.close();
    }
  });
  it('retains conflicting branches and their attempts without changing the shared head', () => {
    const repo = new Repository(':memory:');
    try {
      repo.sync([publish('desktop')]);
      const results = repo.sync([publish('B'), publish('C', 'B')]);
      expect(results.results.map((r) => r.status)).toEqual([
        'conflict',
        'conflict'
      ]);
      expect(results.library.recipes.cinnamon.current).toBe('desktop');
      expect(results.library.versions.C.parent).toBe('B');
      expect(
        overlay(results.library, [], [{ recipeId: 'cinnamon', versionId: 'C' }])
          .recipes.cinnamon.current
      ).toBe('C');
      expect(
        repo.sync([publish('resolved', 'desktop')]).library.recipes.cinnamon
          .current
      ).toBe('resolved');
    } finally {
      repo.close();
    }
  });
  it('blocks missing dependencies and keeps photo identities immutable', () => {
    const repo = new Repository(':memory:');
    try {
      expect(repo.sync([publish('C', 'missing')]).results[0].status).toBe(
        'blocked'
      );
      repo.putPhoto('photo', 'image/png', new Uint8Array([1, 2, 3]));
      repo.putPhoto('photo', 'image/png', new Uint8Array([1, 2, 3]));
      expect(() =>
        repo.putPhoto('photo', 'image/png', new Uint8Array([9]))
      ).toThrow();
      const op: Operation = {
        id: 'import-op',
        kind: 'import',
        source: {
          id: 'import-1',
          created: new Date().toISOString(),
          url: '',
          text: 'A recipe',
          instruction: '',
          photos: ['missing']
        }
      };
      expect(repo.sync([op]).results[0].status).toBe('blocked');
      expect(repo.read().imports).toEqual({});
    } finally {
      repo.close();
    }
  });
});
