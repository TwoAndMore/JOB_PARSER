import React, {useCallback, useEffect, useRef, useState} from 'react';
import './NewJobModal.scss';

export type ColumnName =
  | 'NEW'
  | 'CV SENT'
  | 'FOLLOWED UP'
  | 'INTERVIEW'
  | 'REFUSAL'
  | 'OFFER'
  | 'ARCHIVE';

export type Job = {
  ID: string;
  Title: string;
  Description?: string;
  Company?: string;
  Location?: string;
  Link?: string;
  Date?: string; // dd.mm.yyyy
  Status?: ColumnName;
  Notes?: string;
  'Interview Date'?: string;
  Contacts?: string;
  Tag?: string;
  _row?: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Початкові значення для створення/редагування */
  initial?: Partial<Job>;
  /** Список доступних колонок (статусів) */
  columns: ColumnName[];
  /** Повертає готовий Job у батьківський компонент */
  onSubmit: (job: Job) => void;
  /** Видалення лише для self-* (опційно) */
  onDelete?: (job: Job) => void;
};

const normalize = (s?: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-') // все, що не літера/цифра/_, -> тире
    .replace(/-+/g, '-') // стискаємо багато тире
    .replace(/^-|-$/g, ''); // обрізаємо тире по краях

/** ID: self-{title+company+location} */
const makeSelfId = (title?: string, company?: string, location?: string): string => {
  const parts = [normalize(title), normalize(company), normalize(location)].filter(Boolean);
  return `self-${parts.join('--') || 'untitled'}`;
};

const emptyForm: Required<
  Pick<Job, 'Title' | 'Description' | 'Company' | 'Location' | 'Link' | 'Date' | 'Status' | 'Notes'>
> & {Tag: string; Contacts: string; 'Interview Date': string} = {
  Title: '',
  Description: '',
  Company: '',
  Location: '',
  Link: '',
  Date: '',
  Status: 'NEW',
  Notes: '',
  'Interview Date': '',
  Contacts: '',
  Tag: '',
};

const NewJobModal: React.FC<Props> = ({isOpen, onClose, initial, columns, onSubmit, onDelete}) => {
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Ініціалізація/оновлення форми при відкритті
  useEffect(() => {
    if (!isOpen) return;
    const seed = {
      ...emptyForm,
      ...(initial || {}),
      Status: (initial?.Status as ColumnName) || initial?.Status || 'NEW',
      Title: initial?.Title || '',
      Description: initial?.Description || '',
      Company: initial?.Company || '',
      Location: initial?.Location || '',
      Link: initial?.Link || '',
      Date: initial?.Date || '',
      Notes: initial?.Notes || '',
      'Interview Date': initial?.['Interview Date'] || '',
      Contacts: initial?.Contacts || '',
      Tag: initial?.Tag || '',
    };
    setForm(seed);
  }, [isOpen, initial]);

  // Блокуємо скрол сторінки, поки модалка відкрита
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Фокус на Title + Esc
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const isEdit = Boolean(initial?.ID);
  const isSelf = Boolean(initial?.ID?.startsWith?.('self-'));
  const canDelete = isEdit && isSelf && typeof onDelete === 'function';

  const set =
    <K extends keyof typeof form>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({...f, [key]: e.target.value}));

  const disabledSubmit = saving || !form.Title.trim();

  const handleOverlayClick: React.MouseEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      // Клік по оверлею — закрити, по контенту — ні
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault();
      if (disabledSubmit) return;

      setSaving(true);
      try {
        // Якщо був self-ID — зберігаємо його; інакше створюємо новий
        const finalId =
          initial?.ID && initial.ID.startsWith('self-')
            ? initial.ID
            : makeSelfId(form.Title, form.Company, form.Location);

        const payload: Job = {
          ID: finalId,
          Title: form.Title.trim(),
          Description: form.Description?.trim() || '',
          Company: form.Company?.trim() || '',
          Location: form.Location?.trim() || '',
          Link: form.Link?.trim() || '',
          Date: form.Date?.trim() || '',
          Status: (form.Status || 'NEW') as ColumnName,
          Notes: form.Notes?.trim() || '',
          'Interview Date': form['Interview Date']?.trim() || '',
          Contacts: form.Contacts?.trim() || '',
          Tag: form.Tag?.trim() || '',
          _row: initial?._row, // якщо є (редагування з шитів)
        };

        // ВАЖЛИВО: викликаємо колбек БЕЗ очікувань — оптимістично
        onSubmit(payload);
        onClose(); // одразу закриваємо
      } finally {
        setSaving(false);
      }
    },
    [disabledSubmit, form, initial?._row, initial?.ID, onClose, onSubmit],
  );

  const handleDelete = useCallback(() => {
    if (!canDelete || !onDelete) return;
    const payload: Job = {
      ID: initial!.ID!,
      Title: form.Title || initial!.Title || '',
      Description: form.Description || initial!.Description || '',
      Company: form.Company || initial!.Company || '',
      Location: form.Location || initial!.Location || '',
      Link: form.Link || initial!.Link || '',
      Date: form.Date || initial!.Date || '',
      Status: (form.Status || initial!.Status || 'NEW') as ColumnName,
      Notes: form.Notes || initial!.Notes || '',
      'Interview Date': form['Interview Date'] || initial!['Interview Date'] || '',
      Contacts: form.Contacts || initial!.Contacts || '',
      Tag: form.Tag || initial!.Tag || '',
      _row: initial!._row,
    };
    onDelete(payload);
    onClose();
  }, [canDelete, form, initial, onClose, onDelete]);

  if (!isOpen) return null;

  return (
    <div className="newjob-overlay" onClick={handleOverlayClick}>
      <div className="newjob" role="dialog" aria-modal="true" aria-labelledby="newjob-title">
        <header className="newjob__header">
          <h2 id="newjob-title" className="newjob__title">
            {isEdit ? 'Edit job' : 'Create job'}
          </h2>

          <div className="newjob__actions-left">
            {canDelete && (
              <button
                type="button"
                className="newjob__btn newjob__btn--danger"
                onClick={handleDelete}
                title="Delete this job (local)"
              >
                Delete
              </button>
            )}
          </div>

          <button
            type="button"
            className="newjob__close"
            aria-label="Close dialog"
            onClick={onClose}
            title="Close (Esc)"
          >
            ×
          </button>
        </header>

        <form className="newjob__form" onSubmit={handleSubmit}>
          <div className="newjob__grid">
            <label className="newjob__field">
              <span className="newjob__label">Title *</span>
              <input
                ref={titleRef}
                className="newjob__input"
                type="text"
                value={form.Title}
                onChange={set('Title')}
                placeholder="e.g. Frontend Engineer"
                required
              />
            </label>

            <label className="newjob__field">
              <span className="newjob__label">Company</span>
              <input
                className="newjob__input"
                type="text"
                value={form.Company}
                onChange={set('Company')}
                placeholder="Company Inc."
              />
            </label>

            <label className="newjob__field">
              <span className="newjob__label">Location</span>
              <input
                className="newjob__input"
                type="text"
                value={form.Location}
                onChange={set('Location')}
                placeholder="Remote / City, Country"
              />
            </label>

            <label className="newjob__field">
              <span className="newjob__label">Link</span>
              <input
                className="newjob__input"
                type="url"
                value={form.Link}
                onChange={set('Link')}
                placeholder="https://…"
              />
            </label>

            <label className="newjob__field">
              <span className="newjob__label">Date (dd.mm.yyyy)</span>
              <input
                className="newjob__input"
                type="text"
                value={form.Date}
                onChange={set('Date')}
                placeholder="dd.mm.yyyy"
                inputMode="numeric"
              />
            </label>

            <label className="newjob__field">
              <span className="newjob__label">Status</span>
              <select className="newjob__input" value={form.Status} onChange={set('Status')}>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="newjob__field newjob__field--full">
              <span className="newjob__label">Description</span>
              <textarea
                className="newjob__textarea"
                value={form.Description}
                onChange={set('Description')}
                rows={4}
                placeholder="Short description / responsibilities / stack…"
              />
            </label>

            <label className="newjob__field">
              <span className="newjob__label">Tag</span>
              <input
                className="newjob__input"
                type="text"
                value={form.Tag}
                onChange={set('Tag')}
                placeholder="Priority / Remote / Senior…"
              />
            </label>

            <label className="newjob__field">
              <span className="newjob__label">Contacts</span>
              <input
                className="newjob__input"
                type="text"
                value={form.Contacts}
                onChange={set('Contacts')}
                placeholder="Recruiter name, email, phone…"
              />
            </label>

            <label className="newjob__field">
              <span className="newjob__label">Interview Date</span>
              <input
                className="newjob__input"
                type="date"
                value={form['Interview Date']}
                onChange={set('Interview Date')}
              />
            </label>

            <label className="newjob__field newjob__field--full">
              <span className="newjob__label">Notes</span>
              <textarea
                className="newjob__textarea"
                value={form.Notes}
                onChange={set('Notes')}
                rows={3}
                placeholder="Next steps / reminders…"
              />
            </label>
          </div>

          <footer className="newjob__footer">
            <button type="button" className="newjob__btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="newjob__btn newjob__btn--primary"
              disabled={disabledSubmit}
              aria-disabled={disabledSubmit}
              title={
                form.Title.trim() ? (isEdit ? 'Save changes' : 'Create job') : 'Title is required'
              }
            >
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default NewJobModal;
