import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Clipboard, Copy, Download, Focus, Navigation, Play, Plus, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { CelestialBody } from '../simulation/types';
import { NudgeDirection } from '../simulation/maneuvers';
import {
  FlightPlan, FlightPlanStep, FlightReplayEntry, MAX_FLIGHT_PLAN_TITLE_LENGTH,
  appendFlightStep, buildFlightBrief, clearCompletedFlightSteps, clearSkippedFlightSteps,
  encodeFlightPlanHandoff, flightPlanDigest, makeCircularizeStep, makeMatchVelocityStep,
  makeNudgeStep, makeTransferStep, moveFlightStep, normalizeFlightPlanTitle, removeFlightStep,
  replaySummary,
} from '../simulation/flight-director';
import type { SavedFlightPlan } from '../persistence/flight-director-storage';
import type { DirectorSection, FlightDirectorPreferences } from '../persistence/flight-director-preferences';

interface Props {
  plan: FlightPlan | null;
  bodies: CelestialBody[];
  selectedBody: CelestialBody | null;
  simTimeSec: number;
  replay: FlightReplayEntry[];
  savedPlans: SavedFlightPlan[];
  viewpointCount: number;
  pendingHandoff: string | null;
  preview: { status: 'running' | 'ready' | 'error'; applied: number; rejected: number; points: number; horizonSec: number } | null;
  preferences: FlightDirectorPreferences;
  onPreferencesChange: (preferences: FlightDirectorPreferences) => void;
  onCreate: () => void;
  onChange: (plan: FlightPlan) => void;
  onExecute: (step: FlightPlanStep) => void;
  onExecuteNext: () => void;
  onImport: (code: string) => void;
  onExport: (code: string) => void;
  onSavePlan: (name: string) => void;
  onLoadSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
  onDuplicate: () => void;
  onExportArtifact: (kind: 'json' | 'csv' | 'report') => void;
  onShare: (code: string) => void;
  onImportPending: () => void;
  onDismissPending: () => void;
  onCaptureViewpoint: () => void;
  onCycleViewpoint: (direction: -1 | 1) => void;
  onExportCapsule: () => string;
  onImportCapsule: (value: string) => void;
  onClearReplay: () => void;
  onFocusCraft: () => void;
  onFocusTarget: (targetId: string) => void;
  onFeedback: (title: string, detail: string) => void;
  onPreview: () => void;
  onClearPreview: () => void;
  onClose: () => void;
}

const DIRECTIONS: Array<{ value: NudgeDirection; label: string }> = [
  { value: 'prograde', label: 'Prograde' }, { value: 'retrograde', label: 'Retrograde' },
  { value: 'radial-in', label: 'Radial in' }, { value: 'radial-out', label: 'Radial out' },
  { value: 'normal', label: 'Normal plane' }, { value: 'anti-normal', label: 'Anti-normal plane' },
];

