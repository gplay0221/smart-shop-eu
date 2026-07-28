import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { inviteToList, getListMembers, removeListMember } from "@/lib/share.functions";
import { Users, X, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ShareListDialog({
  listId,
  isOwner,
  onClose,
}: {
  listId: string;
  isOwner: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const fetchMembers = useServerFn(getListMembers);
  const invite = useServerFn(inviteToList);
  const removeMember = useServerFn(removeListMember);

  const { data: members, isLoading } = useQuery({
    queryKey: ["list-members", listId],
    queryFn: () => fetchMembers({ data: { listId } }),
  });

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { listId, email } }),
    onSuccess: (r) => {
      toast.success(`Shared with ${r.email}`);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["list-members", listId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMember({ data: { listId, memberId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["list-members", listId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto mt-28 w-[min(480px,92vw)] rounded-2xl bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <Users className="size-4 text-brand" /> Shared household list
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Everyone you add can tick items and edit this list live.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {isOwner && (
          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate();
            }}
          >
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@email.com"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <button
              type="submit"
              disabled={inviteMutation.isPending || !email}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              {inviteMutation.isPending ? "Adding…" : "Add"}
            </button>
          </form>
        )}

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">People</p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !members || members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Only you so far.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm truncate">{m.email}</span>
                  {isOwner && (
                    <button
                      onClick={() => removeMutation.mutate(m.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove person"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
