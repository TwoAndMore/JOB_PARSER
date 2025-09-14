import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  Tag?: string;
  _row?: number;
};

type Column = {
  name: string;
  icon: ReactNode;
  jobs: Job[];
};

type Props = {
  apiKey: string;
  spreadsheetId: string;
  range: string; // e.g. "Аркуш1!A:N"
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

type ColumnName = typeof COLUMN_NAMES[number];

const safeLS = {
  get(key: string): string | null {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null; } catch { return null; }
  },
  set(key: string, val: string): void {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(key, val); } catch { /* ignore */ }
  },
};

const isColumnName = (s: unknown): s is ColumnName =>
  typeof s === 'string' && (COLUMN_NAMES as readonly string[]).includes(s);

const iconByName = (name: string): ReactNode => {
  switch (name) {
    case 'NEW': return <FaPlus />;
    case 'CV SENT': return <FaEnvelope />;
    case 'FOLLOWED UP': return <FaRedoAlt />;
    case 'INTERVIEW': return <FaPhoneAlt />;
    case 'REFUSAL': return <FaTimesCircle />;
    case 'OFFER': return <FaBriefcase />;
    default: return <FaArchive />;
  }
};

const statusMod = (name: string): string =>
  `kanban__column--${name.toLowerCase().replace(/\s+/g, '-')}`;

/** Lightweight memo wrapper to reduce re-renders on large lists */
const SortableItem = React.memo(function SortableItem({
                                                        job,
                                                        onClick,
                                                      }: {
  job: Job;
  onClick: (job: Job) => void;
}) {
  return (
    <div data-id={job.ID}>
      <KanbanCard
        id={job.ID}
        title={job.Title}
        company={job.Company}
        date={job.Date}
        location={job.Location}
        tag={job.Tag}
        link={job.Link}
        onClick={() => onClick(job)}
      />
    </div>
  );
});

