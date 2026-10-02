import type { Version } from './model';
import { numberText, quantity, renderText } from './quantities';
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  );
}
export function htmlSnapshot(version: Version, multiplier: number): string {
  const c = version.content;
  const safe = (s: string) => escape(renderText(c, s, multiplier));
  const ingredients = c.ingredients
    .map(
      (i, n) =>
        (n === 0 || c.ingredients[n - 1].group !== i.group
          ? `<h3>${escape(i.group)}</h3>`
          : '') +
        `<label><input type="checkbox"> <strong>${i.quantities.map((id) => escape(quantity(c, id, multiplier))).join(' · ')}</strong> ${escape(i.name)}</label>`
    )
    .join('');
  const steps = c.steps
    .map(
      (s, i) =>
        `<section><h3>${i + 1}. ${escape(s.title)}</h3>${s.text
          .split('\n\n')
          .map((p) => `<p>${safe(p)}</p>`)
          .join('')}</section>`
    )
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(c.title)}</title><style>body{margin:auto;max-width:730px;padding:24px;background:#fffdf7;color:#273b31;font:18px/1.8 system-ui,sans-serif}h1,h2{font-family:Georgia,serif;line-height:1.2}h1{font-size:42px}h2{margin-top:40px}label{display:block;padding:12px 0;border-bottom:1px solid #ddd}input{width:20px;height:20px}input:checked~strong{opacity:.6}section{border-top:1px solid #ddd;margin-top:22px}a{color:inherit}@media print{input{display:none}section{break-inside:avoid}body{background:white}}</style><h1>${escape(c.title)}</h1><p>${escape(c.description)}</p><p>${numberText(multiplier)}× batch · ${numberText(c.servings[0] * multiplier)}–${numberText(c.servings[1] * multiplier)} servings · ${escape(c.oven)} · ${escape(c.time)}</p><p>Saved version: ${escape(version.summary)}</p><p>${safe(c.equipment)}</p><h2>Ingredients</h2>${ingredients}<h2>Preparation</h2>${steps}${c.source.url ? `<p><a href="${escape(c.source.url)}">${escape(c.source.label)}</a></p>` : ''}<p>Exported from Forkfolio. These selected quantities are a snapshot of this recipe version.</p></html>`;
}
export function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
