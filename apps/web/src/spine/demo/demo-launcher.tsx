"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Icons from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../ui/cn";
import { demoScenarios, type DemoScenario } from "./demo-scenarios";
import { buildPresenterSnapshot } from "./demo-presenter";
import {
  DEMO_RECORD_CREATED_EVENT,
  type DemoRecordCreatedDetail,
} from "./demo-events";

function ScenarioIcon({ name, className }: { name: string; className?: string }) {
  const Component =
    (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.PlayCircle;
  return <Component className={className} aria-hidden />;
}

export function DemoLauncher(): React.JSX.Element {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(demoScenarios[0]?.id ?? "");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [completedInteractions, setCompletedInteractions] = useState<
    Record<string, DemoRecordCreatedDetail>
  >({});

  const selected = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === selectedId) ?? demoScenarios[0],
    [selectedId],
  );
  const active = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === activeId),
    [activeId],
  );
  const step = active?.steps[stepIndex];
  const isAgentTour = active?.kind === "agent-tour";
  const interactionKey = active && step ? `${active.id}:${stepIndex}` : null;
  const completedInteraction = interactionKey
    ? completedInteractions[interactionKey]
    : undefined;
  const interactionReady = !step?.interaction || Boolean(completedInteraction);
  const simpleStepLine = step ? `${step.body.split(/(?<=[.!?])\s/)[0] ?? step.body}` : "";
  const demoRecord: NonNullable<DemoScenario["demoRecord"]> | null = active && !isAgentTour
    ? active.demoRecord ?? {
        reference: `DEMO-${active.id.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 20)}`,
        subject: active.title,
        facts: [
          { label: "Situation", value: active.problem },
          { label: "Decision", value: active.decision },
        ],
      }
    : null;
  const presenterSnapshot = active && step && demoRecord
    ? buildPresenterSnapshot(active, step, stepIndex, demoRecord)
    : null;
  const recentWorkflow = active
    ? active.steps.slice(Math.max(0, stepIndex - 2), Math.min(active.steps.length, stepIndex + 2))
    : [];

  useEffect(() => {
    const recordCreated = (event: Event): void => {
      if (!active || !step?.interaction) return;
      const detail = (event as CustomEvent<DemoRecordCreatedDetail>).detail;
      if (!detail || detail.kind !== step.interaction.recordKind) return;
      setCompletedInteractions((current) => ({
        ...current,
        [`${active.id}:${stepIndex}`]: detail,
      }));
    };
    window.addEventListener(DEMO_RECORD_CREATED_EVENT, recordCreated);
    return () => window.removeEventListener(DEMO_RECORD_CREATED_EVENT, recordCreated);
  }, [active, step, stepIndex]);

  const start = (scenario: DemoScenario): void => {
    setActiveId(scenario.id);
    setStepIndex(0);
    setDetailsOpen(false);
    setCompletedInteractions({});
    setPickerOpen(false);
    const first = scenario.steps[0];
    if (first) router.push(first.path);
  };

  const stop = (): void => {
    setActiveId(null);
    setStepIndex(0);
    setDetailsOpen(false);
  };

  const move = (nextIndex: number): void => {
    if (!active) return;
    if (nextIndex > stepIndex && !interactionReady) return;
    const next = active.steps[nextIndex];
    if (!next) return;
    setStepIndex(nextIndex);
    setDetailsOpen(false);
    router.push(next.path);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-label={active ? "Choose another demo scenario" : "Start a guided demo"}
        className={cn(
          "group relative inline-flex h-9 shrink-0 items-center gap-2 overflow-hidden rounded-[10px] px-3.5 text-[12px] font-bold text-white shadow-[0_5px_18px_rgba(37,99,235,.23)] transition hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(37,99,235,.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2",
          active
            ? "bg-[linear-gradient(120deg,#047857,#0d9488)]"
            : "bg-[linear-gradient(120deg,#1d4ed8,#6d28d9)]",
        )}
        data-testid="demo-launcher"
      >
        <span className="absolute inset-0 translate-x-[-120%] bg-[linear-gradient(100deg,transparent,rgba(255,255,255,.24),transparent)] transition-transform duration-700 group-hover:translate-x-[120%]" />
        {active ? <Icons.Radio className="h-3.5 w-3.5 animate-pulse" aria-hidden /> : <Icons.Play className="h-3.5 w-3.5 fill-current" aria-hidden />}
        <span className="relative hidden xl:inline">{active ? "Demo active" : "Start Demo"}</span>
        <span className="relative xl:hidden">Demo</span>
        <Icons.ChevronDown className="relative h-3 w-3 opacity-80" aria-hidden />
      </button>

      {active ? (
        <button
          type="button"
          onClick={stop}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-red-300/35 bg-red-50 px-3 text-[10.5px] font-extrabold text-red-700 transition hover:bg-red-100 dark:bg-red-950/25 dark:text-red-300"
          data-testid="reset-demo-top"
          aria-label="Stop the active demo guide"
        >
          <Icons.RotateCcw className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden 2xl:inline">Stop demo</span>
        </button>
      ) : null}

      <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-[#07101f]/65 backdrop-blur-md" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[101] flex max-h-[88vh] w-[min(1120px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-white/15 bg-[var(--surface)] shadow-[0_30px_100px_rgba(2,8,23,.42)] focus:outline-none"
            aria-describedby="demo-picker-description"
          >
            <div className="relative overflow-hidden border-b border-[var(--border-subtle)] bg-[linear-gradient(120deg,#0b1f43,#1e3a8a_56%,#5b21b6)] px-7 py-6 text-white">
              <div className="absolute -right-14 -top-20 h-56 w-56 rounded-full border border-white/15 bg-white/5" />
              <div className="absolute right-32 top-5 h-24 w-24 rounded-full border border-cyan-200/20 bg-cyan-300/5" />
              <div className="relative flex items-start justify-between gap-5">
                <div>
                  <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.13em]">
                    <Icons.Presentation className="h-3 w-3" aria-hidden /> Guided presenter mode
                  </span>
                  <Dialog.Title className="text-[25px] font-bold tracking-[-.025em]">Choose a demo</Dialog.Title>
                  <Dialog.Description id="demo-picker-description" className="mt-1 max-w-2xl text-[13px] leading-5 text-blue-100">
                    Choose the real factory story for a non-technical audience, or the separate agent tour for a simple explanation of all nine agents and their connections.
                  </Dialog.Description>
                </div>
                <Dialog.Close className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20" aria-label="Close demo chooser">
                  <Icons.X className="h-4 w-4" aria-hidden />
                </Dialog.Close>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(310px,.85fr)]">
              <div className="overflow-y-auto p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[.13em] text-[var(--text-muted)]">Two separate presenter modes</p>
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-600"><Icons.ShieldCheck className="h-3.5 w-3.5" aria-hidden /> User-controlled Next steps</span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {demoScenarios.map((scenario, index) => {
                    const chosen = selected?.id === scenario.id;
                    return (
                      <Fragment key={scenario.id}>
                      {index === 0 ? (
                        <div className="col-span-full mb-0.5 flex items-center gap-2 rounded-[11px] border border-violet-500/18 bg-violet-500/8 px-3 py-2">
                          <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-violet-600 text-white"><Icons.Route className="h-3.5 w-3.5" aria-hidden /></span>
                          <span><b className="block text-[11px] text-[var(--text-primary)]">Demo 1 · Real factory journey</b><span className="block text-[9.5px] text-[var(--text-muted)]">Create real demo orders, then follow the customer promise.</span></span>
                        </div>
                      ) : index === 1 ? (
                        <div className="col-span-full mt-2 flex items-center gap-2 rounded-[11px] border border-teal-500/18 bg-teal-500/8 px-3 py-2">
                          <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-teal-700 text-white"><Icons.Network className="h-3.5 w-3.5" aria-hidden /></span>
                          <span><b className="block text-[11px] text-[var(--text-primary)]">Demo 2 · Meet the agents</b><span className="block text-[9.5px] text-[var(--text-muted)]">Nine headings, nine simple roles, no transaction detail.</span></span>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setSelectedId(scenario.id)}
                        className={cn(
                          "group flex min-h-[112px] items-start gap-3 rounded-[14px] border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
                          "sm:col-span-2 min-h-[122px]",
                          chosen
                            ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[0_8px_22px_rgba(37,99,235,.09)]"
                            : "border-[var(--border-subtle)] bg-[var(--surface)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]",
                        )}
                        data-testid={`demo-scenario-${scenario.id}`}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${scenario.accent}, color-mix(in srgb, ${scenario.accent} 62%, #111827))` }}>
                          <ScenarioIcon name={scenario.icon} className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="mb-1 flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]"><span>{String(index + 1).padStart(2, "0")}</span><span>·</span><span className="truncate">{scenario.category}</span></span>
                          <span className="flex items-center gap-2 text-[13px] font-bold leading-[1.25] text-[var(--text-primary)]">{scenario.title}<span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[.08em] text-white", scenario.kind === "agent-tour" ? "bg-teal-700" : "bg-violet-600")}>{scenario.kind === "agent-tour" ? "Agent overview" : "Live workflow"}</span></span>
                          <span className="mt-1.5 line-clamp-2 block text-[11px] leading-4 text-[var(--text-muted)]">{scenario.problem}</span>
                        </span>
                      </button>
                      </Fragment>
                    );
                  })}
                </div>
              </div>

              <aside className="overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg)] p-5">
                {selected ? (
                  <div className="flex min-h-full flex-col">
                    <div className="mb-5 flex items-center gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${selected.accent}, #18233a)` }}><ScenarioIcon name={selected.icon} className="h-5 w-5" /></span>
                      <div><p className="text-[15px] font-bold leading-5 text-[var(--text-primary)]">{selected.title}</p><p className="mt-1 text-[10.5px] font-semibold text-[var(--text-muted)]">{selected.duration} · {selected.steps.length} guided steps</p></div>
                    </div>
                    <div className="space-y-3 text-[11.5px] leading-[1.55]">
                      <div><p className="mb-1 font-bold text-[var(--text-primary)]">{selected.kind === "agent-tour" ? "What this demo explains" : "The real-life situation"}</p><p className="text-[var(--text-secondary)]">{selected.problem}</p></div>
                      <div><p className="mb-1 font-bold text-[var(--text-primary)]">{selected.kind === "agent-tour" ? "How it works" : "What you will show"}</p><p className="text-[var(--text-secondary)]">{selected.decision}</p></div>
                      <div className="rounded-[12px] border border-emerald-500/20 bg-emerald-500/8 p-3"><p className="mb-1 flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400"><Icons.Target className="h-3.5 w-3.5" aria-hidden /> What the viewer understands</p><p className="text-[var(--text-secondary)]">{selected.outcome}</p></div>
                    </div>
                    <ol className="my-5 space-y-2 border-l border-[var(--border-strong)] pl-4">
                      {selected.steps.map((item, index) => <li key={`${item.path}-${index}`} className="relative text-[10.5px] leading-4 text-[var(--text-muted)]"><span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[var(--brand)] ring-2 ring-[var(--bg)]" /><b className="text-[var(--text-secondary)]">{item.phase}</b> · {item.title}</li>)}
                    </ol>
                    <div className="mt-auto">
                      {active ? <p className="mb-2 text-center text-[10.5px] font-semibold text-amber-600">Starting this story replaces the current demo.</p> : null}
                      <button type="button" onClick={() => start(selected)} className="btn btn-primary w-full justify-center" data-testid="start-selected-demo"><Icons.Play className="h-3.5 w-3.5 fill-current" aria-hidden /> Start this demo</button>
                      <p className="mt-2 text-center text-[9.5px] leading-4 text-[var(--text-muted)]">The guide advances only when you press Next. In the factory story, order steps also wait for a successful save.</p>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {active && step ? createPortal(
        <section
          className={cn(
            "x-demo-dock fixed bottom-3 right-3 z-[90] w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-[16px] border border-white/10 bg-[#0b1426]/96 text-white shadow-[0_20px_60px_rgba(2,8,23,.4)] backdrop-blur-xl transition-[max-height,width,opacity,transform] duration-200 sm:bottom-4 sm:right-4",
            detailsOpen
              ? "max-h-[calc(100vh-88px)]"
              : step.interaction
                ? "max-h-[270px]"
                : isAgentTour
                  ? "max-h-[220px]"
                  : "max-h-[190px]",
          )}
          aria-label="Active guided demo"
          data-testid="active-demo-dock"
        >
          <div className="h-1 bg-white/10"><div className="h-full bg-[linear-gradient(90deg,#38bdf8,#8b5cf6,#22c55e)] transition-[width] duration-500" style={{ width: `${((stepIndex + 1) / active.steps.length) * 100}%` }} /></div>
          <div className="p-3 sm:p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-white" style={{ background: `linear-gradient(135deg, ${active.accent}, #334155)` }}><ScenarioIcon name={active.icon} className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="text-[9px] font-extrabold uppercase tracking-[.1em] text-sky-300">{step.phase}</span><span className="truncate text-[11px] font-bold">{step.title}</span><span className="ml-auto shrink-0 text-[9px] font-semibold text-slate-400">{stepIndex + 1} of {active.steps.length}</span></div>
                <p className="mt-0.5 truncate text-[9px] text-slate-500"><span className="font-semibold text-emerald-300">{isAgentTour ? "High-level agent overview" : "Real ERP screens · guide never saves for you"}</span><span> · {active.title}</span></p>
              </div>
              {!isAgentTour ? <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-slate-300 transition hover:bg-white/10 hover:text-white" aria-expanded={detailsOpen} aria-label={detailsOpen ? "Minimize demo guide" : "Expand demo guide"}>{detailsOpen ? <Icons.ChevronDown className="h-4 w-4" /> : <Icons.PanelTopOpen className="h-4 w-4" />}</button> : null}
              <button type="button" onClick={stop} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-red-300/20 bg-red-400/10 text-red-200 transition hover:bg-red-400/20" data-testid="stop-demo" aria-label="Stop demo"><Icons.X className="h-3.5 w-3.5" aria-hidden /></button>
            </div>

            <p className={cn("mt-2 text-[10.5px] font-semibold leading-4 text-slate-100", isAgentTour ? "line-clamp-4" : "line-clamp-2")} data-testid="demo-simple-explanation"><span className="mr-1 text-sky-300">{isAgentTour ? "What this agent does:" : "What’s happening:"}</span>{isAgentTour ? step.body : simpleStepLine}</p>

            {!isAgentTour && presenterSnapshot ? (
              <p
                className="mt-2 truncate text-[9.5px] text-slate-300"
                data-testid="demo-screen-context"
              >
                <b className="text-slate-100">On this screen:</b> {presenterSnapshot.headline}
              </p>
            ) : null}

            {step.interaction ? (
              <div
                className={cn(
                  "mt-2 rounded-[9px] border px-2.5 py-2 text-[9.5px] leading-4",
                  completedInteraction
                    ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                    : "border-amber-300/25 bg-amber-400/10 text-amber-100",
                )}
                data-testid="demo-manual-action"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-2">
                  {completedInteraction ? <Icons.CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden /> : <Icons.MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />}
                  <span><b>{completedInteraction ? `${completedInteraction.reference} saved.` : "Your turn—this step will wait."}</b> {completedInteraction ? "Show the saved document, then press Next." : step.interaction.instruction}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-2 flex items-center gap-2" data-testid="demo-live-record">
              <span className="min-w-0 flex-1 truncate text-[9px] text-slate-400">{isAgentTour ? <><b className="text-teal-300">Connection:</b>{` ${step.connectionLine ?? step.presenterLine}`}</> : <><b className="text-emerald-300">Live Northstar case</b>{demoRecord ? ` · ${demoRecord.reference} · ${demoRecord.subject}` : ""}</>}</span>
              <button type="button" disabled={stepIndex === 0} onClick={() => move(stepIndex - 1)} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-white/10 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Previous demo step"><Icons.ArrowLeft className="h-3.5 w-3.5" aria-hidden /></button>
              {stepIndex === active.steps.length - 1 ? (
                <button type="button" onClick={stop} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[8px] bg-emerald-500 px-3 text-[9.5px] font-extrabold text-white transition hover:bg-emerald-400" data-testid="finish-demo"><Icons.Check className="h-3 w-3" aria-hidden /> Finish</button>
              ) : (
                <button
                  type="button"
                  onClick={() => move(stepIndex + 1)}
                  disabled={!interactionReady}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[8px] bg-blue-600 px-3 text-[9.5px] font-extrabold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  data-testid="next-demo-step"
                >
                  {interactionReady ? "Next" : "Save the order first"} {interactionReady ? <Icons.ArrowRight className="h-3 w-3" aria-hidden /> : null}
                </button>
              )}
            </div>
          </div>

          {detailsOpen && !isAgentTour ? (
            <div className="max-h-[calc(100vh-285px)] overflow-y-auto border-t border-white/8 bg-white/[.035] px-3.5 py-3">
              <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[8.5px] font-extrabold uppercase tracking-[.09em] text-emerald-300">{active.evidenceMode === "live" ? "Live seeded ERP evidence" : "Illustrative narration"}</span><span className="text-[8.5px] text-slate-500">Guide navigation changes no record</span></div>
              {presenterSnapshot ? (
                <div className="mt-3 overflow-hidden rounded-[10px] border border-cyan-300/20 bg-cyan-300/[.055]" data-testid="demo-presenter-data">
                  <div className="border-b border-cyan-300/15 px-3 py-2">
                    <div className="flex items-center justify-between gap-2"><b className="text-[9px] uppercase tracking-[.1em] text-cyan-300">What to show on this screen</b><span className="text-[8px] text-slate-500">Step-specific evidence</span></div>
                    <p className="mt-1 text-[10.5px] font-bold text-white">{presenterSnapshot.headline}</p>
                    <p className="mt-1 text-[9.5px] leading-4 text-slate-300">{presenterSnapshot.explanation}</p>
                  </div>
                  <dl className="grid gap-px bg-white/8 sm:grid-cols-2">
                    {presenterSnapshot.facts.map((fact) => (
                      <div key={fact.label} className="min-w-0 bg-[#0b1426] px-3 py-2">
                        <dt className="text-[7.5px] font-extrabold uppercase tracking-[.08em] text-slate-500">{fact.label}</dt>
                        <dd className="mt-0.5 text-[9.5px] leading-4 text-slate-200">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              {demoRecord ? (
                <div className="mt-3 rounded-[10px] border border-white/10 bg-white/[.04] p-3">
                  <div className="flex items-center justify-between gap-2"><b className="text-[10px] text-white">{demoRecord.reference}</b><span className="text-[8px] font-bold uppercase tracking-[.08em] text-sky-300">{active.evidenceMode === "live" ? "Seeded live case" : "Illustrative case"}</span></div>
                  <p className="mt-1 text-[10.5px] font-semibold text-slate-200">{demoRecord.subject}</p>
                  <dl className="mt-2 grid gap-x-3 gap-y-1.5 sm:grid-cols-2">{demoRecord.facts.slice(0, 4).map((fact) => <div key={fact.label} className="min-w-0"><dt className="text-[8px] font-bold uppercase tracking-[.07em] text-slate-500">{fact.label}</dt><dd className="text-[9.5px] leading-4 text-slate-300">{fact.value}</dd></div>)}</dl>
                </div>
              ) : null}
              <ol className="mt-3 grid gap-1" aria-label="Demo record progress">
                {recentWorkflow.map((item) => {
                  const itemIndex = active.steps.indexOf(item);
                  const state = itemIndex < stepIndex ? "complete" : itemIndex === stepIndex ? "current" : "next";
                  return <li key={`${item.path}-${itemIndex}`} className={cn("flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[9.5px]", state === "current" ? "bg-blue-400/15 text-blue-100" : "text-slate-400")}><span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-bold", state === "complete" ? "bg-emerald-500 text-white" : state === "current" ? "bg-blue-500 text-white" : "border border-white/15 text-slate-500")}>{state === "complete" ? <Icons.Check className="h-2.5 w-2.5" aria-hidden /> : itemIndex + 1}</span><span className="truncate"><b className="font-bold">{item.phase}</b> · {item.title}</span><span className="ml-auto shrink-0 text-[8px] uppercase tracking-[.06em]">{state === "complete" ? "recorded" : state === "current" ? "updating" : "next"}</span></li>;
                })}
              </ol>
              <div className="mt-3 rounded-[9px] border border-white/8 px-3 py-2.5 text-[9.5px] leading-4 text-slate-300"><b className="text-slate-100">Presenter note:</b> {step.presenterLine}<div className="mt-2 flex flex-wrap gap-1.5">{step.agents.map((agent) => <span key={agent} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[8.5px] font-semibold text-slate-300">{agent}</span>)}</div></div>
            </div>
          ) : null}
        </section>,
        document.body,
      ) : null}
    </>
  );
}
