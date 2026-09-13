/**
 * Component smoke suite (BACK13, part 2).
 *
 * Server-renders every modal and HUD panel with minimal props. Catches
 * undefined imports, broken prop destructuring, and render-time crashes
 * without requiring a browser or WebGL context.
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG, EARTH_MASS_KG, KM_PER_AU } from '../simulation/units';
import { TopBar } from '../ui/TopBar';
import { ToolRail } from '../ui/ToolRail';
import { TimelineBar } from '../ui/TimelineBar';
import { ContextInspector } from '../ui/ContextInspector';
import { CanonLabModal } from '../ui/CanonLabModal';
import { CreateBodyModal } from '../ui/CreateBodyModal';
import { EventLedgerModal } from '../ui/EventLedgerModal';
import { BranchCompareModal } from '../ui/BranchCompareModal';
import { OrbitLoomConfirmModal } from '../ui/OrbitLoomConfirmModal';
import { BootSplash } from '../ui/BootSplash';
import { OnboardingOverlay } from '../ui/OnboardingOverlay';
import { ForkBranchModal } from '../ui/ForkBranchModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SystemNavigator } from '../ui/SystemNavigator';
import { SelectionChip } from '../ui/SelectionChip';
import { SettingsModal } from '../ui/SettingsModal';
import { SystemStatsModal } from '../ui/SystemStatsModal';
import { MissionsPanel } from '../ui/MissionsPanel';
import { ShortcutsModal } from '../ui/ShortcutsModal';
import { ChallengeTracker, CHALLENGE_DEFINITIONS } from '../simulation/challenges';
import { settingsStore } from '../core/settings';
import { BranchManager } from '../branching/branch-manager';

const noop = (): void => undefined;

function sampleBodies(): CelestialBody[] {
  return [
    {
      id: 'star-1',
      name: 'Sol Prime',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696000,
      luminosityW: 3.828e26,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#ffdd66',
      temperatureK: 5778,
    },
    {
      id: 'planet-1',
      name: 'Verdant',
      type: 'planet',
      classification: 'oceanic',
      massKg: EARTH_MASS_KG,
      radiusKm: 6371,
      position: { x: KM_PER_AU, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 29.78 },
      color: '#1b64b3',
      temperatureK: 288,
    },
  ];
}

describe('HUD chrome renders', () => {
  it('TopBar renders transport, presets, and status pills', () => {
    const html = renderToString(
      <TopBar
        projectName="Smoke Test"
        sigilSvg="<svg />"
        mode="SIMULATE"
        onSetMode={noop}
        scaleMode="readable"
        onToggleScaleMode={noop}
        collisionsEnabled
        onToggleCollisions={noop}
        audioEnabled
        onToggleAudio={noop}
        gravityGridVisible={false}
        onToggleGravityGrid={noop}
        hzVisible
        onToggleHz={noop}
        onExport={noop}
        onImport={noop}
        onLoadPreset={noop}
        undoDepth={2}
        onUndo={noop}
        autosaveStatus="saved"
        autosaveAtMs={Date.now()}
        fps={60}
        navigatorVisible
        onToggleNavigator={noop}
        missionsVisible={false}
        onToggleMissions={noop}
        missionsDone={1}
        missionsTotal={8}
        onOpenStats={noop}
        onOpenSettings={noop}
        onOpenHelp={noop}
      />
    );
    expect(html).toContain('Smoke Test');
    expect(html).toContain('60');
  });

  it('ToolRail renders all four tools with shortcut hints', () => {
    const html = renderToString(
      <ToolRail
        activeTool="select"
        onSelectTool={noop}
        showFuture
        onToggleShowFuture={noop}
        showSensitivity={false}
        onToggleShowSensitivity={noop}
        onOpenCreateModal={noop}
        onResetCamera={noop}
      />
    );
    expect(html).toContain('SELECT');
    expect(html).toContain('GRAB');
    expect(html).toContain('toolbar');
  });

  it('TimelineBar renders transport and branch controls', () => {
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
        eventCount={3}
      />
    );
    expect(html).toContain('T+');
  });

  it('SystemNavigator renders the body census', () => {
    const html = renderToString(
      <SystemNavigator
        bodies={sampleBodies()}
        selectedBodyId="planet-1"
        onSelectBody={noop}
        onFocusBody={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('Verdant');
    expect(html).toContain('Sol Prime');
  });

  it('SelectionChip renders selection quick actions', () => {
    const bodies = sampleBodies();
    const html = renderToString(
      <SelectionChip selected={bodies[1]} primary={bodies[0]} onFocus={noop} onGrab={noop} onDeselect={noop} />
    );
    expect(html).toContain('Verdant');
  });

  it('ContextInspector renders telemetry and maneuver controls', () => {
    const bodies = sampleBodies();
    const html = renderToString(
      <ContextInspector
        selectedBody={bodies[1]}
        allBodies={bodies}
        onUpdateBody={noop}
        onDeleteBody={noop}
        onFocusBody={noop}
        onStartGrabThrow={noop}
        onOpenCanonMacro={noop}
        onCloneBody={noop}
        onNudge={noop}
        onCircularize={noop}
        onMatchVelocity={noop}
      />
    );
    expect(html).toContain('Verdant');
    expect(html).toContain('288');
  });

  it('MissionsPanel renders challenge roster', () => {
    const tracker = new ChallengeTracker();
    try {
      const html = renderToString(
        <MissionsPanel definitions={CHALLENGE_DEFINITIONS} states={tracker.list()} onClose={noop} onReset={noop} />
      );
      expect(html).toContain('First Light');
    } finally {
      tracker.destroy();
    }
  });
});

describe('Modals render', () => {
  it('ShortcutsModal lists shortcut groups', () => {
    const html = renderToString(<ShortcutsModal onClose={noop} />);
    expect(html).toContain('Transport');
    expect(html).toContain('Space');
  });

  it('SettingsModal renders toggles and diagnostics export', () => {
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
    expect(html).toContain('Diagnostics');
    expect(html).toContain('Reduced motion');
  });

  it('SystemStatsModal aggregates census statistics', () => {
    const html = renderToString(
      <SystemStatsModal bodies={sampleBodies()} simTimeSec={3600} eventCount={5} onClose={noop} />
    );
    expect(html).toContain('Stability Score');
    expect(html).toContain('1 / 0');
  });

  it('CreateBodyModal renders the creation form', () => {
    const html = renderToString(
      <CreateBodyModal existingBodies={sampleBodies()} onSpawnBody={noop} onClose={noop} />
    );
    expect(html).toContain('New Planet');
  });

  it('CanonLabModal renders macro catalog', () => {
    const bodies = sampleBodies();
    const html = renderToString(
      <CanonLabModal
        selectedBody={bodies[1]}
        allBodies={bodies}
        onExecuteMacro={noop}
        onSpawnTemplateWorld={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('CANON');
  });

  it('EventLedgerModal renders empty state and filters', () => {
    const html = renderToString(<EventLedgerModal events={[]} onClose={noop} />);
    expect(html).toContain('Catastrophe');
  });

  it('BranchCompareModal renders single-branch guidance', () => {
    const stub = { compareBranches: () => null } as unknown as BranchManager;
    const html = renderToString(<BranchCompareModal branches={[]} branchManager={stub} onClose={noop} />);
    expect(html).toContain('Only one timeline exists');
  });

  it('OrbitLoomConfirmModal renders fit summary', () => {
    const bodies = sampleBodies();
    const html = renderToString(
      <OrbitLoomConfirmModal
        fittedOrbit={{
          primaryId: 'star-1',
          semiMajorAxisKm: KM_PER_AU,
          eccentricity: 0.01,
          periapsisKm: KM_PER_AU * 0.99,
          apoapsisKm: KM_PER_AU * 1.01,
          inclinationDeg: 0,
          periapsisAngleRad: 0,
          planeNormal: { x: 0, y: 1, z: 0 },
          periapsisPositionKm: { x: KM_PER_AU, y: 0, z: 0 },
          periapsisVelocityKmS: { x: 0, y: 0, z: 29.78 },
          periodSec: 31557600,
          isBound: true,
        }}
        primaryBody={bodies[0]}
        selectedBody={bodies[1]}
        allBodies={bodies}
        onApplyToBody={noop}
        onCreateRing={noop}
        onCancel={noop}
      />
    );
    expect(html).toContain('ORBIT LOOM');
  });

  it('ForkBranchModal and ConfirmDialog render', () => {
    expect(
      renderToString(
        <ForkBranchModal branches={[]} suggestedName="Alpha" onFork={noop} onClose={noop} />
      )
    ).toContain('Alpha');
    expect(
      renderToString(
        <ConfirmDialog title="Delete world?" message="This cannot be undone." onConfirm={noop} onCancel={noop} />
      )
    ).toContain('Delete world?');
  });

  it('BootSplash and OnboardingOverlay render', () => {
    expect(
      renderToString(
        <BootSplash stage="Igniting renderer…" progress={0.5} capabilities={null} onDownloadDiagnostics={noop} />
      )
    ).toContain('STARSILK');
    expect(renderToString(<OnboardingOverlay onComplete={noop} onSkip={noop} />)).toContain(
      'Sculpt star systems by hand'
    );
  });
});
