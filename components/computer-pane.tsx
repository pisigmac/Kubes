type TreeNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: TreeNode[];
};

export type ComputerSnapshot = {
  trees: { slug: string; label: string; entries: TreeNode[] }[];
  commands: { at: string; command: string; exitCode: number | null }[];
  screenshot: boolean;
  seat: string | null;
};

export function ComputerPane({
  cubeId,
  snapshot,
  revision,
  onClose,
}: {
  cubeId: string;
  snapshot: ComputerSnapshot | null;
  revision: number;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-x-hidden border-white/10 bg-[#101012] lg:w-[340px] lg:border-l">
      <div className="flex items-center justify-between px-4 py-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-white/40 uppercase">Computer</p>
          <h2 className="mt-1 text-lg font-medium">{snapshot?.seat ? `${snapshot.seat} is using it` : "Idle"}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/5 hover:text-white"
        >
          Close
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {snapshot?.screenshot ? (
          // The shot changes without a new URL, so the revision busts the cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="The shared computer screen"
            src={`/api/computer/screenshot?t=${revision}`}
            className="w-full rounded-xl border border-white/10"
          />
        ) : (
          <p className="text-sm text-white/45">No page open yet.</p>
        )}
        <section>
          <p className="text-xs tracking-[0.16em] text-white/40 uppercase">Files</p>
          <div className="mt-2 flex flex-col gap-3">
            {(snapshot?.trees ?? []).map((tree) => (
              <div key={tree.slug}>
                <p className="text-sm text-white/70">{tree.label}</p>
                <FileTree cubeId={cubeId} owner={tree.slug} nodes={tree.entries} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className="text-xs tracking-[0.16em] text-white/40 uppercase">Terminal</p>
          <ul className="mt-2 flex flex-col gap-2">
            {(snapshot?.commands ?? []).map((command) => (
              <li key={`${command.at}-${command.command}`} className="font-mono text-xs text-white/70">
                <span className="text-white/40">{command.exitCode ?? "—"} </span>
                {command.command}
              </li>
            ))}
          </ul>
        </section>
        <p className="mt-auto text-xs text-white/35">One workspace computer. Not your computer.</p>
      </div>
    </aside>
  );
}

function FileTree({
  cubeId,
  owner,
  nodes,
}: {
  cubeId: string;
  owner: string;
  nodes: TreeNode[];
}) {
  if (nodes.length === 0) return <p className="text-xs text-white/35">Empty</p>;
  return (
    <ul className="mt-1 flex flex-col gap-1 pl-2 text-xs">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.kind === "file" ? (
            <a
              className="text-white/70 underline-offset-2 hover:underline"
              href={`/api/computer/download?cubeId=${encodeURIComponent(cubeId)}&cube=${encodeURIComponent(owner)}&path=${encodeURIComponent(node.path)}`}
            >
              {node.name}
            </a>
          ) : (
            <span className="text-white/45">{node.name}/</span>
          )}
          {node.children ? <FileTree cubeId={cubeId} owner={owner} nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}