export function FlightDirectorPanel(props: Props): React.ReactElement {
  const { plan, bodies, selectedBody, simTimeSec, replay, savedPlans, viewpointCount, pendingHandoff, preferences } = props;
  const [handoff, setHandoff] = useState('');
  const [libraryName, setLibraryName] = useState('');
  const [capsule, setCapsule] = useState('');
  const handoffRef = useRef<HTMLTextAreaElement>(null);
  const brief = useMemo(() => plan ? buildFlightBrief(plan, bodies) : null, [plan, bodies]);
  const targets = useMemo(() => bodies.filter((body) => body.id !== plan?.craftId && body.id !== plan?.primaryId), [bodies, plan]);
  const target = targets.find((body) => body.id === preferences.targetId) ?? targets[0] ?? null;
  const craft = plan ? bodies.find((body) => body.id === plan.craftId) ?? null : null;
  const primary = plan ? bodies.find((body) => body.id === plan.primaryId) ?? null : null;
  const handoffCode = plan ? encodeFlightPlanHandoff(plan) : '';
  const canExecute = Boolean(brief && brief.queuedSteps > 0 && !brief.issues.some((issue) => issue.severity === 'block'));

  const updatePreferences = (patch: Partial<FlightDirectorPreferences>) => props.onPreferencesChange({ ...preferences, ...patch });
  const updateSection = (section: DirectorSection, open: boolean) => updatePreferences({ sections: { ...preferences.sections, [section]: open } });
  const pendingDisclosure = pendingHandoff && <div className="director-pending" role="status"><AlertTriangle size={13} /><span>A valid URL-linked plan is waiting for explicit review.</span><button onClick={props.onImportPending}>REVIEW &amp; IMPORT</button><button onClick={props.onDismissPending}>DISMISS</button></div>;

  const copyHandoff = async (): Promise<void> => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(handoffCode);
      props.onFeedback('Handoff copied', 'Flight plan code copied to the clipboard.');
    } catch {
      setHandoff(handoffCode);
      requestAnimationFrame(() => { handoffRef.current?.focus(); handoffRef.current?.select(); });
      props.onFeedback('Copy unavailable', 'The handoff code is selected for manual copying.');
    }
  };

  if (!plan) return <aside className="flight-director-panel hud-interactive" aria-labelledby="flight-director-title"><header><span id="flight-director-title"><Navigation size={15} /> FLIGHT DIRECTOR</span><button onClick={props.onClose} aria-label="Close Flight Director">×</button></header><p>Build a local, replayable maneuver sequence for the selected craft. Nothing fires until a step is explicitly executed.</p>{pendingDisclosure}<button className="action-btn azure director-primary-action" disabled={!selectedBody || selectedBody.type === 'star'} onClick={props.onCreate}><Plus size={14} /> PLAN SELECTED CRAFT</button><small>{selectedBody?.type === 'star' ? 'Select an orbiter, station, or craft first.' : 'Plans stay local and use the existing maneuver safeguards.'}</small></aside>;

  const add = (step: FlightPlanStep) => props.onChange(appendFlightStep(plan, step));
  const summary = replaySummary(replay, plan.id);
  const planReplay = replay.filter((entry) => entry.planId === plan.id).slice().reverse();
  const terminalCount = plan.steps.filter((step) => step.status !== 'queued').length;
  const blocks = brief?.issues.filter((issue) => issue.severity === 'block') ?? [];
  const warnings = brief?.issues.filter((issue) => issue.severity === 'warn') ?? [];
  const targetName = (id?: string) => bodies.find((body) => body.id === id)?.name ?? 'Missing target';
  const outcome = brief?.risk === 'red' ? 'NO-GO' : 'GO';

  return <aside className="flight-director-panel hud-interactive" aria-labelledby="flight-director-title">
    <header><span id="flight-director-title"><Navigation size={15} /> FLIGHT DIRECTOR</span><button onClick={props.onClose} aria-label="Minimize Flight Director">×</button></header>
    <label className="director-title-field">PLAN TITLE<input value={plan.title} maxLength={MAX_FLIGHT_PLAN_TITLE_LENGTH} onChange={(event) => props.onChange({ ...plan, title: event.target.value.slice(0, MAX_FLIGHT_PLAN_TITLE_LENGTH) })} onBlur={(event) => props.onChange({ ...plan, title: normalizeFlightPlanTitle(event.target.value, `${craft?.name ?? 'Craft'} flight plan`) })} aria-label="Flight plan title" /></label>
    <div className="director-context"><span>CRAFT <strong>{craft?.name ?? 'Missing craft'}</strong></span><span>PRIMARY <strong>{primary?.name ?? 'Missing primary'}</strong></span><button onClick={props.onFocusCraft} disabled={!craft}><Focus size={12} /> FOCUS CRAFT</button></div>
    <div className={`director-brief ${brief?.risk ?? 'red'}`}><ShieldCheck size={17} /><div><span className="director-go-label">GO/NO-GO</span><strong>{outcome} — {brief?.risk.toUpperCase() ?? 'RED'}</strong></div><span>{brief?.queuedSteps ?? 0} queued · {brief?.totalDeltaVKmS.toFixed(3) ?? '0.000'} km/s estimated</span></div>
    <div className="director-progress-summary"><label htmlFor="director-progress">Progress: {terminalCount} of {plan.steps.length} terminal</label><progress id="director-progress" value={terminalCount} max={Math.max(1, plan.steps.length)}>{terminalCount} of {plan.steps.length}</progress></div>
    <div className="director-meta"><code>{flightPlanDigest(plan)}</code><span>T+{Math.round(simTimeSec)}s</span></div>
    {(blocks.length > 0 || warnings.length > 0) && <section className="director-preflight" aria-label="Preflight issues">{blocks.length > 0 && <div><strong>BLOCKS</strong>{blocks.map((issue) => <div className="director-issue block" key={`${issue.code}-${issue.stepId ?? ''}`}><AlertTriangle size={12} /> {issue.message}</div>)}</div>}{warnings.length > 0 && <div><strong>WARNINGS</strong>{warnings.map((issue) => <div className="director-issue warn" key={`${issue.code}-${issue.stepId ?? ''}`}><AlertTriangle size={12} /> {issue.message}</div>)}</div>}</section>}
    <fieldset className="director-composer"><legend>MANEUVER</legend><label>Direction<select value={preferences.direction} onChange={(event) => updatePreferences({ direction: event.target.value as NudgeDirection })}>{DIRECTIONS.map((direction) => <option key={direction.value} value={direction.value}>{direction.label}</option>)}</select></label><label>Delta-v (km/s)<input type="number" min="0.001" max="20" step="0.001" value={preferences.magnitudeKmS} onChange={(event) => updatePreferences({ magnitudeKmS: Number(event.target.value) })} /></label><button onClick={() => add(makeNudgeStep(preferences.direction, preferences.magnitudeKmS))}><Plus size={12} /> ADD IMPULSE</button><button onClick={() => add(makeCircularizeStep())}><Plus size={12} /> CIRCULARIZE</button></fieldset>
    <fieldset className="director-target-row"><legend>TARGET OPERATIONS</legend><select value={target?.id ?? ''} onChange={(event) => updatePreferences({ targetId: event.target.value })} aria-label="Flight Director target"><option value="" disabled>{target ? 'Select target' : 'No target available'}</option>{targets.map((body) => <option key={body.id} value={body.id}>{body.name}</option>)}</select><button disabled={!target || !primary} onClick={() => target && primary && add(makeTransferStep(target, primary))}>TRANSFER</button><button disabled={!target} onClick={() => target && add(makeMatchVelocityStep(target))}>MATCH</button><button disabled={!target} onClick={() => target && props.onFocusTarget(target.id)}><Focus size={12} /> FOCUS TARGET</button></fieldset>
    <ol className="director-steps">{plan.steps.map((step, index) => <li className={step.status} key={step.id}><span className="director-step-index">{index + 1}</span><div><strong>{step.kind.replace('-', ' ').toUpperCase()} · {step.status.toUpperCase()}</strong><small>{step.kind === 'nudge' ? `${step.direction?.replace('-', ' ')} · ${(step.deltaVKmS ?? 0).toFixed(3)} km/s` : step.targetId ? `Target: ${targetName(step.targetId)}${step.kind === 'transfer' && step.targetRadiusKm ? ` · planned radius ${step.targetRadiusKm.toFixed(0)} km` : ''}` : step.label}</small></div><div className="director-step-actions"><button disabled={index === 0} onClick={() => props.onChange(moveFlightStep(plan, step.id, -1))} aria-label={`Move ${step.label} up`}><ChevronUp size={13} /></button><button disabled={index === plan.steps.length - 1} onClick={() => props.onChange(moveFlightStep(plan, step.id, 1))} aria-label={`Move ${step.label} down`}><ChevronDown size={13} /></button><button disabled={step.status !== 'queued' || !canExecute} onClick={() => props.onExecute(step)} aria-label={`Execute ${step.label}`}><Play size={13} /></button><button disabled={step.status !== 'queued'} onClick={() => props.onChange(removeFlightStep(plan, step.id))} aria-label={`Remove ${step.label}`}><Trash2 size={13} /></button></div></li>)}</ol>
    {plan.steps.length === 0 && <div className="director-empty">No maneuver steps queued. Compose an impulse, circularization, transfer, or velocity match.</div>}
    <div className="director-execute"><button className="action-btn azure director-primary-action" disabled={!canExecute} onClick={props.onExecuteNext}><Play size={14} /> EXECUTE NEXT</button><span>Replay: {summary.complete} complete / {summary.rejected} rejected</span></div>
    <section className="director-ghost-preview" aria-label="Ghost flight path preview"><div><strong>GHOST FLIGHT PATH</strong><span>Apply the queued plan to an isolated clone, then forecast it through the existing physics worker. Live bodies are untouched.</span></div><button className="director-primary-action" disabled={!canExecute || props.preview?.status === 'running'} onClick={props.onPreview}>{props.preview?.status === 'running' ? 'FORECASTING…' : 'PREVIEW PLAN PATH'}</button>{props.preview && <div className={`director-preview-result ${props.preview.status}`} role="status"><span>{props.preview.status.toUpperCase()}</span><span>{props.preview.applied} applied · {props.preview.rejected} rejected</span>{props.preview.status === 'ready' && <span>{props.preview.points} points · T+{Math.round(props.preview.horizonSec)}s ghost horizon</span>}<button onClick={props.onClearPreview}>CLEAR GHOST</button></div>}</section>
    {pendingDisclosure}
    <details className="director-section" open={preferences.sections.library} onToggle={(event) => updateSection('library', event.currentTarget.open)}><summary>LOCAL PLAN LIBRARY ({savedPlans.length})</summary><div className="director-add-row"><input value={libraryName} maxLength={MAX_FLIGHT_PLAN_TITLE_LENGTH} onChange={(event) => setLibraryName(event.target.value)} placeholder={plan.title} aria-label="Saved plan name" /><button onClick={() => props.onSavePlan(libraryName || plan.title)}>SAVE</button><button onClick={props.onDuplicate}>DUPLICATE</button></div>{savedPlans.length === 0 && <p className="director-empty">No saved flight plans yet.</p>}{savedPlans.map((entry) => <div className="director-library-entry" key={entry.id}><span>{entry.name}</span><button onClick={() => props.onLoadSaved(entry.id)}>LOAD</button><button onClick={() => props.onDeleteSaved(entry.id)}>DELETE</button></div>)}</details>
    <details className="director-section" open={preferences.sections.handoff} onToggle={(event) => updateSection('handoff', event.currentTarget.open)}><summary><Clipboard size={13} /> OFFLINE HANDOFF</summary><textarea ref={handoffRef} value={handoff || handoffCode} onChange={(event) => setHandoff(event.target.value)} aria-label="Flight plan handoff code" /><div><button onClick={copyHandoff}><Copy size={12} /> COPY</button><button onClick={() => props.onExport(handoffCode)}><Download size={12} /> SAVE CODE</button><button disabled={!handoff.trim()} onClick={() => props.onImport(handoff.trim())}><Upload size={12} /> LOAD CODE</button></div></details>
    <details className="director-section" open={preferences.sections.exports} onToggle={(event) => updateSection('exports', event.currentTarget.open)}><summary>EXPORT &amp; SHARE</summary><div><button onClick={() => props.onExportArtifact('json')}>PLAN JSON</button><button onClick={() => props.onExportArtifact('csv')}>REPLAY CSV</button><button onClick={() => props.onExportArtifact('report')}>PREFLIGHT</button><button onClick={() => props.onShare(handoffCode)}>COPY SHARE URL</button></div></details>
    <details className="director-section" open={preferences.sections.viewpoints} onToggle={(event) => updateSection('viewpoints', event.currentTarget.open)}><summary>VIEWPOINTS &amp; SESSION — {viewpointCount} SAVED</summary><div><button onClick={props.onCaptureViewpoint}>CAPTURE VIEW</button><button disabled={!viewpointCount} onClick={() => props.onCycleViewpoint(-1)}>PREVIOUS</button><button disabled={!viewpointCount} onClick={() => props.onCycleViewpoint(1)}>NEXT</button></div><textarea value={capsule} onChange={(event) => setCapsule(event.target.value)} placeholder="Portable session capsule" aria-label="Flight session capsule" /><div><button onClick={() => setCapsule(props.onExportCapsule())}>CREATE CAPSULE</button><button disabled={!capsule.trim()} onClick={() => props.onImportCapsule(capsule.trim())}>IMPORT CAPSULE</button></div></details>
    <details className="director-section" open={preferences.sections.replay} onToggle={(event) => updateSection('replay', event.currentTarget.open)}><summary>REPLAY HISTORY ({planReplay.length})</summary>{planReplay.length === 0 && <p className="director-empty">No replay entries for this plan yet.</p>}{planReplay.map((entry) => <div className="director-replay-entry" key={`${entry.stepId}-${entry.atSec}-${entry.result}`}><time>T+{entry.atSec.toFixed(1)}s</time><strong>{entry.result.toUpperCase()}</strong><span>{entry.label} — {entry.detail}</span></div>)}<button disabled={planReplay.length === 0} onClick={props.onClearReplay}>CLEAR REPLAY</button></details>
    <footer><button onClick={() => props.onChange(clearCompletedFlightSteps(plan))}><RotateCcw size={12} /> CLEAR COMPLETED</button><button onClick={() => props.onChange(clearSkippedFlightSteps(plan))}><RotateCcw size={12} /> CLEAR SKIPPED</button><button onClick={props.onClose}>MINIMIZE</button></footer>
  </aside>;
}
