import React, {type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ReactSortable} from 'react-sortablejs';
import type {SortableEvent} from 'sortablejs';
import {
  FaArchive,
  FaBriefcase,
  FaEnvelope,
  FaHandPointUp,
  FaInbox,
  FaPhoneAlt,
  FaPlus,
  FaRedoAlt,
  FaSearch,
  FaTimesCircle,
} from 'react-icons/fa';

import './KanbanBoard.scss';
import KanbanCard from '../KanbanCard/KanbanCard';
import Modal from '../Modal/Modal';
import NewJobModal, {type ColumnName as ModalColumnName, type Job as EditJob,} from '../NewJobModal/NewJobModal';

/* ========== Types ========== */

type Job = {
  ID: string;
  Title: string;
  Description?: string;
  Company?: string;
  Location?: string;
  Link?: string;
  Date?: string; // dd.mm.yyyy
  Status?: string;
  Notes?: string;
  'Interview Date'?: string;
  Contacts?: string;
  Tag?: string;
  _row?: number; // 1-based sheet row
};

type Column = {
  name: ColumnName;
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

type ColumnName = (typeof COLUMN_NAMES)[number];

/* ========== LocalStorage utils ========== */

const safeLS = {
  get(key: string): string | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  set(key: string, val: string): void {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, val);
    } catch {
      /* ignore */
    }
  },
};

/* ========== Helpers ========== */

const isColumnName = (s: unknown): s is ColumnName =>
  typeof s === 'string' && (COLUMN_NAMES as readonly string[]).includes(s);

