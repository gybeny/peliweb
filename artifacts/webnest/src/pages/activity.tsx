import { ScrollText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm, EmptyState, PageHeader } from "@/components/bits";
import { actions, useStore, fmtDate } from "@/lib/store";

export default function Activity() {
  const { activity } = useStore();
  return (
    <>
      <PageHeader kicker="Napló" title="Helyi változásnapló" desc="Az ebben a böngészőben végzett bemutató műveletek. Semmi nem került szerverre."
        actions={activity.length > 0 && <Confirm title="Napló törlése?" desc="Minden bejegyzés törlődik. A webhelyek megmaradnak." label="Törlés" onConfirm={actions.clearActivity}
          trigger={<Button variant="outline" data-testid="button-clear-log"><Trash2 className="h-4 w-4 mr-1" />Napló ürítése</Button>} />} />
      {activity.length === 0 ? <EmptyState icon={<ScrollText className="h-5 w-5" />} title="A napló üres">Módosíts egy webhelyet, és a változás itt jelenik meg.</EmptyState> : (
        <ol className="relative border-l-2 border-primary/20 ml-2 space-y-4">
          {activity.map((a, i) => (
            <li key={a.id} className="pl-5 relative rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} data-testid={`row-activity-${a.id}`}>
              <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
              <div className="text-sm">{a.message}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{fmtDate(a.at)}</div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
