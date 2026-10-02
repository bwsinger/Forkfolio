import type { Content } from './model';
const format = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 });
const fractions: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 6, '⅙'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [5 / 6, '⅚'],
  [7 / 8, '⅞']
];
export function parseRatio(input: string): number | null {
  const match = input
    .trim()
    .match(/^(\d+(?:\.\d+)?|\.\d+)(?:\s*[/:]\s*(\d+(?:\.\d+)?|\.\d+))?$/);
  const n = match
    ? Number(match[1]) / (match[2] === undefined ? 1 : Number(match[2]))
    : NaN;
  return Number.isFinite(n) && n >= 0.01 && n <= 100 ? n : null;
}
export function numberText(value: number, fraction = false): string {
  const whole = Math.floor(value);
  const f =
    fraction && fractions.find(([n]) => Math.abs(value - whole - n) < 1e-9);
  return f ? (whole || '') + f[1] : format.format(value);
}
function rounded(value: number) {
  const n = Math.round(value);
  return n > 0 && Math.abs(value - n) <= 1 / 8 + 1e-9 ? n : value;
}
export function measurement(value: number, unit: string): string {
  if ((unit === 'cup' || unit === 'packed cup') && value < 1 / 4 - 1e-9) {
    const tbsp = value * 16;
    const whole = Math.floor(tbsp);
    const result =
      tbsp < 1 - 1e-9
        ? measurement(value * 48, 'tsp.')
        : Math.abs(rounded(tbsp) - Math.round(rounded(tbsp))) < 1e-9
          ? measurement(tbsp, 'Tbsp.')
          : whole + ' Tbsp. + ' + measurement((tbsp - whole) * 3, 'tsp.');
    return result + (unit === 'packed cup' ? ' (packed)' : '');
  }
  const n = unit === 'large egg' ? Math.round(value) : rounded(value);
  const plural =
    ['cup', 'packed cup', 'large egg', 'envelope', 'stick'].includes(unit) &&
    (n > 1 + 1e-9 || n === 0)
      ? 's'
      : '';
  return (
    (Math.abs(n - value) > 1e-9 ? '≈ ' : '') +
    numberText(n, unit !== 'g') +
    (unit ? ' ' + unit + plural : '')
  );
}
export function amount(c: Content, id: string): number {
  const q = c.quantities[id];
  return q.from ? c.quantities[q.from].amount * (q.share ?? 0) : q.amount;
}
export function quantity(c: Content, id: string, multiplier: number): string {
  return measurement(amount(c, id) * multiplier, c.quantities[id].unit);
}
export function shaping(c: Content, multiplier: number) {
  if (!c.shaping) return null;
  const rolls = Math.max(1, Math.round(c.shaping.rolls * multiplier));
  const portions = Math.ceil(multiplier);
  return {
    rolls,
    pans: Math.ceil(rolls / c.shaping.perPan),
    portions,
    width: (c.shaping.width * multiplier) / portions,
    height: c.shaping.height
  };
}
export function renderText(
  c: Content,
  text: string,
  multiplier: number
): string {
  const shape = shaping(c, multiplier);
  return text.replace(/\{\{([\w-]+)\}\}/g, (_, id: string) => {
    if (id in c.quantities) return quantity(c, id, multiplier);
    if (shape && id === 'portion-label')
      return shape.portions === 1 ? 'portion' : 'equal portions';
    if (shape && id === 'pan-label')
      return '9-inch round cake pan' + (shape.pans === 1 ? '' : 's');
    if (shape && id in shape)
      return numberText(shape[id as keyof typeof shape]);
    return `{{${id}}}`;
  });
}
export function changes(a: Content, b: Content): string[] {
  const lines: string[] = [];
  if (a.title !== b.title) lines.push(`Title: ${a.title} → ${b.title}`);
  if (
    JSON.stringify(a.ingredients) !== JSON.stringify(b.ingredients) ||
    JSON.stringify(a.quantities) !== JSON.stringify(b.quantities)
  )
    lines.push('Ingredients or quantities changed');
  if (JSON.stringify(a.steps) !== JSON.stringify(b.steps))
    lines.push('Preparation changed');
  if (
    a.equipment !== b.equipment ||
    a.oven !== b.oven ||
    a.time !== b.time ||
    JSON.stringify(a.servings) !== JSON.stringify(b.servings) ||
    JSON.stringify(a.shaping) !== JSON.stringify(b.shaping)
  )
    lines.push('Yield, equipment, or cooking guidance changed');
  if (
    a.description !== b.description ||
    JSON.stringify(a.tags) !== JSON.stringify(b.tags) ||
    JSON.stringify(a.source) !== JSON.stringify(b.source)
  )
    lines.push('Description, tags, or attribution changed');
  return lines.length ? lines : ['No content changes'];
}
