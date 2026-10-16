import { ThemeTag } from '../types';

export function themePriority(theme: { tags: ThemeTag[] }, index: number) {
  const hasMixed = theme.tags.some(tag => tag.kind === 'plain' && tag.label === '混合');
  const intensity = theme.tags.find(
    (tag): tag is Extract<ThemeTag, { kind: 'special' }> =>
      tag.kind === 'special' && tag.type === 'intensity'
  );
  return {
    group: hasMixed ? 0 : intensity ? 1 : 3,
    level: intensity?.level ?? 0,
    index
  };
}
