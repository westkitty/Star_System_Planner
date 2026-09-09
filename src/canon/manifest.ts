/**
 * Local Canon Manifest Accessor.
 * 
 * Provides typed, offline-ready access to bundled Starsilk machine records
 * without making external network requests at runtime.
 */

import canonData from './snapshot/canon-manifest.json';

export interface CanonLockSummary {
  lockId: string;
  description: string;
  scope: string;
  stableId: string | null;
}

export interface WorldsVaultNode {
  nodeId: string;
  label: string;
  nodeClass: string;
  identityStatus: string;
  sourceUrl: string;
  stableId?: string;
  unknowns?: string[];
}

export interface NamedTemplate {
  id: string;
  name: string;
  trait: string;
}

export const CANON_MANIFEST = {
  schemaVersion: canonData.schemaVersion,
  retrievedAt: canonData.retrievedAt,
  sourceBaseUrl: canonData.sourceBaseUrl,
  authorityNotice: canonData.authorityNotice,
  locks: canonData.locks as {
    bloodEclipseDurationYears: number;
    starsilkMaterialAzure: boolean;
    wordstreamerSpelling: string;
    singleTailTiger: boolean;
    prohibitions: string[];
    summary: CanonLockSummary[];
  },
  worldsvaultTopology: canonData.worldsvaultTopology as {
    nodeCount: number;
    edgeCount: number;
    nodes: WorldsVaultNode[];
    edges: any[];
    unknowns: string[];
  },
  entities: canonData.entities as {
    starsilkMaterial: {
      stableId: string;
      canonicalUrl: string;
      palette: string[];
      canonicalNature: string[];
      sourceRef: string;
    };
    cosmicArchitecture: {
      stableId: string;
      canonicalUrl: string;
      structures: { id: string; name: string; type: string; note: string }[];
      drakkenTheses: string[];
    };
    systems: {
      stableId: string;
      canonicalUrl: string;
      bloodRingsNote: string;
      hookshotNote: string;
    };
    worldsvaultTemplates: {
      stableId: string;
      canonicalUrl: string;
      namedTemplates: NamedTemplate[];
      unknownsNotice: string;
    };
  },
};

export function getCompendiumUrl(stableId?: string): string {
  if (!stableId) return CANON_MANIFEST.sourceBaseUrl;
  return `${CANON_MANIFEST.sourceBaseUrl}/entities/${stableId}/`;
}
