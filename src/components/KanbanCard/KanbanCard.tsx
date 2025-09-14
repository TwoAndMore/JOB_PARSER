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
};

/** Parse "DD.MM.YYYY" (також толерує -, /) у Date або null */
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

/** Перевіряє, чи дата в межах останніх N днів (включно) */
const isRecent = (dateStr?: string, days = 2): boolean => {
  const dt = parseDDMMYYYY(dateStr);
  if (!dt) return false;
  const diffDays = (Date.now() - dt.getTime()) / 86_400_000; // ms -> days
  return diffDays >= 0 && diffDays <= days;
};

const KanbanCard: React.FC<Props> = React.memo(
  ({id, title, company, date, location, link, tag, onClick}) => {
    const recent = useMemo(() => isRecent(date, 2), [date]);

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
            {title}
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
              <span className="kanban-card__chip-text">{company}</span>
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
