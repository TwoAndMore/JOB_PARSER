import React, {useCallback, useEffect, useId, useRef, useState} from 'react';
import './Modal.scss';

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
  Tag?: string; // only Tag
  _row?: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  onSave: (updatedJob: Job) => void;
  onEdit?: (job: Job) => void;
};

const Modal: React.FC<Props> = ({isOpen, onClose, job, onSave, onEdit}) => {
  const [notes, setNotes] = useState<string>('');
  const [interviewDate, setInterviewDate] = useState<string>('');
  const [contacts, setContacts] = useState<string>('');
  const [tag, setTag] = useState<string>('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const tagListId = useId();

  // синхронізуємо локальний стан при відкритті й зміні job
  useEffect(() => {
    if (!isOpen || !job) return;
    setNotes(job.Notes ?? '');
    setInterviewDate(job['Interview Date'] ?? '');
    setContacts(job.Contacts ?? '');
    setTag(job.Tag ?? '');
  }, [isOpen, job]);

  // блокуємо скрол сторінки, поки модалка відкрита
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // автофокус + Esc
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const stop: React.MouseEventHandler<HTMLDivElement> = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault();
      if (!job) return;
      onSave({
        ...job,
        Notes: notes,
        'Interview Date': interviewDate,
        Contacts: contacts,
        Tag: tag,
      });
      onClose();
    },
    [contacts, interviewDate, job, notes, onClose, onSave, tag],
  );

  // відкрити форму редагування (лише для self-*)
  const handleEdit = useCallback(() => {
    if (!job || !onEdit) return;
    onEdit(job);
    onClose();
  }, [job, onEdit, onClose]);

  if (!isOpen || !job) return null;

  const hasDescription = Boolean(job.Description && job.Description.trim());
  const descId = 'job-modal-desc';
  const canEdit = job.ID.startsWith('self-') && typeof onEdit === 'function';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-modal-title"
        aria-describedby={hasDescription ? descId : undefined}
        onClick={stop}
        ref={dialogRef}
        tabIndex={-1}
      >
        {/* Header */}
        <header className="modal__header">
          <div className="modal__title-wrap">
            <h2 className="modal__title" id="job-modal-title">
              {job.Title}
            </h2>

            <div className="modal__meta">
              {job.Company && <span className="modal__chip">{job.Company}</span>}

              {job.Location && (
                <>
                  <span className="modal__dot">•</span>
                  <span className="modal__muted">{job.Location}</span>
                </>
              )}

              {job.Date && <span className="modal__chip">{job.Date}</span>}
            </div>
          </div>

          <button
            className="modal__close"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            title="Close (Esc)"
          >
            ×
          </button>
        </header>

        {/* Content */}
        <form className="modal__content" onSubmit={handleSubmit}>
          {/* Left: read-only */}
          <section className="modal__section">
            <div className="modal__row">
              <span className="modal__label">Status</span>
              <span className="modal__value">{job.Status || '—'}</span>
            </div>

            <div className="modal__block">
              <div className="modal__label">Description</div>
              <div className="modal__desc" id={descId}>
                {hasDescription ? job.Description : 'N/A'}
              </div>
            </div>

            {job.Link && (
              <div className="modal__block">
                <a className="modal__link" href={job.Link} target="_blank" rel="noreferrer">
                  Open vacancy link →
                </a>
              </div>
            )}
          </section>

          {/* Right: editable */}
          <section className="modal__section modal__section--form">
            <label className="modal__field">
              <span className="modal__field-label">Notes</span>
              <textarea
                ref={firstFieldRef}
                className="modal__textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes, next steps, reminders..."
              />
            </label>

            <label className="modal__field">
              <span className="modal__field-label">Interview Date</span>
              <input
                className="modal__input"
                type="date"
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
              />
            </label>

            <label className="modal__field">
              <span className="modal__field-label">Contacts</span>
              <input
                className="modal__input"
                type="text"
                value={contacts}
                onChange={(e) => setContacts(e.target.value)}
                placeholder="Recruiter name, email, phone…"
              />
            </label>

            <label className="modal__field">
              <span className="modal__field-label">Tag</span>
              <input
                className="modal__input"
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="e.g. Priority, Remote, Senior"
                list={tagListId}
              />
              <datalist id={tagListId}>
                <option value="Priority" />
                <option value="Remote" />
                <option value="Relocation" />
                <option value="Senior" />
                <option value="Junior" />
              </datalist>
            </label>
          </section>

          <footer className="modal__footer">
            <div className="modal__footer-left">
              {canEdit && (
                <button
                  className="modal__btn"
                  type="button"
                  onClick={handleEdit}
                  title="Edit full details"
                >
                  Edit
                </button>
              )}
            </div>

            <div className="modal__footer-actions">
              <button className="modal__btn modal__btn--ghost" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="modal__btn modal__btn--primary" type="submit">
                Save changes
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default Modal;
