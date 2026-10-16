import { ThemeTag } from '../types';

const intensityColors = ['#30D158', '#9ACD32', '#FFD60A', '#FF9F0A', '#FF453A'] as const;
const plainColors = [
  { background: 'rgba(10,132,255,.16)', border: 'rgba(10,132,255,.35)', text: '#64B5FF' },
  { background: 'rgba(191,90,242,.16)', border: 'rgba(191,90,242,.35)', text: '#D08BFF' },
  { background: 'rgba(255,159,10,.16)', border: 'rgba(255,159,10,.35)', text: '#FFB340' },
  { background: 'rgba(48,209,88,.16)', border: 'rgba(48,209,88,.35)', text: '#70E58C' },
  { background: 'rgba(255,55,95,.16)', border: 'rgba(255,55,95,.35)', text: '#FF7A96' }
] as const;

function plainColor(label: string) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return plainColors[hash % plainColors.length];
}

function intensityLabel(tag: Extract<ThemeTag, { kind: 'special' }>) {
  return `${tag.label}（${tag.level}/5）`;
}

export function ThemeTags({ tags }: { tags: ThemeTag[] }) {
  if (tags.length === 0) return null;

  const orderedTags = [...tags].sort((a, b) => {
    const aSpecial = a.kind === 'special' ? 0 : 1;
    const bSpecial = b.kind === 'special' ? 0 : 1;
    if (aSpecial !== bSpecial) return aSpecial - bSpecial;
    if (a.kind === 'special' && b.kind === 'special') return a.level - b.level;
    return 0;
  });

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[46%] shrink-0">
      {orderedTags.map((tag, index) => {
        if (tag.kind === 'special') {
          const color = intensityColors[tag.level - 1];
          return (
            <span
              key={`${tag.kind}-${tag.type}-${tag.label}-${index}`}
              title={intensityLabel(tag)}
              aria-label={intensityLabel(tag)}
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-1"
              style={{ borderColor: `${color}66`, backgroundColor: `${color}1A`, color }}
            >
              <span className="inline-flex h-3.5 items-end gap-px" aria-hidden="true">
                {[1, 2, 3, 4, 5].map(bar => (
                  <span
                    key={bar}
                    className="w-[2px] rounded-sm"
                    style={{
                      height: `${bar * 2 + 2}px`,
                      backgroundColor: bar <= tag.level ? color : 'rgba(255,255,255,.2)'
                    }}
                  />
                ))}
              </span>
              <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{tag.label}</span>
            </span>
          );
        }

        const color = plainColor(tag.label);
        return (
          <span
            key={`${tag.kind}-${tag.label}-${index}`}
            className="rounded-full border px-2 py-1 text-[10px] font-semibold leading-none whitespace-nowrap"
            style={{ backgroundColor: color.background, borderColor: color.border, color: color.text }}
          >
            {tag.label}
          </span>
        );
      })}
    </div>
  );
}

