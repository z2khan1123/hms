import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ErrorNote } from './QueryFeedback';

export interface SearchSelectProps<T> {
  label?: string;
  placeholder?: string;
  /** The text in the box. Owned by the caller so it can drive its own query. */
  query: string;
  onQueryChange: (query: string) => void;
  items: readonly T[];
  isLoading?: boolean;
  error?: unknown;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  /** Fires on Enter when nothing is highlighted — used for free-text entry. */
  onSubmitText?: (text: string) => void;
  emptyLabel?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Keep the typed text after a pick (default: clear it). */
  keepQueryOnSelect?: boolean;
}

/**
 * Type-ahead picker with arrow-key navigation. The front desk drives this from the
 * keyboard all day, so Enter picks, Escape closes and the list never steals focus.
 */
export function SearchSelect<T>({
  label,
  placeholder,
  query,
  onQueryChange,
  items,
  isLoading,
  error,
  getKey,
  renderItem,
  onSelect,
  onSubmitText,
  emptyLabel = 'No matches',
  autoFocus,
  disabled,
  keepQueryOnSelect,
}: SearchSelectProps<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<number | undefined>(undefined);

  useEffect(() => setActive(-1), [items]);
  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  function pick(item: T) {
    onSelect(item);
    if (!keepQueryOnSelect) onQueryChange('');
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (items.length === 0 ? -1 : (i + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (items.length === 0 ? -1 : (i <= 0 ? items.length : i) - 1));
    } else if (event.key === 'Enter') {
      if (active >= 0 && items[active]) {
        event.preventDefault();
        pick(items[active]);
      } else if (onSubmitText && query.trim()) {
        event.preventDefault();
        onSubmitText(query.trim());
        onQueryChange('');
        setOpen(false);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  // Open on focus when the caller already has options to browse (e.g. the charge
  // list); otherwise wait until there is something to search for.
  const showList = open && (query.trim().length > 0 || items.length > 0);

  return (
    <div className="field search-select">
      {label && <label htmlFor={listId}>{label}</label>}
      <input
        id={listId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
      />
      <ErrorNote error={error} />
      {showList && (
        <ul className="search-select-list" id={`${listId}-list`} role="listbox">
          {isLoading && <li className="search-select-empty">Searching…</li>}
          {!isLoading && items.length === 0 && (
            <li className="search-select-empty">
              {emptyLabel}
              {onSubmitText ? ' — press Enter to add as free text' : ''}
            </li>
          )}
          {items.map((item, index) => (
            <li
              key={getKey(item)}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
            >
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
