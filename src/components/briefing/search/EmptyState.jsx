export default function EmptyState({ icon, message }) {
  return (
    <div className="py-10 px-5 text-center">
      <div className="flex justify-center mb-2.5 text-muted-foreground/30">{icon}</div>
      <div className="text-[11px] text-muted-foreground/60">{message}</div>
    </div>
  );
}
