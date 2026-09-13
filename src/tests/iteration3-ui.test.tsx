/**
 * Iteration 3 UI suite: server-render the new panels, pills, dialogs, and
 * progression surfaces with minimal props. No browser or WebGL required.
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG, EARTH_MASS_KG, KM_PER_AU } from '../simulation/units';
import { TimelineBar } from '../ui/TimelineBar';
import { SelectionChip } from '../ui/SelectionChip';
import { MissionsPanel } from '../ui/MissionsPanel';
import { SettingsModal } from '../ui/SettingsModal';
import { SystemStatsModal } from '../ui/SystemStatsModal';
import { ImportDiagnosticsDialog } from '../ui/ImportDiagnosticsDialog';
import { PanelErrorBoundary } from '../ui/PanelErrorBoundary';
import { ChallengeTracker, CHALLENGE_DEFINITIONS } from '../simulation/challenges';
import { DiscoveryCodex } from '../simulation/discovery-codex';
import { computeArchitectScore } from '../simulation/architect-score';
import { settingsStore } from '../core/settings';

const noop = (): void => undefined;

function sampleBodies(): CelestialBody[] {
  return [
    {
      id: 'star-1',
      name: 'Sol Prime',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696000,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#ffdd66',
    },
    {
      id: 'planet-1',
      name: 'Verdant',
      type: 'planet',
      massKg: EARTH_MASS_KG,
      radiusKm: 6371,
      position: { x: KM_PER_AU, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 29.78 },
      color: '#1b64b3',
    },
  ];
}

describe('UI08 camera pill', () => {
  it('renders the free-camera pill by default', () => {
    const html = renderToString(
      <TimelineBar
        timeSec={86400}
        timeScale={100}
        isPaused={false}
        onTogglePause={noop}
        onSetTimeScale={noop}
        onStepOnce={noop}
        followEnabled={false}
        onToggleFollow={noop}
        topDownEnabled={false}
        onToggleTopDown={noop}
        branches={[]}
        activeBranchId="prime"
        onSwitchBranch={noop}
        onForkBranch={noop}
        onOpenLedger={noop}
        onOpenBranchCompare={noop}
        eventCount={0}
      />
    );
    expect(html).toContain('camera-pill');
  });

  it('names the follow target when locked', () => {
    const html = renderToString(
      <TimelineBar
        timeSec={86400}
        timeScale={100}
        isPaused={false}
        onTogglePause={noop}
        onSetTimeScale={noop}
        onStepOnce={noop}
        followEnabled
        onToggleFollow={noop}
        topDownEnabled={false}
        onToggleTopDown={noop}
        branches={[]}
        activeBranchId="prime"
        onSwitchBranch={noop}
        onForkBranch={noop}
        onOpenLedger={noop}
        onOpenBranchCompare={noop}
        eventCount={0}
        cameraMode="follow"
        cameraTargetName="Verdant"
        onExitCameraMode={noop}
      />
    );
    expect(html).toContain('FOLLOW');
    expect(html).toContain('Verdant');
  });
});

describe('UI07 selection history', () => {
  it('renders back/forward traversal with edge states', () => {
    const bodies = sampleBodies();
    const html = renderToString(
      <SelectionChip
        selected={bodies[1]}
        primary={bodies[0]}
        onFocus={noop}
        onGrab={noop}
        onDeselect={noop}
        bookmarked={false}
        onToggleBookmark={noop}
        onBack={noop}
        onForward={noop}
        canBack={false}
        canForward
      />
    );
    expect(html).toContain('Previous selection');
    expect(html).toContain('Next selection');
    expect(html).toContain('disabled');
  });
});

describe('UI04/UI06 missions, debrief, and codex', () => {
  it('renders tiers, debrief, and codex shelf', () => {
    const tracker = new ChallengeTracker();
    const codex = new DiscoveryCodex();
    codex.record('eclipse', 'Eclipse over Verdant');
    codex.record('eclipse', 'Eclipse over Sol Prime');
    try {
      const html = renderToString(
        <MissionsPanel
          definitions={CHALLENGE_DEFINITIONS}
          states={tracker.list()}
          onClose={noop}
          onReset={noop}
          debrief={{ best: { deltaVKmS: 2.5, label: 'Voyager @ Verdant' }, recent: [], onReset: noop }}
          codex={{ entries: codex.list(), onReset: noop }}
        />
      );
      expect(html).toContain('Initiate');
      expect(html).toContain('Tier order');
      expect(html).toContain('Slingshot debrief');
      expect(html).toContain('2.50');
      expect(html).toContain('Voyager @ Verdant');
      expect(html).toContain('Discovery codex');
      expect(html).toContain('Eclipses');
      expect(html).toContain('codex-count');
    } finally {
      tracker.destroy();
    }
  });
});

describe('UI06/UI10 settings density and filter', () => {
  it('renders the density switch and quick filter', () => {
    const html = renderToString(
      <SettingsModal
        settings={settingsStore.get()}
        onUpdate={noop}
        onReset={noop}
        onReplayTour={noop}
        onExportDiagnostics={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('HUD density');
    expect(html).toContain('Compact');
    expect(html).toContain('Filter settings');
  });
});

describe('GAME14 architect band', () => {
  it('renders the score band inside system statistics', () => {
    const architect = computeArchitectScore({
      missionsDone: 18,
      missionsTotal: 18,
      contractsDone: 6,
      contractsTotal: 6,
      codexKinds: 6,
      codexSightings: 24,
      stabilityScore: 100,
    });
    const html = renderToString(
      <SystemStatsModal bodies={sampleBodies()} simTimeSec={3600} eventCount={5} onClose={noop} architect={architect} />
    );
    expect(html).toContain('Grand Architect');
    expect(html).toContain('100');
  });
});

describe('UI14 import diagnostics', () => {
  it('lists issues and migration notes per file', () => {
    const html = renderToString(
      <ImportDiagnosticsDialog
        fileName="broken.json"
        issues={[{ path: 'bodies[2].massKg', message: 'Must be a positive number.' }]}
        migrationNotes={['Migrated 1.0.0 → 1.1.0.']}
        onClose={noop}
      />
    );
    expect(html).toContain('broken.json');
    expect(html).toContain('bodies[2].massKg');
    expect(html).toContain('1.1.0');
  });
});

describe('BACK11 panel error boundary', () => {
  it('passes children through and derives error state', () => {
    const html = renderToString(
      <PanelErrorBoundary panel="Missions">
        <div>mission content</div>
      </PanelErrorBoundary>
    );
    expect(html).toContain('mission content');
    expect(PanelErrorBoundary.getDerivedStateFromError(new Error('boom'))).toEqual({ error: expect.any(Error) });
  });
});
