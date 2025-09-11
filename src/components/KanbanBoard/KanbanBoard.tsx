import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ReactSortable } from 'react-sortablejs';
import type { SortableEvent } from 'sortablejs';
import {
  FaPlus,
  FaEnvelope,
  FaRedoAlt,
  FaPhoneAlt,
  FaTimesCircle,
  FaBriefcase,
  FaArchive,
  FaInbox,
  FaHandPointUp,
  FaSearch,
} from 'react-icons/fa';

import './KanbanBoard.scss';
import KanbanCard from '../KanbanCard/KanbanCard';
import Modal from '../Modal/Modal';

type Job = {
  ID: string;
  Title: string;
  Description?: string;
  Company?: string;
  Location?: string;
  Link?: string;
  Date?: string;
  Status?: string;
  Notes?: string;
  'Interview Date'?: string;
  Contacts?: string;
  _row?: number; // sheet row (1-based, incl. header)
};

type Column = {
  name: string;
  icon: ReactNode;
  jobs: Job[];
};

type Props = {
  apiKey: string;
  spreadsheetId: string;
  range: string; // e.g. "Sheet1!A:K"
};

const COLUMN_NAMES = [
  'NEW',
  'CV SENT',
  'FOLLOWED UP',
  'INTERVIEW',
  'REFUSAL',
  'OFFER',
  'ARCHIVE',
] as const;

const iconByName = (name: string): ReactNode => {
  switch (name) {
    case 'NEW':
      return <FaPlus />;
    case 'CV SENT':
      return <FaEnvelope />;
    case 'FOLLOWED UP':
      return <FaRedoAlt />;
    case 'INTERVIEW':
      return <FaPhoneAlt />;
    case 'REFUSAL':
      return <FaTimesCircle />;
    case 'OFFER':
      return <FaBriefcase />;
    default:
      return <FaArchive />;
  }
};

const statusMod = (name: string): string =>
  `kanban__column--${name.toLowerCase().replace(/\s+/g, '-')}`;

