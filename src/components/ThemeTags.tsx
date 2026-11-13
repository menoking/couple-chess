import { ThemeTag } from '../types';

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

export function ThemeTags({ tags }: { tags?: ThemeTag[] }) {
  // 旧存档 / 云同步来的自定义主题可能没有 tags 字段，缺省时必须安全降级
  const list = Array.isArray(tags) ? tags : [];
  if (list.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[46%] shrink-0">
      {list.map((tag, index) => {
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


