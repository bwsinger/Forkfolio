import cinnamon from './cinnamon-rolls.json';
import { contentSchema, emptyLibrary, type Library } from './model';
export function seededLibrary(): Library {
  const library = emptyLibrary();
  library.recipes.cinnamon = { id: 'cinnamon', current: 'cinnamon-original' };
  library.versions['cinnamon-original'] = {
    id: 'cinnamon-original',
    recipeId: 'cinnamon',
    parent: null,
    created: '2026-10-01T00:00:00.000Z',
    summary: 'Original recipe',
    content: contentSchema.parse(cinnamon)
  };
  return library;
}