const KanbanBoard: React.FC<Props> = ({ apiKey, spreadsheetId, range }) => {
  const [columns, setColumns] = useState<Column[]>(
    COLUMN_NAMES.map((name) => ({ name, icon: iconByName(name), jobs: [] }))
  );
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState<string>('');

  const webAppUrl =
    'https://script.google.com/macros/s/AKfycbyz0gfeR1cGeoViYk5WiqQIVEBzL46boDHblwLRUfUD3-9G-ASUgek_7zJHCwmSjQlXBw/exec';

  // Load from Google Sheets
  useEffect(() => {
    const loadJobs = async (): Promise<void> => {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}?key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.values || data.values.length === 0) return;

      const [headers, ...rows] = data.values as string[][];
      const jobs: Job[] = rows.map((row, i) => {
        const obj = Object.fromEntries(
          headers.map((h, j) => [h, row[j] || ''])
        ) as Job;
        obj._row = i + 2; // +1 header, +1 for 1-based
        return obj;
      });

      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          jobs: jobs.filter(
            (j) => j.Status && j.Status.toUpperCase() === col.name.toUpperCase()
          ),
        }))
      );
    };

    void loadJobs();
  }, [apiKey, spreadsheetId, range]);

  // Global search (local, non-destructive)
  const filteredColumns = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return columns;

    const match = (j: Job): boolean =>
      [j.Title, j.Company, j.Location, j.Description, j.Link]
        .map((x) => (x || '').toLowerCase())
        .some((v) => v.includes(t));

    return columns.map((c) => ({ ...c, jobs: c.jobs.filter(match) }));
  }, [columns, query]);

  const dndDisabled = query.trim().length > 0;

  // Persist status in Sheets (Apps Script GET)
  const updateStatusInSheets = async (job: Job, newStatus: string): Promise<void> => {
    if (!job._row) return;
    const params = new URLSearchParams({
      row: String(job._row),
      status: newStatus,
      token: apiKey,
      origin: window.location.origin,
    });

    const url = `${webAppUrl}?${params.toString()}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        // Non-blocking: optimistic UI; log only
        // eslint-disable-next-line no-console
        console.error('Sheets update failed:', res.status, await res.text());
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Sheets fetch error:', e);
    }
  };

  // Save Notes / Interview Date / Contacts via Apps Script GET
  const handleSaveModal = async (updatedJob: Job): Promise<void> => {
    if (!updatedJob._row) return;

    const params = new URLSearchParams({
      row: String(updatedJob._row),
      notes: updatedJob.Notes || '',
      interviewDate: updatedJob['Interview Date'] || '',
      contacts: updatedJob.Contacts || '',
      token: apiKey,
      origin: window.location.origin,
    });

    try {
      const res = await fetch(`${webAppUrl}?${params.toString()}`);
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error('Sheets save failed:', res.status, await res.text());
        return;
      }
      // Local patch
      setColumns((prev) =>
        prev.map((c) => ({
          ...c,
          jobs: c.jobs.map((j) => (j.ID === updatedJob.ID ? { ...j, ...updatedJob } : j)),
        }))
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Sheets fetch error:', e);
    }
  };

  // On drop between columns
  const handleAdd = (evt: SortableEvent, targetColIndex: number): void => {
    const itemEl = evt.item as HTMLElement;
    const jobId = itemEl.dataset.id || '';
    const newStatus = columns[targetColIndex].name;
    if (!jobId) return;

    const movedJob =
      columns.flatMap((c) => c.jobs).find((j) => j.ID === jobId);
    if (!movedJob) return;

    void updateStatusInSheets(movedJob, newStatus);

    // Optimistic local update
    setColumns((prev) =>
      prev.map((c, i) => ({
        ...c,
        jobs: c.jobs.map((x) => (i === targetColIndex && x.ID === jobId ? { ...x, Status: newStatus } : x)),
      }))
    );
  };

  return (
    <div className="kanban-page">
      {/* Header */}
      <div className="kanban__header">
        <div className="kanban__brand">JOB PARSER</div>

        <div className="kanban__search">
          <FaSearch className="kanban__search-icon" />
          <input
            className="kanban__search-input"
            type="text"
            placeholder="Search title, company, location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {dndDisabled && <div className="kanban__hint">Clear search to drag & drop</div>}

        <div className="kanban__brand">Discord: amiduck</div>
      </div>

      {/* Board */}
      <div className="kanban">
        {filteredColumns.map((col, colIndex) => (
          <div key={col.name} className={`kanban__column ${statusMod(col.name)}`}>
            <div className="kanban__column-header">
              <h2 className="kanban__column-title">
                {col.name}
                <span className="kanban__column-icon">{col.icon}</span>
              </h2>
              <span className="kanban__column-count">
                {query.trim()
                  ? `${col.jobs.length}/${columns[colIndex].jobs.length}`
                  : columns[colIndex].jobs.length}
              </span>
            </div>

            <ReactSortable<Job>
              list={col.jobs}
              setList={(newState) => {
                if (dndDisabled) return;
                setColumns((prev) =>
                  prev.map((c, i) => (i === colIndex ? { ...c, jobs: newState } : c))
                );
              }}
              group={
                dndDisabled
                  ? { name: 'jobs', pull: false, put: false }
                  : { name: 'jobs', pull: true, put: true }
              }
              disabled={dndDisabled}
              animation={200}
              easing="cubic-bezier(.2,.7,.3,1)"
              className={`kanban__list${dndDisabled ? ' kanban__list--disabled' : ''}`}
              onAdd={(evt) => {
                if (!dndDisabled) handleAdd(evt as SortableEvent, colIndex);
              }}
              onStart={() => setIsDragging(true)}
              onEnd={() => setIsDragging(false)}
              onUnchoose={() => setIsDragging(false)}
              swapThreshold={0.35}
              invertedSwap
              invertedSwapThreshold={0.9}
              emptyInsertThreshold={30}
              dragoverBubble
              delayOnTouchOnly
              touchStartThreshold={10}
              forceFallback
              fallbackOnBody
              fallbackTolerance={3}
              ghostClass="is-ghost"
              chosenClass="is-chosen"
              dragClass="is-dragging"
            >
              {col.jobs.length === 0 ? (
                isDragging ? (
                  <div className="kanban__empty">
                    <div className="kanban__empty-title">Drop Here</div>
                    <span className="kanban__empty-hand">
                      <FaHandPointUp />
                    </span>
                  </div>
                ) : (
                  <div className="kanban__empty">
                    <span className="kanban__empty-icon">
                      <FaInbox />
                    </span>
                    <div className="kanban__empty-title">Empty</div>
                    <div className="kanban__empty-sub">
                      Move card here
                      <span className="kanban__empty-hand">
                        <FaHandPointUp />
                      </span>
                    </div>
                  </div>
                )
              ) : (
                col.jobs.map((job) => (
                  <KanbanCard
                    key={job.ID}
                    id={job.ID}
                    title={job.Title}
                    company={job.Company}
                    date={job.Date}
                    location={job.Location}
                    link={job.Link}
                    onClick={() => {
                      setSelectedJob(job);
                      setIsModalOpen(true);
                    }}
                  />
                ))
              )}
            </ReactSortable>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        job={selectedJob}
        onSave={handleSaveModal}
      />
    </div>
  );
};

export default KanbanBoard;
