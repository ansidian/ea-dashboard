import { useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar } from "lucide-react";
import { Icon } from "@/lib/icons.jsx";
import { ACCOUNT_ICON_OPTIONS } from "@/lib/icons.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateAccount, reorderAccounts } from "../../api";

const COLOR_OPTIONS = ["#cba6da", "#b4befe", "#f38ba8", "#f5c2e7", "#fab387", "#f9e2af", "#a6e3a1", "#89dceb", "#89b4fa", "#6c7086"];

function AccountRow({ acc, accounts, setAccounts, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(acc.label || acc.email);
  const [color, setColor] = useState(acc.color || "#cba6da");
  const [icon, setIcon] = useState(acc.icon || (acc.type === "icloud" ? "Apple" : "Mail"));
  const [saving, setSaving] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: acc.id, disabled: editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
    cursor: editing ? "default" : isDragging ? "grabbing" : "grab",
  };

  async function handleSave() {
    setSaving(true);
    const updates = { label, color, icon };
    await updateAccount(acc.id, updates);
    setAccounts(accounts.map(a => a.id === acc.id ? { ...a, ...updates } : a));
    setSaving(false);
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="cursor-pointer shrink-0 flex items-center" style={{ color }} onClick={() => setEditing(!editing)} title="Edit"><Icon name={icon} size={16} /></span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <div className="text-[13px] font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap">{label}</div>
            </div>
            <div className="text-[11px] max-sm:text-xs text-muted-foreground truncate">{acc.email} · {acc.type}</div>
          </div>
        </div>
        <div
          className="flex items-center gap-2 max-sm:border-t max-sm:border-white/[0.04] max-sm:pt-2 max-sm:-mx-4 max-sm:px-4"
          // Stop pointerdown so the row's dnd-kit PointerSensor doesn't capture
          // the pointer and swallow clicks on these buttons. The buttons aren't
          // drag handles anyway — the icon/label area still initiates drag.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="xs" onClick={() => setEditing(!editing)}>
            {editing ? "Cancel" : "Edit"}
          </Button>
          {acc.type === "gmail" && (
            <button
              onClick={async () => {
                const newVal = !acc.calendar_enabled;
                await updateAccount(acc.id, { calendar_enabled: newVal });
                setAccounts(accounts.map(a => a.id === acc.id ? { ...a, calendar_enabled: newVal ? 1 : 0 } : a));
              }}
              title={acc.calendar_enabled ? "Calendar sync enabled" : "Calendar sync disabled"}
              aria-label={acc.calendar_enabled ? "Disable calendar sync" : "Enable calendar sync"}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] max-sm:text-xs font-medium cursor-pointer transition-all whitespace-nowrap",
                acc.calendar_enabled
                  ? "bg-[#cba6da]/15 border border-[#cba6da]/30 text-[#cba6da]"
                  : "bg-input-bg border border-white/[0.08] text-muted-foreground"
              )}
            >
              <Calendar size={12} />
              {acc.calendar_enabled ? "Calendar on" : "Calendar off"}
            </button>
          )}
          <Button variant="destructive" size="xs" onClick={() => onRemove(acc.id)}>Remove</Button>
        </div>
      </div>
      {editing && (
        <div className="px-3.5 py-3 border-t border-border bg-white/[0.01] flex flex-col gap-3 animate-[fadeIn_0.15s_ease]">
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Display Name</label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder={acc.email} />
          </div>
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Icon</label>
            <div className="flex gap-1 flex-wrap">
              {ACCOUNT_ICON_OPTIONS.map(e => (
                <button key={e} onClick={() => setIcon(e)} className={cn(
                  "px-2 py-2 rounded-md cursor-pointer border transition-all flex items-center justify-center",
                  icon === e
                    ? "bg-primary/[0.12] border-primary/30"
                    : "bg-white/[0.03] border-border hover:bg-white/[0.06]"
                )} aria-label={`Select icon ${e}`}><Icon name={e} size={16} /></button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Color</label>
            <div className="flex gap-1.5 items-center">
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setColor(c)} className="w-[22px] h-[22px] max-sm:w-8 max-sm:h-8 rounded-full cursor-pointer transition-all" style={{
                  background: c,
                  border: color === c ? "2px solid #fff" : "2px solid transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                }} aria-label={`Select color ${c}`} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-[22px] h-[22px] rounded-full border-none cursor-pointer bg-transparent"
                title="Custom color"
                aria-label="Pick custom color"
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="self-start">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AccountsList({ accounts, setAccounts, onRemove }) {
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = accounts.findIndex(a => a.id === active.id);
    const newIndex = accounts.findIndex(a => a.id === over.id);
    const reordered = arrayMove(accounts, oldIndex, newIndex);
    setAccounts(reordered);
    await reorderAccounts(reordered.map(a => a.id));
  }

  return (
    <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={accounts.map(a => a.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {accounts.map(acc => (
            <AccountRow key={acc.id} acc={acc} accounts={accounts} setAccounts={setAccounts} onRemove={onRemove} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
