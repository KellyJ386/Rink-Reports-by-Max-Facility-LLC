-- =====================================================================
-- RinkReports 3.0 — Phase 5B: Communications data model
-- Migration: 012_communications.sql
--
-- Communications is the internal document delivery and PDF hub.
-- Staff send messages to one or more recipients (selected from the
-- facility roster). Messages can carry an optional PDF attachment
-- generated client-side from any other module's finalized record.
--
-- Tables:
--   * messages          — one row per sent message. Body is markdown-
--                          flavored plain text (bold/italic/list).
--                          Optional attachment_path points into the
--                          'communications' Storage bucket. Status
--                          notes the attachment subject (e.g. "Daily
--                          Report — 2026-04-07") for the inbox view.
--   * message_recipients — one row per (message, recipient) pair.
--                          read_at flips when the recipient opens
--                          the message. RLS lets the recipient
--                          update their OWN read_at and lets either
--                          end of the conversation read the row.
--
-- Storage:
--   * 'communications' bucket — private, with RLS policies that let
--     the sender read/write their own files and let recipients read
--     files attached to messages they received.
--
-- Per CLAUDE.md Rule 2, the facility postal code (for outdoor temp
-- lookup on the PDF header) and the temperature unit (°F or °C) are
-- both stored in facility_config under module='communications'.
-- =====================================================================

create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  facility_id       uuid not null references public.facilities (id) on delete cascade,
  sender_id         uuid not null references auth.users (id) on delete cascade,
  subject           text not null check (char_length(subject) between 1 and 200),
  body              text not null default '',
  -- Optional attachment metadata. attachment_path is the path inside
  -- the 'communications' Storage bucket; attachment_label is the
  -- human-readable name shown to recipients ("Daily Report — Mon Apr 7").
  attachment_path   text,
  attachment_label  text,
  sent_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists messages_facility_sent_at_idx
  on public.messages (facility_id, sent_at desc);
create index if not exists messages_sender_sent_at_idx
  on public.messages (sender_id, sent_at desc);

create table if not exists public.message_recipients (
  message_id  uuid not null references public.messages (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  read_at     timestamptz,
  primary key (message_id, user_id)
);

create index if not exists message_recipients_user_idx
  on public.message_recipients (user_id, message_id);

-- ---------------------------------------------------------------------
-- RLS — messages
-- ---------------------------------------------------------------------
alter table public.messages enable row level security;
alter table public.messages force row level security;

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
  on public.messages for select to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (
      sender_id = (select auth.uid())
      or exists (
        select 1 from public.message_recipients r
        where r.message_id = id
          and r.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists messages_insert_self on public.messages;
create policy messages_insert_self
  on public.messages for insert to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and sender_id = (select auth.uid())
  );

-- No update / delete on messages.

-- ---------------------------------------------------------------------
-- RLS — message_recipients
-- ---------------------------------------------------------------------
alter table public.message_recipients enable row level security;
alter table public.message_recipients force row level security;

drop policy if exists message_recipients_select_participant on public.message_recipients;
create policy message_recipients_select_participant
  on public.message_recipients for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = (select auth.uid())
    )
  );

drop policy if exists message_recipients_insert_sender on public.message_recipients;
create policy message_recipients_insert_sender
  on public.message_recipients for insert to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = (select auth.uid())
    )
  );

drop policy if exists message_recipients_update_self on public.message_recipients;
create policy message_recipients_update_self
  on public.message_recipients for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on
  public.messages,
  public.message_recipients
  to authenticated;

-- ---------------------------------------------------------------------
-- Storage bucket: 'communications'
--
-- Private bucket. The sender uploads PDF blobs under the path
-- "<facility_id>/<message_id>/<filename>.pdf" so the policies can
-- gate access by checking the message_recipients junction.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('communications', 'communications', false)
on conflict (id) do nothing;

-- Senders + recipients can read PDFs whose path starts with a
-- message_id they participate in.
drop policy if exists communications_read_participants on storage.objects;
create policy communications_read_participants
  on storage.objects for select to authenticated
  using (
    bucket_id = 'communications'
    and exists (
      select 1
      from public.messages m
      left join public.message_recipients r on r.message_id = m.id
      where (m.sender_id = (select auth.uid()) or r.user_id = (select auth.uid()))
        and (storage.objects.name like m.id::text || '/%'
             or storage.objects.name like '%/' || m.id::text || '/%')
    )
  );

drop policy if exists communications_insert_sender on storage.objects;
create policy communications_insert_sender
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'communications'
    and owner = (select auth.uid())
  );

drop policy if exists communications_delete_sender on storage.objects;
create policy communications_delete_sender
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'communications'
    and owner = (select auth.uid())
  );

-- ---------------------------------------------------------------------
-- pg_cron retention: 1 year for messages.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-old-messages') then
    perform cron.unschedule('delete-old-messages');
  end if;
  perform cron.schedule(
    'delete-old-messages',
    '0 3 * * *',
    $sql$ delete from public.messages where sent_at < now() - interval '365 days' $sql$
  );
end$$;