const KanbanBoard: React.FC<Props> = ({ apiKey, spreadsheetId, range }) => {
  const [columns, setColumns] = useState<Column[]>(
    COLUMN_NAMES.map((name) => ({ name, icon: iconByName(name), jobs: [] }))
  );
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState<string>('');

  // NEW: loading/error UI
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Focus Mode — restored from localStorage on first render
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    const v = safeLS.get('kanban.focusMode');
    return v === null ? true : v === '1';
  });
  const [focusColumn, setFocusColumn] = useState<ColumnName>(() => {
    const v = safeLS.get('kanban.focusColumn');
    return isColumnName(v) ? v : 'NEW';
  });
  const [focusIndex, setFocusIndex] = useState<number>(0);

  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const webAppUrl =
    'https://script.google.com/macros/s/AKfycbyz0gfeR1cGeoViYk5WiqQIVEBzL46boDHblwLRUfUD3-9G-ASUgek_7zJHCwmSjQlXBw/exec';

  // Persist focusMode / focusColumn
  useEffect(() => { safeLS.set('kanban.focusMode', focusMode ? '1' : '0'); }, [focusMode]);
  useEffect(() => { safeLS.set('kanban.focusColumn', focusColumn); }, [focusColumn]);

  // Load from Google Sheets
  useEffect(() => {
    const loadJobs = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          range
        )}?key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();

        if (!data.values || data.values.length === 0) {
          setColumns(COLUMN_NAMES.map((name) => ({ name, icon: iconByName(name), jobs: [] })));
          setFocusIndex(0);
          return;
        }

        // Normalize headers (trim, strip BOM)
        const rawHeaders = data.values[0] as string[];
        const norm = (s: string) => s.replace(/^\uFEFF/, '').trim();
        const headers = rawHeaders.map(norm);

        // Canonical keys we rely on
        const canonicalKey = (h: string) => {
          const l = h.toLowerCase();
          if (l === 'tag') return 'Tag';
          if (l === 'interview date') return 'Interview Date';
          return h;
        };

        // Build jobs
        const rows = (data.values as string[][]).slice(1);
        const jobs: Job[] = rows.map((row, i) => {
          const obj: any = {};
          headers.forEach((h, j) => {
            const key = canonicalKey(h);
            obj[key] = row[j] ?? '';
          });
          obj._row = i + 2;
          return obj as Job;
        });

        setColumns(
          COLUMN_NAMES.map((name) => ({
            name,
            icon: iconByName(name),
            jobs: jobs.filter((j) => j.Status && j.Status.toUpperCase() === name.toUpperCase()),
          }))
        );
        setFocusIndex(0);
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to load jobs');
      } finally {
        setIsLoading(false);
      }
    };

    void loadJobs();
  }, [apiKey, spreadsheetId, range]);

  // Global search (local, non-destructive)
  const filteredColumns = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return columns;
    const match = (j: Job): boolean =>
      [j.Title, j.Company, j.Location, j.Description, j.Link, j.Tag]
        .map((x) => (x || '').toLowerCase())
        .some((v) => v.includes(t));
    return columns.map((c) => ({ ...c, jobs: c.jobs.filter(match) }));
  }, [columns, query]);

  // Per-column counts (affected by search)
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of filteredColumns) map[c.name] = c.jobs.length;
    return map;
  }, [filteredColumns]);

  const dndDisabled = focusMode || query.trim().length > 0;

  // ===== Sheets helpers =====
  const updateStatusInSheets = useCallback(
    async (job: Job, newStatus: string): Promise<void> => {
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
          // eslint-disable-next-line no-console
          console.error('Sheets update failed:', res.status, await res.text());
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Sheets fetch error:', e);
      }
    },
    [apiKey]
  );

  // Move job between columns by status (no heavy DOM shuffles)
  const moveJobToStatus = useCallback(
    (jobId: string, targetStatus: string) => {
      if (targetStatus === focusColumn) return;

      setColumns((prev) => {
        const fromColIdx = prev.findIndex((c) => c.jobs.some((j) => j.ID === jobId));
        const toColIdx = prev.findIndex((c) => c.name === targetStatus);
        if (fromColIdx === -1 || toColIdx === -1) return prev;

        const fromList = [...prev[fromColIdx].jobs];
        const idx = fromList.findIndex((j) => j.ID === jobId);
        if (idx === -1) return prev;
        const [moved] = fromList.splice(idx, 1);

        const toList = [...prev[toColIdx].jobs];
        const updated: Job = { ...moved, Status: targetStatus };
        toList.unshift(updated);

        const next = [...prev];
        next[fromColIdx] = { ...next[fromColIdx], jobs: fromList };
        next[toColIdx] = { ...next[toColIdx], jobs: toList };
        return next;
      });

      const all = columnsRef.current.flatMap((c) => c.jobs);
      const movedJob = all.find((j) => j.ID === jobId);
      if (movedJob) {
        void updateStatusInSheets({ ...movedJob, Status: targetStatus }, targetStatus);
      }
    },
    [focusColumn, updateStatusInSheets]
  );

  // ===== SAVE from Modal (OPTIMISTIC local update + Sheets) =====
  const handleSaveModal = useCallback(
    async (updatedJob: Job): Promise<void> => {
      setColumns((prev) =>
        prev.map((c) => ({
          ...c,
          jobs: c.jobs.map((j) => (j.ID === updatedJob.ID ? { ...j, ...updatedJob } : j)),
        }))
      );
      setSelectedJob((sj) => (sj && sj.ID === updatedJob.ID ? { ...sj, ...updatedJob } : sj));

      if (updatedJob._row) {
        const params = new URLSearchParams({
          row: String(updatedJob._row),
          notes: updatedJob.Notes || '',
          interviewDate: updatedJob['Interview Date'] || '',
          contacts: updatedJob.Contacts || '',
          tag: updatedJob.Tag || '',
          token: apiKey,
          origin: window.location.origin,
        });

        try {
          const res = await fetch(`${webAppUrl}?${params.toString()}`);
          if (!res.ok) {
            // eslint-disable-next-line no-console
            console.error('Sheets save failed:', res.status, await res.text());
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Sheets fetch error:', e);
        }
      }
    },
    [apiKey]
  );

  // ===== DnD (when Focus Mode is OFF) =====
  const moveWithinColumn = useCallback((colIndex: number, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setColumns((prev) => {
      const next = [...prev];
      const list = [...next[colIndex].jobs];
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      next[colIndex] = { ...next[colIndex], jobs: list };
      return next;
    });
  }, []);

  const moveBetweenColumns = useCallback(
    (fromCol: number, toCol: number, toIndexRaw: number, jobId: string) => {
      const current = columnsRef.current;
      const sourceList = [...current[fromCol].jobs];
      const targetList = [...current[toCol].jobs];

      const idxInSource = sourceList.findIndex((j) => j.ID === jobId);
      if (idxInSource === -1) return;

      const [moved] = sourceList.splice(idxInSource, 1);
      const newStatus = current[toCol].name;
      const updated: Job = { ...moved, Status: newStatus };

      const toIndex = Math.min(Math.max(toIndexRaw, 0), targetList.length);
      targetList.splice(toIndex, 0, updated);

      setColumns((prev) => {
        const next = [...prev];
        next[fromCol] = { ...next[fromCol], jobs: sourceList };
        next[toCol] = { ...next[toCol], jobs: targetList };
        return next;
      });

      void updateStatusInSheets(moved, newStatus);
    },
    [updateStatusInSheets]
  );

  const findFromColByJobId = useCallback(
    (jobId: string): number => columnsRef.current.findIndex((c) => c.jobs.some((j) => j.ID === jobId)),
    []
  );

  const handleAdd = useCallback(
    (evt: SortableEvent, targetColIndex: number): void => {
      const itemEl = evt.item as HTMLElement;
      const jobId = itemEl.dataset.id || '';
      const toIndex = evt.newIndex ?? 0;
      if (!jobId) return;

      const fromColIndex = findFromColByJobId(jobId);
      if (fromColIndex < 0 || fromColIndex === targetColIndex) return;

      moveBetweenColumns(fromColIndex, targetColIndex, toIndex, jobId);
    },
    [findFromColByJobId, moveBetweenColumns]
  );

  const handleUpdate = useCallback(
    (evt: SortableEvent, colIndex: number): void => {
      const fromIdx = evt.oldIndex ?? 0;
      const toIdx = evt.newIndex ?? 0;
      moveWithinColumn(colIndex, fromIdx, toIdx);
    },
    [moveWithinColumn]
  );

  const focusList = useMemo(() => {
    const col = filteredColumns.find((c) => c.name === focusColumn);
    return col ? col.jobs : [];
  }, [filteredColumns, focusColumn]);

  const currentJob = focusList[focusIndex] || null;

  const goNext = useCallback(() => {
    setFocusIndex((i) => Math.min(i + 1, Math.max(focusList.length - 1, 0)));
  }, [focusList.length]);
  const goPrev = useCallback(() => {
    setFocusIndex((i) => Math.max(i - 1, 0));
  }, []);
  useEffect(() => {
    setFocusIndex((i) => Math.min(i, Math.max(focusList.length - 1, 0)));
  }, [focusList.length]);

  const onCardClick = useCallback((job: Job) => {
    setSelectedJob(job);
    setIsModalOpen(true);
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!currentJob) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode, currentJob, goNext, goPrev, moveJobToStatus]);

  // Helper to render a status action with disabled state if equals focusColumn
  const renderAction = (
    label: string,
    status: ColumnName,
    icon: ReactNode,
    title?: string
  ) => {
    const disabled = focusColumn === status;
    return (
      <button
        key={status}
        onClick={() => {
          if (!currentJob || disabled) return;
          moveJobToStatus(currentJob.ID, status);
        }}
        className="btn"
        style={btnStyle({ disabled })}
        title={title || label}
        disabled={disabled}
        aria-disabled={disabled}
      >
        {icon} {label}
      </button>
    );
  };

  return (
    <div className="kanban-page">
      {/* Header */}
      <div className="kanban__header" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
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

        {/* Fancy toggle switch (styled in SCSS) */}
        <div className="kanban__controls">
          <label className="kanban__toggle">
            <input
              className="kanban__toggle-input"
              type="checkbox"
              checked={focusMode}
              onChange={(e) => setFocusMode(e.target.checked)}
              aria-label="Toggle focus mode"
            />
            <span className="kanban__toggle-track" aria-hidden="true">
              <span className="kanban__toggle-thumb" />
            </span>
            <span className="kanban__toggle-text">Focus mode</span>
          </label>
        </div>

        {!focusMode && query.trim().length > 0 && (
          <div className="kanban__hint">Clear search to drag & drop</div>
        )}

        <div className="kanban__brand">Discord: amiduck</div>
      </div>

      {/* LOADING / ERROR UI */}
      {isLoading ? (
        <div className="kanban kanban--loading">
          <div className="loader">
            <div className="loader__spinner" role="status" aria-live="polite" aria-label="Loading jobs" />
            <div className="loader__text">Loading jobs…</div>
          </div>
        </div>
      ) : loadError ? (
        <div className="kanban kanban--loading">
          <div className="loader">
            <div className="loader__text">Failed to load jobs</div>
            <div className="loader__sub">{loadError}</div>
          </div>
        </div>
      ) : (
        <>
          {/* Focus-mode badge bar (per-column counts & quick switch) */}
          {focusMode && (
            <div className="focus-stats">
              {COLUMN_NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`focus-stats__item ${n === focusColumn ? 'is-active' : ''}`}
                  onClick={() => {
                    setFocusColumn(n as ColumnName);
                    setFocusIndex(0);
                  }}
                  title={`${n} (${counts[n] ?? 0})`}
                >
                  <span className="focus-stats__name">{n}</span>
                  <span className="focus-stats__count">{counts[n] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          {/* Focus Mode: one card + quick actions */}
          {focusMode ? (
            <div className="kanban" style={{ paddingTop: '0.5rem' }}>
              <div
                className={`kanban__column ${statusMod(focusColumn)}`}
                style={{ flex: '1 1 520px', maxWidth: 760, margin: '0 auto' }}
              >
                <div className="kanban__column-header">
                  <h2 className="kanban__column-title">
                    {focusColumn}
                    <span className="kanban__column-icon">{iconByName(focusColumn)}</span>
                  </h2>

                  <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className="kanban__column-count">{counts[focusColumn] ?? 0}</span>
                    {focusMode && (
                      <span
                        className="kanban__column-count"
                        aria-live="polite"
                        style={{ opacity: 0.9, background: '#3b3e55', color: '#fff' }}
                      >
                        {focusList.length ? `${focusIndex + 1}/${focusList.length}` : '0/0'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="kanban__list">
                  {!currentJob ? (
                    <div className="kanban__empty">
                      <span className="kanban__empty-icon">
                        <FaInbox />
                      </span>
                      <div className="kanban__empty-title">Nothing here</div>
                      <div className="kanban__empty-sub">Choose another column or turn off Focus mode</div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      <div>
                        <KanbanCard
                          id={currentJob.ID}
                          title={currentJob.Title}
                          company={currentJob.Company}
                          date={currentJob.Date}
                          location={currentJob.Location}
                          link={currentJob.Link}
                          tag={currentJob.Tag}
                          onClick={() => {
                            setSelectedJob(currentJob);
                            setIsModalOpen(true);
                          }}
                        />
                      </div>

                      {/* Quick actions */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {renderAction('CV SENT', 'CV SENT', <FaEnvelope />, 'I submitted my CV')}
                        {renderAction('FOLLOWED UP', 'FOLLOWED UP', <FaRedoAlt />)}
                        {renderAction('INTERVIEW', 'INTERVIEW', <FaPhoneAlt />)}
                        {renderAction('REFUSAL', 'REFUSAL', <FaTimesCircle />)}
                        {renderAction('OFFER', 'OFFER', <FaBriefcase />)}
                        {renderAction('ARCHIVE', 'ARCHIVE', <FaArchive />)}
                      </div>

                      {/* Navigation (30% / 70%) */}
                      {(() => {
                        const isPrevDisabled = focusIndex <= 0;
                        const isNextDisabled = focusIndex >= focusList.length - 1;
                        return (
                          <div className="focus-nav" role="group" aria-label="Focus navigation">
                            <button
                              type="button"
                              className="focus-nav__btn focus-nav__btn--prev"
                              onClick={goPrev}
                              disabled={isPrevDisabled}
                              aria-disabled={isPrevDisabled}
                              title={isPrevDisabled ? 'No previous card' : 'Previous (←)'}
                            >
                              ◀︎ Prev
                            </button>

                            <button
                              type="button"
                              className="focus-nav__btn focus-nav__btn--next"
                              onClick={goNext}
                              disabled={isNextDisabled}
                              aria-disabled={isNextDisabled}
                              title={isNextDisabled ? 'No next card' : 'Next (→)'}
                            >
                              Next ▶︎
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Classic Kanban with DnD
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
                    setList={() => { /* no-op */ }}
                    group={
                      dndDisabled
                        ? { name: 'jobs', pull: false, put: false }
                        : { name: 'jobs', pull: true, put: true }
                    }
                    disabled={dndDisabled}
                    animation={col.jobs.length >= 200 ? 0 : 120}
                    easing="cubic-bezier(.2,.7,.3,1)"
                    className={`kanban__list${dndDisabled ? ' kanban__list--disabled' : ''}`}
                    onAdd={(evt) => { if (!dndDisabled) handleAdd(evt as SortableEvent, colIndex); }}
                    onUpdate={(evt) => { if (!dndDisabled) handleUpdate(evt as SortableEvent, colIndex); }}
                    onStart={() => setIsDragging(true)}
                    onEnd={() => setIsDragging(false)}
                    forceFallback={false}
                    invertSwap={false}
                    swapThreshold={0.5}
                    emptyInsertThreshold={24}
                    dragoverBubble={false}
                    delayOnTouchOnly
                    touchStartThreshold={8}
                    scroll={true}
                    scrollSensitivity={60}
                    scrollSpeed={12}
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
                        <SortableItem
                          key={job.ID}
                          job={job}
                          onClick={(j) => {
                            setSelectedJob(j);
                            setIsModalOpen(true);
                          }}
                        />
                      ))
                    )}
                  </ReactSortable>
                </div>
              ))}
            </div>
          )}

          <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            job={selectedJob}
            onSave={handleSaveModal}
          />
        </>
      )}
    </div>
  );
};

function btnStyle(opts?: { primary?: boolean; muted?: boolean; disabled?: boolean }): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'transparent',
    color: '#f1f1f1',
    cursor: 'pointer',
  };
  if (opts?.primary) {
    base.background = '#b5bcff';
    base.color = '#111321';
    base.fontWeight = 800;
  }
  if (opts?.muted) base.opacity = 0.8;
  if (opts?.disabled) {
    base.opacity = 0.45;
    base.cursor = 'not-allowed';
    base.filter = 'grayscale(0.2)';
  }
  return base;
}

export default KanbanBoard;
