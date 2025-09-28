import React, {type KeyboardEvent, useCallback, useMemo} from 'react';
import {
  FaBuilding,
  FaCalendarAlt,
  FaExternalLinkAlt,
  FaMapMarkerAlt,
  FaPaperclip,
  FaTag,
} from 'react-icons/fa';
import './KanbanCard.scss';

type Props = {
  readonly id: string;
  readonly title: string;
  readonly company?: string;
  readonly date?: string; // DD.MM.YYYY (толерує -, /)
  readonly location?: string;
  readonly link?: string;
  readonly tag?: string;
  readonly source?: string;
  readonly onClick?: () => void;
  readonly highlight?: string;
  readonly hasNotes?: boolean;
};

/** Парсинг "DD.MM.YYYY" у Date або null */
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
    if (rx.lastIndex === start) rx.lastIndex++;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
};

const buildLogoSrc = (source?: string): string | null => {
  if (!source) return null;
  const s = source.trim();
  if (!s) return null;
  return `./logos/${source}.png`;
};

const KanbanCard: React.FC<Props> = React.memo(
  ({id, title, company, date, location, link, tag, source, onClick, highlight, hasNotes}) => {
    const recent = useMemo(() => isRecent(date, 2), [date]);
    const rx = useMemo(() => makeHighlightRegex(highlight), [highlight]);
    const isSelf = id.startsWith('self-');

    const logoPath = useMemo(() => buildLogoSrc(source), [source]);
    const logoLabel = useMemo(() => source?.trim(), [source]);

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
        className={`kanban-card${isSelf ? ' kanban-card--self' : ''}`}
        data-id={id}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-label={title}
        data-recent={recent ? '1' : '0'}
      >
        {/* decorative layers */}
        <span className="kanban-card__border" aria-hidden="true" />
        <span className="kanban-card__sheen" aria-hidden="true" />
        <span className="kanban-card__noise" aria-hidden="true" />

        {/* badges */}
        {recent && (
          <span className="kanban-card__badge-abs" aria-label="Added in the last 2 days">
            NEW
          </span>
        )}
        {hasNotes && (
          <span
            className="kanban-card__badge-abs kanban-card__badge-abs--notes"
            aria-label="Has notes"
            title="Has notes"
          >
            <FaPaperclip className="kanban-card__badge-icon" />
          </span>
        )}

        {/* header */}
        <div className="kanban-card__header">
          <div className="kanban-card__avatar" aria-hidden="true">
            {logoPath ? (
              <img className="kanban-card__avatar-img" src={logoPath} alt="" />
            ) : (
              <span className="kanban-card__avatar-fallback">
                {(company?.trim()?.[0] || title?.trim()?.[0] || '•').toUpperCase()}
              </span>
            )}
          </div>

          <div className="kanban-card__head-body">
            <h3 className="kanban-card__title" title={title}>
              {renderWithMark(title, rx)}
            </h3>

            {/* FULL-WIDTH subtitle rows (company & location). No dot separator. */}
            <div
              className="kanban-card__subtitle"
              title={[company, location].filter(Boolean).join(' · ')}
            >
              {company && (
                <span className="kanban-card__subtitle-item kanban-card__subtitle-item--company">
                  <FaBuilding className="kanban-card__subtitle-icon" />
                  <span className="kanban-card__subtitle-text">{renderWithMark(company, rx)}</span>
                </span>
              )}

              {location && (
                <span className="kanban-card__subtitle-item kanban-card__subtitle-item--location">
                  <FaMapMarkerAlt className="kanban-card__subtitle-icon" />
                  <span className="kanban-card__subtitle-text">{location}</span>
                </span>
              )}
            </div>

            {tag?.trim() && (
              <span className="kanban-card__tag" title={`Tag: ${tag}`}>
                <FaTag className="kanban-card__tag-icon" />
                <span className="kanban-card__tag-text">{tag}</span>
              </span>
            )}
          </div>

          {link && (
            <a
              className="kanban-card__linkbtn"
              href={link}
              title="Open vacancy"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open vacancy"
            >
              <FaExternalLinkAlt />
            </a>
          )}
        </div>

        {/* footer — ONLY DATE (no site/source text here) */}
        <div className="kanban-card__footer">
          {date && (
            <div className="kanban-card__foot-item">
              <FaCalendarAlt className="kanban-card__foot-icon" />
              <span className="kanban-card__foot-text">{date}</span>
            </div>
          )}
        </div>
      </div>
    );
  },
);

KanbanCard.displayName = 'KanbanCard';
export default KanbanCard;
