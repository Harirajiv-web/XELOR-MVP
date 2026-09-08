"use client";

import { useMemo, useState } from "react";
import { Mail, MessageCircle, Monitor, Smartphone } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { ErrorState, Loading } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import { clockOf, networkApi, whatsappToHtml, type OutboxMessage } from "../api";

/**
 * WHAT THE SUPPLIER ACTUALLY RECEIVES.
 *
 * Every message this system meant to send, rendered exactly as it was composed — the same
 * string, the same line breaks, the same *bold* markers WhatsApp would interpret. Nothing on
 * this screen is a mock-up of a message: it is THE message, read back out of the outbox row
 * that would have been handed to a provider.
 *
 * Two views because there are two audiences for the same question. The PHONE is where a
 * supplier will really read this — in a workshop, one thumb, sunlight — and it is the view
 * that shows whether the card survives a 360px screen. The DESKTOP is WhatsApp Web, which is
 * where the buyer's own team sits, and it shows the whole conversation at once.
 *
 * Nothing has been sent. There is no live WhatsApp sender configured, and the screen says so
 * rather than letting a demo imply that a supplier's phone buzzed. What is real: the card,
 * the link inside it, and the fact that opening that link genuinely works.
 */
export default function NetworkMessagesScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<{ items: OutboxMessage[] }>(
    `${networkApi.outboxPath}?limit=100`,
  );
  const [view, setView] = useState<"phone" | "web">("phone");
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [selected, setSelected] = useState<string | null>(null);

  const messages = useMemo(
    () => (data?.items ?? []).filter((m) => m.channel === channel),
    [data, channel],
  );

  /** One thread per recipient, newest last — the way a chat app groups a conversation. */
  const threads = useMemo(() => {
    const byRecipient = new Map<string, OutboxMessage[]>();
    for (const m of [...messages].reverse()) {
      const key = m.recipient;
      byRecipient.set(key, [...(byRecipient.get(key) ?? []), m]);
    }
    return [...byRecipient.entries()].map(([recipient, items]) => ({
      recipient,
      name: items[0]?.recipientName ?? recipient,
      items,
      last: items[items.length - 1]!,
    }));
  }, [messages]);

  const active = threads.find((t) => t.recipient === selected) ?? threads[0];

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Messages to suppliers"
        subtitle="Every message this system composed, exactly as written. Shown on a phone and on the desktop, because both are where somebody reads it."
        meta={[
          { label: "Messages", value: String(data.items.length) },
          { label: "WhatsApp", value: String(data.items.filter((m) => m.channel === "whatsapp").length) },
          { label: "Email", value: String(data.items.filter((m) => m.channel === "email").length) },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-input)]">
              {(
                [
                  ["whatsapp", "WhatsApp", MessageCircle],
                  ["email", "Email", Mail],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setChannel(key);
                    setSelected(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium ${
                    channel === key
                      ? "bg-[var(--brand)] text-[var(--text-on-brand)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-input)]">
              {(
                [
                  ["phone", "Phone", Smartphone],
                  ["web", "Desktop", Monitor],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium ${
                    view === key
                      ? "bg-[var(--brand)] text-[var(--text-on-brand)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <p className="rounded-[var(--radius-control)] border border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3 text-[13px] text-[var(--warn-ink)]">
        <b>Nothing has been sent.</b> No live WhatsApp or email sender is configured, so these
        messages were composed and kept rather than delivered. The card, the link inside it and
        the page that link opens are all real — only the delivery is not.
      </p>

      {threads.length === 0 ? (
        <p className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-6 text-[13px] text-[var(--text-secondary)]">
          No {channel === "whatsapp" ? "WhatsApp" : "email"} messages yet. Publish a request to
          the network and the invitations will appear here.
        </p>
      ) : view === "phone" ? (
        <div className="flex flex-wrap gap-6">
          {threads.slice(0, 3).map((t) => (
            <PhoneThread key={t.recipient} name={t.name} recipient={t.recipient} items={t.items} channel={channel} />
          ))}
        </div>
      ) : (
        <WebThread
          threads={threads}
          active={active}
          onSelect={setSelected}
          channel={channel}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ phone */

/**
 * A phone, drawn at roughly the width of a real one. The point is not decoration: a card that
 * needs a scroll on a 360px screen is a card a supplier will not read, and that only becomes
 * obvious at this width.
 */
function PhoneThread({
  name,
  recipient,
  items,
  channel,
}: {
  name: string;
  recipient: string;
  items: OutboxMessage[];
  channel: "whatsapp" | "email";
}): React.JSX.Element {
  return (
    <div className="w-full max-w-[22rem] overflow-hidden rounded-[2rem] border-[6px] border-[var(--border-strong)] bg-[#0b141a] shadow-lg">
      <div className="flex items-center gap-2.5 bg-[#1f2c33] px-3 py-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#6b7c85] text-[13px] font-semibold text-white">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-white">{name}</span>
          <span className="block truncate text-[11px] text-[#8696a0]">{recipient}</span>
        </span>
      </div>

      {/* WhatsApp's own wallpaper colour. The bubbles have to sit on it to look right. */}
      <div className="flex max-h-[30rem] flex-col gap-2 overflow-y-auto bg-[#0b141a] p-3">
        {items.map((m) => (
          <Bubble key={m.id} message={m} channel={channel} />
        ))}
      </div>

      <p className="bg-[#1f2c33] px-3 py-2 text-center text-[10px] text-[#8696a0]">
        Preview · nothing was delivered
      </p>
    </div>
  );
}

/** An outgoing WhatsApp bubble: the green one, right-aligned, with a time and two ticks. */
function Bubble({
  message,
  channel,
}: {
  message: OutboxMessage;
  channel: "whatsapp" | "email";
}): React.JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg rounded-tr-none bg-[#005c4b] px-2.5 py-2 text-[13px] leading-[1.45] text-[#e9edef]">
        {channel === "email" && message.subject ? (
          <p className="mb-1 border-b border-white/15 pb-1 text-[12px] font-semibold">
            {message.subject}
          </p>
        ) : null}
        <div
          className="wa-body whitespace-pre-wrap break-words"
          // The message body is composed by this application from its own templates and
          // database columns — never by a supplier — and is HTML-escaped in `whatsappToHtml`
          // before the two formatting tags are put back. There is no path by which somebody
          // else's text reaches this line unescaped.
          dangerouslySetInnerHTML={{ __html: whatsappToHtml(message.body) }}
        />
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#8696a0]">
          {clockOf(message.createdAt)}
          <span className={message.status === "failed" ? "text-[var(--bad-ink)]" : "text-[#53bdeb]"}>
            {message.status === "failed" ? "!" : "✓✓"}
          </span>
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- desktop */

/** WhatsApp Web: a conversation list on the left, the open thread on the right. */
function WebThread({
  threads,
  active,
  onSelect,
  channel,
}: {
  threads: { recipient: string; name: string; items: OutboxMessage[]; last: OutboxMessage }[];
  active: { recipient: string; name: string; items: OutboxMessage[] } | undefined;
  onSelect: (recipient: string) => void;
  channel: "whatsapp" | "email";
}): React.JSX.Element {
  return (
    <div className="grid overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <aside className="max-h-[34rem] overflow-y-auto border-b border-[var(--border)] bg-[#111b21] md:border-b-0 md:border-r">
        {threads.map((t) => (
          <button
            key={t.recipient}
            type="button"
            onClick={() => onSelect(t.recipient)}
            className={`flex w-full items-start gap-3 border-b border-white/5 px-3 py-3 text-left ${
              active?.recipient === t.recipient ? "bg-[#2a3942]" : ""
            }`}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#6b7c85] text-[14px] font-semibold text-white">
              {t.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[14px] text-[#e9edef]">{t.name}</span>
                <span className="shrink-0 text-[11px] text-[#8696a0]">{clockOf(t.last.createdAt)}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-[#8696a0]">
                {t.last.body.split("\n")[0]?.replace(/\*/g, "")}
              </span>
            </span>
          </button>
        ))}
      </aside>

      <section className="flex max-h-[34rem] flex-col bg-[#0b141a]">
        <header className="flex items-center gap-3 bg-[#202c33] px-4 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#6b7c85] text-[13px] font-semibold text-white">
            {(active?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] text-[#e9edef]">{active?.name}</span>
            <span className="block truncate text-[11px] text-[#8696a0]">{active?.recipient}</span>
          </span>
        </header>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {(active?.items ?? []).map((m) => (
            <Bubble key={m.id} message={m} channel={channel} />
          ))}
        </div>
        <p className="bg-[#202c33] px-4 py-2 text-center text-[11px] text-[#8696a0]">
          Preview only — no message was delivered to this number
        </p>
      </section>
    </div>
  );
}
