import React, {type KeyboardEvent, useCallback, useMemo} from 'react';
import {FaBuilding, FaCalendarAlt, FaExternalLinkAlt, FaMapMarkerAlt, FaTag} from 'react-icons/fa';
import './KanbanCard.scss';

type Props = {
  readonly id: string;
  readonly title: string;
  readonly company?: string;
  readonly date?: string; // DD.MM.YYYY (також підтримує DD-MM-YYYY / DD/MM/YYYY)
  readonly location?: string;
  readonly link?: string;
  readonly tag?: string;
  readonly onClick?: () => void;

  /** рядок пошуку для підсвітки збігів у title/company */
  readonly highlight?: string;
};

/** Парсинг "DD.MM.YYYY" (толерує -, /) у Date або null */
const parseDDMMYYYY = (src?: string): Date | null => {
  if (!src) return null;
  const m = src.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

/** Чи дата в межах останніх N днів (включно) */
const isRecent = (dateStr?: string, days = 2): boolean => {
  const dt = parseDDMMYYYY(dateStr);
  if (!dt) return false;
  const diffDays = (Date.now() - dt.getTime()) / 86_400_000;
  return diffDays >= 0 && diffDays <= days;
};

/** safe-екранування токенів для RegExp */
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** побудова regex для підсвітки кількох слів, без дублікатів, довші спочатку */
const makeHighlightRegex = (q?: string): RegExp | null => {
  const raw = (q || '').trim().toLowerCase();
  if (!raw) return null;

  const tokens = Array.from(
    new Set(
      raw
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => b.length - a.length);

  if (!tokens.length) return null;
  return new RegExp(`(${tokens.map(esc).join('|')})`, 'gi');
};

/** рендер тексту з підсвіткою збігів */
const renderWithMark = (text?: string, rx?: RegExp | null): React.ReactNode => {
  if (!text || !rx) return text || '';
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = rx.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > lastIdx) out.push(text.slice(lastIdx, start));
    out.push(
      <mark key={`${start}-${end}`} className="kanban-card__mark">
        {text.slice(start, end)}
      </mark>,
    );
    lastIdx = end;
    if (rx.lastIndex === start) rx.lastIndex++; // запобігаємо зацикленню на zero-width
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
};

const KanbanCard: React.FC<Props> = React.memo(
  ({id, title, company, date, location, link, tag, onClick, highlight}) => {
    const recent = useMemo(() => isRecent(date, 2), [date]);
    const rx = useMemo(() => makeHighlightRegex(highlight), [highlight]);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      },
      [onClick],
    );

    return (
      <div
        className="kanban-card"
        data-id={id}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-label={title}
      >
        {recent && (
          <span className="kanban-card__badge-abs" aria-label="Added in the last 2 days">
            NEW
          </span>
        )}

        <div className="kanban-card__top">
          <h3 className="kanban-card__title" title={title}>
            {renderWithMark(title, rx)}
          </h3>

          {link && (
            <a
              className="kanban-card__link"
              href={link}
              title="Open vacancy"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <FaExternalLinkAlt />
            </a>
          )}
        </div>

        <div className="kanban-card__chips">
          {company && (
            <span className="kanban-card__chip">
              <FaBuilding className="kanban-card__chip-icon" />
              <span className="kanban-card__chip-text">{renderWithMark(company, rx)}</span>
            </span>
          )}
        </div>

        <div className="kanban-card__meta">
          {location && (
            <div className="kanban-card__meta-item">
              <FaMapMarkerAlt className="kanban-card__meta-icon" />
              <span className="kanban-card__meta-text kanban-card__meta-text--wrap">
                {location}
              </span>
            </div>
          )}

          {date && (
            <div className="kanban-card__meta-item">
              <FaCalendarAlt className="kanban-card__meta-icon" />
              <span className="kanban-card__meta-text">{date}</span>
            </div>
          )}

          {tag?.trim() && (
            <div
              className="kanban-card__meta-item kanban-card__meta-item--tag"
              title={`Tag: ${tag}`}
            >
              <FaTag className="kanban-card__meta-icon" />
              <span className="kanban-card__meta-text">{tag}</span>
            </div>
          )}
        </div>
      </div>
    );
  },
);

KanbanCard.displayName = 'KanbanCard';
export default KanbanCard;
