const busyCubes = new Map<string, Map<string, number>>();

function organization(orgId?: string): string {
  return orgId?.trim() || "default";
}

export function isCubeBusy(cubeId: string, orgId?: string): boolean {
  return (busyCubes.get(organization(orgId))?.get(cubeId) ?? 0) > 0;
}

export function listBusyCubeIds(orgId?: string): string[] {
  return [...(busyCubes.get(organization(orgId)) ?? new Map()).keys()];
}

export function trackCube(cubeId: string, orgId?: string): () => void {
  const scopedOrg = organization(orgId);
  let organizationCubes = busyCubes.get(scopedOrg);
  if (!organizationCubes) {
    organizationCubes = new Map();
    busyCubes.set(scopedOrg, organizationCubes);
  }
  organizationCubes.set(cubeId, (organizationCubes.get(cubeId) ?? 0) + 1);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = organizationCubes?.get(cubeId) ?? 0;
    if (count <= 1) organizationCubes?.delete(cubeId);
    else organizationCubes?.set(cubeId, count - 1);
    if (organizationCubes?.size === 0) busyCubes.delete(scopedOrg);
  };
}
