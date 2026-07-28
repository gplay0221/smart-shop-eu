import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Invite another registered user to collaborate on a list (owner only). */
export const inviteToList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listId: string; email: string }) => {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
    if (!input.listId) throw new Error("Missing list");
    return { listId: input.listId, email };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: list, error: listErr } = await supabase
      .from("shopping_lists")
      .select("id, user_id, name")
      .eq("id", data.listId)
      .maybeSingle();
    if (listErr) throw new Error(listErr.message);
    if (!list || list.user_id !== userId) throw new Error("Only the list owner can invite people");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let invitedId: string | null = null;
    for (let page = 1; page <= 10 && !invitedId; page++) {
      const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      invitedId = users.users.find((u) => u.email?.toLowerCase() === data.email)?.id ?? null;
      if (users.users.length < 200) break;
    }
    if (!invitedId) throw new Error("No EuroSaver account with that email yet — ask them to sign up first");
    if (invitedId === userId) throw new Error("You already own this list");

    const { error: insertErr } = await supabaseAdmin
      .from("list_members")
      .upsert({ list_id: data.listId, user_id: invitedId, role: "member" }, { onConflict: "list_id,user_id" });
    if (insertErr) throw new Error(insertErr.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: invitedId,
      title: "Shared list",
      body: `You were added to the shopping list "${list.name}".`,
    });

    return { ok: true, email: data.email };
  });

/** List the people a list is shared with (owner or member). */
export const getListMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listId: string }) => {
    if (!input?.listId) throw new Error("Missing list");
    return { listId: input.listId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("is_list_member", {
      _list_id: data.listId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members, error } = await supabaseAdmin
      .from("list_members")
      .select("id, user_id, role, created_at")
      .eq("list_id", data.listId);
    if (error) throw new Error(error.message);

    const out: { id: string; userId: string; email: string; role: string }[] = [];
    for (const m of members ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      out.push({ id: m.id, userId: m.user_id, email: u.user?.email ?? "member", role: m.role });
    }
    return out;
  });

/** Remove a collaborator (owner only). */
export const removeListMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listId: string; memberId: string }) => {
    if (!input?.listId || !input?.memberId) throw new Error("Missing member");
    return { listId: input.listId, memberId: input.memberId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: list } = await supabase
      .from("shopping_lists")
      .select("id, user_id")
      .eq("id", data.listId)
      .maybeSingle();
    if (!list || list.user_id !== userId) throw new Error("Only the list owner can remove people");

    const { error } = await supabase.from("list_members").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
