import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export default function SearchableDropdown({ options, value, onChange, placeholder = "Select...", allowCreate = false, onCreateNew }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find(o => o.id === value);
  const displayName = selected?.name || (allowCreate && value && !selected ? value : null);

  const exactMatch = search && options.some(o => o.name.toLowerCase() === search.toLowerCase());
  const showCreateOption = allowCreate && search.trim() && !exactMatch;

  // Auto-select first match on type (skip if allowCreate — user may be typing a new name)
  useEffect(() => {
    if (!allowCreate && search && options.length > 0) {
      const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
      if (filtered.length > 0) onChange(filtered[0].id);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    const name = search.trim();
    if (onCreateNew) onCreateNew(name);
    else onChange(name);
    setOpen(false);
    setSearch("");
  };

  return (
    <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setSearch(""); }} modal={false}>
        <PopoverTrigger
          className={cn(
            "flex w-full items-center justify-between rounded bg-input-bg px-2.5 py-1.5",
            "border border-accent/20 text-[13px] font-medium text-text-body",
            "cursor-pointer transition-[border-color,box-shadow] duration-150",
            "hover:border-accent/40"
          )}
        >
          <span className="font-medium">{displayName || placeholder}</span>
          <span className="text-[10px] text-text-muted">{open ? "\u25B2" : "\u25BC"}</span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--anchor-width)] rounded bg-elevated border border-white/10 p-0 shadow-modal"
        >
          <Command
            shouldFilter={!allowCreate}
            className="bg-transparent"
          >
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={allowCreate ? "Search or type new..." : "Search..."}
              onKeyDown={(e) => {
                if (e.key === "Enter" && showCreateOption) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            <CommandList className="max-h-[180px]">
              {showCreateOption && (
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCreate}
                    className="text-accent-light"
                  >
                    <span className="text-sm">+</span> Create &ldquo;{search.trim()}&rdquo;
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandEmpty className="py-2 text-xs text-text-muted">No matches</CommandEmpty>
              <CommandGroup>
                {options.map(o => (
                  <CommandItem
                    key={o.id}
                    value={o.name}
                    onSelect={() => { onChange(o.id); setOpen(false); setSearch(""); }}
                    data-checked={o.id === value ? "true" : undefined}
                    className={cn(
                      "text-[13px] text-text-body cursor-pointer",
                      o.id === value && "text-accent-light bg-accent-light/10"
                    )}
                  >
                    {o.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
