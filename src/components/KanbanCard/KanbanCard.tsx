import React, { useMemo } from 'react';
import './KanbanCard.scss';
import { FaMapMarkerAlt, FaCalendarAlt, FaExternalLinkAlt, FaBuilding, FaTag } from 'react-icons/fa';

type Props = {
  id: string;
  title: string;
  company?: string;
  date?: string;      // DD.MM.YYYY
  location?: string;
  link?: string;
  tag?: string;       // <— NEW
  onClick?: () => void;
};

const parseDDMMYYYY = (s?: string): Date | null => {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const KanbanCard: React.FC<Props> = ({ id, title, company, date, location, link, tag, onClick }) => {
  const isNew = useMemo(() => {
    const dt = parseDDMMYYYY(date);
    if (!dt) return false;
    const now = new Date();
    const diffDays = (now.getTime() - dt.getTime()) / 86_400_000;
    return diffDays >= 0 && diffDays <= 2;
  }, [date]);

  return (
    <div className="kanban-card" data-id={id} onClick={onClick} role="button" tabIndex={0}>
      {/* Absolute NEW badge */}
      {isNew && (
        <span className="kanban-card__badge-abs" aria-label="Added in the last 2 days">
          NEW
        </span>
      )}

      <div className="kanban-card__top">
        <h3 className="kanban-card__title" title={title}>{title}</h3>
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
            <span className="kanban-card__meta-text kanban-card__meta-text--wrap">{location}</span>
          </div>
        )}

        {date && (
          <div className="kanban-card__meta-item">
            <FaCalendarAlt className="kanban-card__meta-icon" />
            <span className="kanban-card__meta-text">{date}</span>
          </div>
        )}

        {tag && tag.trim() && (
          <div className="kanban-card__meta-item kanban-card__meta-item--tag" title={`Tag: ${tag}`}>
            <FaTag className="kanban-card__meta-icon" />
            <span className="kanban-card__meta-text">{tag}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default KanbanCard;
