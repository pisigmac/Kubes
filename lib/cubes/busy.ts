const busy = new Set<string>();

export function isCubeBusy(cubeId: string): boolean {
  return busy.has(cubeId);
}

export function trackCube(cubeId: string): () => void {
  busy.add(cubeId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busy.delete(cubeId);
  };
}
