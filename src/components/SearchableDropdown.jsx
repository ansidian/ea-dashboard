import { useState, useEffect, useRef } from "react";
import "./SearchableDropdown.css";

export default function SearchableDropdown({ options, value, onChange, placeholder = "Select...", allowCreate = false, onCreateNew }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => o.id === value);
  // For allowCreate with string values (payee names), also check if value is a raw string
  const displayName = selected?.name || (allowCreate && value && !selected ? value : null);
  const filtered = search
    ? options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    : options;
  const exactMatch = search && filtered.some(o => o.name.toLowerCase() === search.toLowerCase());
  const showCreateOption = allowCreate && search.trim() && !exactMatch;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(""); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Auto-select first match on type (skip if allowCreate — user may be typing a new name)
  useEffect(() => {
    if (!allowCreate && search && filtered.length > 0) onChange(filtered[0].id);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    const name = search.trim();
    if (onCreateNew) onCreateNew(name);
    else onChange(name);
    setOpen(false);
    setSearch("");
  };

  const handleEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      if (showCreateOption) { handleCreate(); }
      else if (filtered.length) { onChange(filtered[0].id); setOpen(false); setSearch(""); }
    } else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); setSearch(""); }
  };

  return (
    <div ref={ref} className="searchable-dropdown-root" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button
        className="searchable-dropdown-trigger"
        onClick={() => { setOpen(!open); setSearch(""); }}
      >
        <span className="searchable-dropdown-trigger-label">{displayName || placeholder}</span>
        <span className="searchable-dropdown-trigger-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="searchable-dropdown-panel">
          <div className="searchable-dropdown-search-wrap">
            <input
              ref={inputRef}
              className="searchable-dropdown-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={allowCreate ? "Search or type new..." : "Search..."}
              onKeyDown={handleEnter}
            />
          </div>
          <div className="searchable-dropdown-list">
            {showCreateOption && (
              <div
                className="searchable-dropdown-create"
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleCreate(); }}
                onClick={e => e.stopPropagation()}
              >
                <span className="searchable-dropdown-create-icon">+</span> Create "{search.trim()}"
              </div>
            )}
            {filtered.length === 0 && !showCreateOption && (
              <div className="searchable-dropdown-empty">No matches</div>
            )}
            {filtered.map(o => (
              <div
                key={o.id}
                className={`searchable-dropdown-item${o.id === value ? " searchable-dropdown-item--selected" : ""}`}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onChange(o.id); setOpen(false); setSearch(""); }}
                onClick={e => e.stopPropagation()}
              >
                {o.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
