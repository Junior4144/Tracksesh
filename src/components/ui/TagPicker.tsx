import type { ReactNode } from 'react';
import { CheckSmallIcon } from '@/components/icons';
import { slotColor, type Tag } from '@/lib/types';

export function TagPicker({
  tags,
  value,
  onChange,
  children,
}: {
  tags: Tag[];
  value: number | null;
  onChange: (id: number | null) => void;
  children?: ReactNode;
}) {
  return (
    <div className="tag-picker d-flex flex-wrap gap-2" role="group" aria-label="Tag">
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          className={`tag-chip${value === tag.id ? ' selected' : ''}`}
          style={{ '--tag-color': slotColor(tag.color) } as React.CSSProperties}
          aria-pressed={value === tag.id}
          onClick={() => onChange(value === tag.id ? null : tag.id)}
        >
          <span className="tag-dot" />
          {tag.name}
          {tag.is_archived && <span className="text-muted small">(archived)</span>}
          {value === tag.id && <CheckSmallIcon size={11} />}
        </button>
      ))}
      {children}
    </div>
  );
}