const iconByName = (name: ColumnName): ReactNode => {
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

/** Row builder object with flexible keys but Job-compatible values */
type RowObject = Partial<Job> & Record<string, string>;

/** Parse "dd.mm.yyyy" (а також d.m.yyyy) у timestamp; invalid -> NaN */
const dateToTs = (s?: string): number => {
  if (!s) return NaN;
  const m = s.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (!m) return NaN;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const dt = new Date(y, mo, d);
  return dt.getTime();
};

/** Порівняння двох Job за полем Date з урахуванням порядку. */
const byDate =
  (order: 'asc' | 'desc') =>
  (a: Job, b: Job): number => {
    const ta = dateToTs(a.Date);
    const tb = dateToTs(b.Date);
    const aBad = Number.isNaN(ta);
    const bBad = Number.isNaN(tb);
    if (aBad && bBad) return 0;
    if (aBad) return 1;
    if (bBad) return -1;
    return order === 'asc' ? ta - tb : tb - ta;
  };

/* Memoized item to reduce re-renders on large lists */
const SortableItem = React.memo(function SortableItem({
  job,
  onClick,
  highlight,
}: {
  job: Job;
  onClick: (job: Job) => void;
  highlight?: string;
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
        highlight={highlight}
        hasNotes={Boolean(job.Notes && job.Notes.trim())}
        onClick={() => onClick(job)}
      />
    </div>
  );
});

/* ========== Component ========== */

const KanbanBoard: React.FC<Props> = ({apiKey, spreadsheetId, range}) => {
  // Data state
  const [columns, setColumns] = useState<Column[]>(
    COLUMN_NAMES.map((name) => ({name, icon: iconByName(name), jobs: []})),
  );

  // UI state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // New / Edit job modal
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [editInitial, setEditInitial] = useState<Partial<Job> | undefined>(undefined);

  // Focus mode state (restored from LS on first render)
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    const v = safeLS.get('kanban.focusMode');
    return v === null ? true : v === '1';
  });
  const [focusColumn, setFocusColumn] = useState<ColumnName>(() => {
    const v = safeLS.get('kanban.focusColumn');
    return isColumnName(v) ? v : 'NEW';
  });
  const [focusIndex, setFocusIndex] = useState<number>(0);

  // Per-column date sort (asc/desc/none), persisted
  const [sortByDate, setSortByDate] = useState<Record<ColumnName, 'asc' | 'desc' | 'none'>>(() => {
    const raw = safeLS.get('kanban.sortByDate');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<Record<ColumnName, 'asc' | 'desc' | 'none'>>;
        return {
          NEW: parsed.NEW ?? 'none',
          'CV SENT': parsed['CV SENT'] ?? 'none',
          'FOLLOWED UP': parsed['FOLLOWED UP'] ?? 'none',
          INTERVIEW: parsed.INTERVIEW ?? 'none',
          REFUSAL: parsed.REFUSAL ?? 'none',
          OFFER: parsed.OFFER ?? 'none',
          ARCHIVE: parsed.ARCHIVE ?? 'none',
        };
      } catch {
        /* ignore */
      }
    }
    return {
      NEW: 'none',
      'CV SENT': 'none',
      'FOLLOWED UP': 'none',
      INTERVIEW: 'none',
      REFUSAL: 'none',
      OFFER: 'none',
      ARCHIVE: 'none',
    };
  });

  // Refs
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const webAppUrl =
    'https://script.google.com/macros/s/AKfycbyz0gfeR1cGeoViYk5WiqQIVEBzL46boDHblwLRUfUD3-9G-ASUgek_7zJHCwmSjQlXBw/exec';

  // Persist focus settings
  useEffect(() => {
    safeLS.set('kanban.focusMode', focusMode ? '1' : '0');
  }, [focusMode]);
  useEffect(() => {
    safeLS.set('kanban.focusColumn', focusColumn);
  }, [focusColumn]);

  // Persist sort settings
  useEffect(() => {
    safeLS.set('kanban.sortByDate', JSON.stringify(sortByDate));
  }, [sortByDate]);

  /* ------- Load jobs from Google Sheets ------- */
  useEffect(() => {
    const loadJobs = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError(null);

      if (!apiKey.trim() || !spreadsheetId.trim() || !range.trim()) {
        setColumns(COLUMN_NAMES.map((name) => ({name, icon: iconByName(name), jobs: []})));
        setIsLoading(false);
        setLoadError('Missing credentials: apiKey, spreadsheetId or range.');
        return;
      }

      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          range,
        )}?key=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: {values?: string[][]} = await res.json();
        if (!data.values || data.values.length === 0) {
          setColumns(COLUMN_NAMES.map((name) => ({name, icon: iconByName(name), jobs: []})));
          setFocusIndex(0);
          return;
        }

        const rawHeaders = data.values[0] as string[];
        const headers = rawHeaders.map((s) => s.replace(/^\uFEFF/, '').trim());
        const canonicalKey = (h: string): keyof RowObject => {
          const l = h.toLowerCase();
          if (l === 'tag') return 'Tag';
          if (l === 'interview date') return 'Interview Date';
          return h as keyof RowObject;
        };

        const rows = data.values.slice(1);
        const jobs: Job[] = rows.map((row, i) => {
          const obj: RowObject = {};
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
          })),
        );
        setFocusIndex(0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg);
      } finally {
        setIsLoading(false);
      }
    };

    void loadJobs();
  }, [apiKey, spreadsheetId, range]);

  /* ------- Search / counts / per-column sort ------- */
  const filteredColumns = useMemo(() => {
    const t = query.trim().toLowerCase();
    const applyFilter = (jobs: Job[]): Job[] => {
      if (!t) return jobs;
      const match = (j: Job): boolean =>
        [j.Title, j.Company, j.Location, j.Description, j.Link, j.Tag]
          .map((x) => (x || '').toLowerCase())
          .some((v) => v.includes(t));
      return jobs.filter(match);
    };

    return columns.map((c) => {
      const filtered = applyFilter(c.jobs);
      const order = sortByDate[c.name];
      if (order === 'none') {
        return {...c, jobs: filtered};
      }
      const sorted = [...filtered].sort(byDate(order));
      return {...c, jobs: sorted};
    });
  }, [columns, query, sortByDate]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of filteredColumns) map[c.name] = c.jobs.length;
    return map;
  }, [filteredColumns]);

  const dndDisabled = focusMode || query.trim().length > 0;

  /* ------- Sheets update helpers ------- */

  const updateStatusInSheets = useCallback(
    async (job: Job, newStatus: string): Promise<void> => {
      if (!job._row) {
        return;
      }

      const params = new URLSearchParams({
        action: 'update',
        row: String(job._row),
        status: newStatus,
        token: apiKey,
        origin: window.location.origin,
      });
      try {
        const res = await fetch(`${webAppUrl}?${params.toString()}`);
        if (!res.ok) {
          console.error('Sheets update failed:', res.status, await res.text());
        }
      } catch (e) {
        console.error('Sheets fetch error:', e);
      }
    },
    [apiKey],
  );

  /** Додати/оновити картку в локальному стані у відповідній колонці. */
  const upsertLocalJob = useCallback((job: Job) => {
    setColumns((prev) => {
      // видаляємо з усіх колонок, щоб не дублювалась
      const pruned = prev.map((c) => ({...c, jobs: c.jobs.filter((j) => j.ID !== job.ID)}));
      const idx = pruned.findIndex((c) => c.name === ((job.Status as ColumnName) || 'NEW'));
      if (idx === -1) return prev;
      const list = [job, ...pruned[idx].jobs];
      const next = [...pruned];
      next[idx] = {...next[idx], jobs: list};
      return next;
    });
  }, []);

  /** Видалити локально (для self-*) */
  const removeLocalJob = useCallback((jobId: string) => {
    setColumns((prev) => prev.map((c) => ({...c, jobs: c.jobs.filter((j) => j.ID !== jobId)})));
  }, []);

  /** Відкрити NewJobModal на редагування будь-якої картки. */
  const openEditFor = useCallback((job: Job) => {
    setEditInitial(job);
    setIsNewJobOpen(true);
  }, []);

  /** Move a job to another status column */
  const moveJobToStatus = useCallback(
    (jobId: string, targetStatus: ColumnName) => {
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
        const updated: Job = {...moved, Status: targetStatus};
        toList.unshift(updated);

        const next = [...prev];
        next[fromColIdx] = {...next[fromColIdx], jobs: fromList};
        next[toColIdx] = {...next[toColIdx], jobs: toList};
        return next;
      });

      const all = columnsRef.current.flatMap((c) => c.jobs);
      const movedJob = all.find((j) => j.ID === jobId);
      if (movedJob) {
        const updatedObj = {...movedJob, Status: targetStatus};
        if (updatedObj._row) {
          void updateStatusInSheets(updatedObj, targetStatus); // тепер і для self- з _row
        } else {
          upsertLocalJob(updatedObj); // якщо ще нема рядка в шиті
        }
      }
    },
    [focusColumn, updateStatusInSheets, upsertLocalJob],
  );

  /** Save Notes/Interview Date/Contacts/Tag (optimistic + GET) */
  const handleSaveModal = useCallback(
    async (updatedJob: Job): Promise<void> => {
      setColumns((prev) =>
        prev.map((c) => ({
          ...c,
          jobs: c.jobs.map((j) => (j.ID === updatedJob.ID ? {...j, ...updatedJob} : j)),
        })),
      );
      setSelectedJob((sj) => (sj && sj.ID === updatedJob.ID ? {...sj, ...updatedJob} : sj));

      if (!updatedJob.ID.startsWith('self-') && updatedJob._row) {
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
            console.error('Sheets save failed:', res.status, await res.text());
          }
        } catch (e) {
          console.error('Sheets fetch error:', e);
        }
      }
    },
    [apiKey],
  );

  /* ------- DnD helpers ------- */

  const moveWithinColumn = useCallback((colIndex: number, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;

    setColumns((prev) => {
      const next = [...prev];
      const list = [...next[colIndex].jobs];
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      next[colIndex] = {...next[colIndex], jobs: list};
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
      const updated: Job = {...moved, Status: newStatus};

      const toIndex = Math.min(Math.max(toIndexRaw, 0), targetList.length);
      targetList.splice(toIndex, 0, updated);

      setColumns((prev) => {
        const next = [...prev];
        next[fromCol] = {...next[fromCol], jobs: sourceList};
        next[toCol] = {...next[toCol], jobs: targetList};
        return next;
      });

      if (moved._row) {
        void updateStatusInSheets(updated, newStatus); // тепер і для self- з _row
      } else {
        upsertLocalJob(updated);
      }
    },
    [updateStatusInSheets, upsertLocalJob],
  );

  const findFromColByJobId = useCallback(
    (jobId: string): number =>
      columnsRef.current.findIndex((c) => c.jobs.some((j) => j.ID === jobId)),
    [],
  );

  const handleAdd = useCallback(
    (evt: SortableEvent, targetColIndex: number): void => {
      const itemEl = evt.item as HTMLElement;

      // надійний пошук data-id
      const jobId =
        itemEl.getAttribute('data-id') ||
        (itemEl as any).dataset?.id ||
        (itemEl.querySelector('[data-id]') as HTMLElement | null)?.getAttribute('data-id') ||
        '';

      const toIndex = evt.newIndex ?? 0;
      if (!jobId) return;

      const fromColIndex = findFromColByJobId(jobId);
      if (fromColIndex < 0 || fromColIndex === targetColIndex) return;

      moveBetweenColumns(fromColIndex, targetColIndex, toIndex, jobId);
    },
    [findFromColByJobId, moveBetweenColumns],
  );

  const handleUpdate = useCallback(
    (evt: SortableEvent, colIndex: number): void => {
      const fromIdx = evt.oldIndex ?? 0;
      const toIdx = evt.newIndex ?? 0;
      moveWithinColumn(colIndex, fromIdx, toIdx);
    },
    [moveWithinColumn],
  );

  /* ------- Focus mode derived ------- */

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

  useEffect(() => {
    if (!focusMode) return;

    const onKey = (e: KeyboardEvent) => {
      if (!currentJob) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode, currentJob, goNext, goPrev, moveJobToStatus]);

  /* ------- Quick action button renderer ------- */

  const renderAction = (label: string, status: ColumnName, icon: ReactNode, title?: string) => {
    const disabled = focusColumn === status;

    return (
      <button
        key={status}
        onClick={() => {
          if (!currentJob || disabled) return;
          moveJobToStatus(currentJob.ID, status);
        }}
        className="btn"
        style={btnStyle({disabled})}
        title={title || label}
        disabled={disabled}
        aria-disabled={disabled}
      >
        {icon} {label}
      </button>
    );
  };

  /* ------- Sort control UI ------- */

  const cycleSort = useCallback((col: ColumnName) => {
    setSortByDate((prev) => {
      const cur = prev[col];
      const next = cur === 'none' ? 'asc' : cur === 'asc' ? 'desc' : 'none';
      return {...prev, [col]: next};
    });
  }, []);

  const renderSortButton = (col: ColumnName) => {
    const state = sortByDate[col];
    const label = state === 'asc' ? '▲' : state === 'desc' ? '▼' : '⇅';
    const title =
      state === 'asc'
        ? 'Sorted by date: ascending (click to switch to descending)'
        : state === 'desc'
          ? 'Sorted by date: descending (click to turn off)'
          : 'Sort by date (click for ascending)';

    return (
      <button
        type="button"
        onClick={() => cycleSort(col)}
        className="kanban__sort"
        title={title}
        aria-label={`Sort ${col} by date: ${state}`}
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          border: '1px solid rgba(157,166,255,0.18)',
          background: 'rgba(157,166,255,0.09)',
          color: '#cfd2ff',
          fontWeight: 900,
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    );
  };

  /* ------- NewJobModal handlers ------- */

  const openCreate = useCallback(() => {
    setEditInitial({
      Status: focusMode ? focusColumn : 'NEW',
      Date: '',
    });
    setIsNewJobOpen(true);
  }, [focusMode, focusColumn]);

  // 🔹 ДОПОВНЕНО: тепер шле запит до Apps Script і закриває модалку
  const handleCreateOrUpdate = useCallback(
    async (job: EditJob) => {
      const j = job as Job;

      // Оптимістично оновлюємо локально
      upsertLocalJob(j);

      // Якщо є токен — шлемо запит (і для self- також)
      if (apiKey.trim()) {
        const action = j._row ? 'update' : 'create';
        const params = new URLSearchParams({
          action,
          token: apiKey,
          origin: window.location.origin,
          // якщо update по рядку — передамо row
          ...(j._row ? {row: String(j._row)} : {}),
          // payload полів
          id: j.ID || '',
          title: j.Title || '',
          description: j.Description || '',
          company: j.Company || '',
          location: j.Location || '',
          link: j.Link || '',
          date: j.Date || '',
          status: j.Status || '',
          notes: j.Notes || '',
          interviewDate: j['Interview Date'] || '',
          contacts: j.Contacts || '',
          tag: j.Tag || '',
        });

        try {
          const res = await fetch(`${webAppUrl}?${params.toString()}`);
          if (!res.ok) {
            console.error('Upsert failed:', res.status, await res.text());
          } else {
            const json = await res.json().catch(() => ({}));
            // якщо сервер повернув row — допишемо його
            if (json && typeof json.row === 'number') {
              const withRow: Job = {...j, _row: json.row};
              upsertLocalJob(withRow);
            }
          }
        } catch (e) {
          console.error('Upsert error:', e);
        }
      }

      // Закриваємо модалку створення/редагування
      setIsNewJobOpen(false);
    },
    [apiKey, upsertLocalJob],
  );

  const handleDeleteSelf = useCallback(
    async (job: EditJob) => {
      const id = (job.ID || '').trim();
      if (!id.startsWith('self-')) return;

      // оптимістично прибираємо з UI
      removeLocalJob(id);

      try {
        const params = new URLSearchParams({
          action: 'delete',
          id,
          token: apiKey,
          origin: window.location.origin,
        });
        const row = Number((job as any)._row || 0);
        if (row >= 2) params.set('row', String(row)); // додатково, якщо відомо

        const res = await fetch(`${webAppUrl}?${params.toString()}`);
        if (!res.ok) {
          console.error('Apps Script delete failed:', res.status, await res.text());
        }
      } catch (err) {
        console.error('Delete fetch error:', err);
      }
    },
    [apiKey, removeLocalJob],
  );

  /* ========== Render ========== */
  return (
    <div className="kanban-page">
      {/* Header */}
      <div className="kanban__header" style={{gap: '0.5rem', flexWrap: 'wrap'}}>
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

        {/* ADD button */}
        <button
          type="button"
          onClick={openCreate}
          title="Add new job"
          style={btnStyle({primary: true})}
        >
          <FaPlus style={{marginRight: 6}} /> Add
        </button>

        <div className="kanban__brand">Discord: amiduck</div>
      </div>

      {/* Loading & error states */}
      {isLoading ? (
        <div className="kanban kanban--loading">
          <div className="loader">
            <div
              className="loader__spinner"
              role="status"
              aria-live="polite"
              aria-label="Loading jobs"
            />
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
          {/* Focus-mode badge bar */}
          {focusMode && (
            <div className="focus-stats">
              {COLUMN_NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`focus-stats__item ${n === focusColumn ? 'is-active' : ''}`}
                  onClick={() => {
                    setFocusColumn(n);
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

          {/* Focus Mode (single card + actions) */}
          {focusMode ? (
            <div className="kanban" style={{paddingTop: '0.5rem'}}>
              <div
                className={`kanban__column ${statusMod(focusColumn)}`}
                style={{flex: '1 1 520px', maxWidth: 760, margin: '0 auto'}}
              >
                <div className="kanban__column-header">
                  <h2 className="kanban__column-title">
                    {focusColumn}
                    <span className="kanban__column-icon">{iconByName(focusColumn)}</span>
                  </h2>

                  <div style={{display: 'inline-flex', gap: '0.4rem', alignItems: 'center'}}>
                    {renderSortButton(focusColumn)}
                    <span className="kanban__column-count">{counts[focusColumn] ?? 0}</span>
                    <span
                      className="kanban__column-count"
                      aria-live="polite"
                      style={{opacity: 0.9, background: '#3b3e55', color: '#fff'}}
                    >
                      {focusList.length ? `${focusIndex + 1}/${focusList.length}` : '0/0'}
                    </span>
                  </div>
                </div>

                <div className="kanban__list">
                  {!currentJob ? (
                    <div className="kanban__empty">
                      <span className="kanban__empty-icon">
                        <FaInbox />
                      </span>
                      <div className="kanban__empty-title">Nothing here</div>
                      <div className="kanban__empty-sub">
                        Choose another column or turn off Focus mode
                      </div>
                    </div>
                  ) : (
                    <div style={{display: 'grid', gap: '0.75rem'}}>
                      <div>
                        <KanbanCard
                          id={currentJob.ID}
                          title={currentJob.Title}
                          company={currentJob.Company}
                          date={currentJob.Date}
                          location={currentJob.Location}
                          link={currentJob.Link}
                          tag={currentJob.Tag}
                          highlight={query}
                          hasNotes={Boolean(currentJob.Notes && currentJob.Notes.trim())}
                          onClick={() => {
                            setSelectedJob(currentJob);
                            setIsModalOpen(true);
                          }}
                        />
                      </div>

                      {/* Quick actions */}
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                        {renderAction('CV SENT', 'CV SENT', <FaEnvelope />, 'I submitted my CV')}
                        {renderAction('FOLLOWED UP', 'FOLLOWED UP', <FaRedoAlt />)}
                        {renderAction('INTERVIEW', 'INTERVIEW', <FaPhoneAlt />)}
                        {renderAction('REFUSAL', 'REFUSAL', <FaTimesCircle />)}
                        {renderAction('OFFER', 'OFFER', <FaBriefcase />)}
                        {renderAction('ARCHIVE', 'ARCHIVE', <FaArchive />)}
                      </div>

                      {/* Navigation */}
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
                    <div style={{display: 'inline-flex', gap: '0.4rem', alignItems: 'center'}}>
                      {renderSortButton(col.name)}
                      <span className="kanban__column-count">
                        {query.trim()
                          ? `${col.jobs.length}/${columns[colIndex].jobs.length}`
                          : columns[colIndex].jobs.length}
                      </span>
                    </div>
                  </div>

                  <ReactSortable<Job>
                    list={col.jobs}
                    setList={() => {
                      /* no-op during dragover to avoid extra renders */
                    }}
                    group={
                      dndDisabled
                        ? {name: 'jobs', pull: false, put: false}
                        : {name: 'jobs', pull: true, put: true}
                    }
                    disabled={dndDisabled}
                    animation={col.jobs.length >= 200 ? 0 : 120}
                    easing="cubic-bezier(.2,.7,.3,1)"
                    className={`kanban__list${dndDisabled ? ' kanban__list--disabled' : ''}`}
                    onAdd={(evt) => {
                      if (!dndDisabled) handleAdd(evt as SortableEvent, colIndex);
                    }}
                    onUpdate={(evt) => {
                      if (!dndDisabled) handleUpdate(evt as SortableEvent, colIndex);
                    }}
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
                          highlight={query}
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
            onEdit={openEditFor}
          />

          <NewJobModal
            isOpen={isNewJobOpen}
            onClose={() => setIsNewJobOpen(false)}
            initial={editInitial}
            columns={COLUMN_NAMES as unknown as ModalColumnName[]}
            onSubmit={handleCreateOrUpdate}
            onDelete={handleDeleteSelf}
          />
        </>
      )}
    </div>
  );
};

/* ========== Small UI helpers ========== */

function btnStyle(opts?: {
  primary?: boolean;
  muted?: boolean;
  disabled?: boolean;
}): React.CSSProperties {
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
  if (opts?.muted) {
    base.opacity = 0.8;
  }
  if (opts?.disabled) {
    base.opacity = 0.45;
    base.cursor = 'not-allowed';
    base.filter = 'grayscale(0.2)';
  }

  return base;
}

export default KanbanBoard;
