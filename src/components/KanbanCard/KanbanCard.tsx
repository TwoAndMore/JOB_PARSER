import React from 'react';
import './KanbanCard.scss';
import { FaMapMarkerAlt, FaCalendarAlt, FaExternalLinkAlt, FaBuilding } from 'react-icons/fa';

type Props = {
  id: string;
  title: string;
  company?: string;
  date?: string;
  location?: string;
  link?: string;
  onClick?: () => void;
};

const KanbanCard: React.FC<Props> = ({ id, title, company, date, location, link, onClick }: Props) => (
  <div className="kanban-card" data-id={id} onClick={onClick} role="button" tabIndex={0}>
    <div className="kanban-card__top">
      <h3 className="kanban-card__title">{title}</h3>

      {link && (
        <a
          className="kanban-card__link"
          href={link}
          title="Open vacancy"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <FaExternalLinkAlt/>
        </a>
      )}
    </div>

    <div className="kanban-card__chips">
      {company && (
        <span className="kanban-card__chip">
            <FaBuilding className="kanban-card__chip-icon"/>
          {company}
          </span>
      )}
    </div>

    <div className="kanban-card__meta">
      {date && (
        <div className="kanban-card__meta-item">
          <FaCalendarAlt className="kanban-card__meta-icon"/>
          <span className="kanban-card__meta-text">{date}</span>
        </div>
      )}

      {location && (
        <div className="kanban-card__meta-item">
          <FaMapMarkerAlt className="kanban-card__meta-icon"/>
          <span className="kanban-card__meta-text">{location}</span>
        </div>
      )}
    </div>
  </div>
);

export default KanbanCard
