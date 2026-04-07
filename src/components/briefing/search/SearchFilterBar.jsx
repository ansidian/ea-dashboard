import FilterChip from "./FilterChip";

export default function SearchFilterBar({ emailFilter, totalUnread, onFilterChange }) {
  return (
    <div
      className="shrink-0 flex items-center gap-1 px-3 py-2"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
    >
      <FilterChip
        label="All"
        active={emailFilter === "all"}
        onClick={() => onFilterChange("all")}
      />
      <FilterChip
        label="Unread"
        count={totalUnread}
        active={emailFilter === "unread"}
        onClick={() => onFilterChange("unread")}
      />
    </div>
  );
}
