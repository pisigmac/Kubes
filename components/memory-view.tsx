"use client";

import { useState, useEffect } from "react";
import type { Memory, MemoryCategory } from "@/lib/memory/store";

interface MemoryViewProps {
  currentCubeSlug?: string;
  onClose?: () => void;
}

const CATEGORIES: { label: string; value: MemoryCategory | "all"; color: string }[] = [
  { label: "All Categories", value: "all", color: "bg-zinc-800 text-zinc-300 border-zinc-700" },
  { label: "Preferences", value: "preference", color: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" },
  { label: "Projects", value: "project", color: "bg-sky-950/60 text-sky-300 border-sky-800/60" },
  { label: "Facts", value: "fact", color: "bg-indigo-950/60 text-indigo-300 border-indigo-800/60" },
  { label: "Instructions", value: "instruction", color: "bg-amber-950/60 text-amber-300 border-amber-800/60" },
  { label: "General", value: "general", color: "bg-zinc-900 text-zinc-400 border-zinc-800" },
];

export function MemoryView({ currentCubeSlug, onClose }: MemoryViewProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | "all">("all");
  const [scope, setScope] = useState<"current" | "all">(currentCubeSlug ? "current" : "all");

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [formData, setFormData] = useState({
    cubeSlug: currentCubeSlug || "global",
    category: "general" as MemoryCategory,
    content: "",
    keywords: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        if (scope === "current" && currentCubeSlug) {
          params.set("cubeSlug", currentCubeSlug);
        }
        if (searchQuery.trim()) {
          params.set("q", searchQuery.trim());
        }
        if (selectedCategory !== "all") {
          params.set("category", selectedCategory);
        }

        const res = await fetch(`/api/memories?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load memories");
        const data = await res.json();
        if (!ignore) {
          setMemories(data.memories || []);
          setErrorMsg("");
        }
      } catch (err) {
        if (!ignore) {
          setErrorMsg(err instanceof Error ? err.message : "Error loading memories");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [currentCubeSlug, scope, searchQuery, selectedCategory]);

  const openCreateModal = () => {
    setEditingMemory(null);
    setFormData({
      cubeSlug: currentCubeSlug || "global",
      category: "general",
      content: "",
      keywords: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (mem: Memory) => {
    setEditingMemory(mem);
    setFormData({
      cubeSlug: mem.cubeSlug,
      category: mem.category,
      content: mem.content,
      keywords: mem.keywords,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this memory?")) return;
    try {
      const res = await fetch(`/api/memories?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete memory");
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.content.trim()) return;

    setIsSaving(true);
    try {
      if (editingMemory) {
        // Update
        const res = await fetch("/api/memories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingMemory.id,
            category: formData.category,
            content: formData.content,
            keywords: formData.keywords.split(/\s+/).filter(Boolean),
          }),
        });
        if (!res.ok) throw new Error("Failed to update memory");
        const data = await res.json();
        setMemories((prev) => prev.map((m) => (m.id === editingMemory.id ? data.memory : m)));
      } else {
        // Create
        const res = await fetch("/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cubeSlug: formData.cubeSlug,
            category: formData.category,
            content: formData.content,
            keywords: formData.keywords.split(/\s+/).filter(Boolean),
          }),
        });
        if (!res.ok) throw new Error("Failed to create memory");
        const data = await res.json();
        setMemories((prev) => [data.memory, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case "preference":
        return "bg-emerald-950/70 text-emerald-300 border-emerald-800/60";
      case "project":
        return "bg-sky-950/70 text-sky-300 border-sky-800/60";
      case "fact":
        return "bg-indigo-950/70 text-indigo-300 border-indigo-800/60";
      case "instruction":
        return "bg-amber-950/70 text-amber-300 border-amber-800/60";
      default:
        return "bg-zinc-800/80 text-zinc-300 border-zinc-700/60";
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 bg-zinc-900/90 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-lg">
            🧠
          </div>
          <div>
            <h2 className="font-semibold text-zinc-100 text-base">Agent Memory Store</h2>
            <p className="text-xs text-zinc-400">
              Persistent cross-thread knowledge, user preferences, and project facts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreateModal}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow flex items-center gap-1.5"
          >
            <span>+</span> Add Memory
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition text-sm"
              title="Close Memory Explorer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3 bg-zinc-900/40 border-b border-zinc-800/80 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-2.5 top-2 text-zinc-500 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search facts, instructions, keywords..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Scope Selector */}
          {currentCubeSlug && (
            <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-xs">
              <button
                onClick={() => setScope("current")}
                className={`px-2.5 py-1 rounded-md transition ${
                  scope === "current"
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                🤖 {currentCubeSlug}
              </button>
              <button
                onClick={() => setScope("all")}
                className={`px-2.5 py-1 rounded-md transition ${
                  scope === "all"
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                🌐 All / Global
              </button>
            </div>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-2.5 py-1 rounded-full border transition text-[11px] font-medium ${
                selectedCategory === cat.value
                  ? "bg-indigo-600 text-white border-indigo-500"
                  : cat.color
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Memory List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-500 text-xs gap-2">
            <span className="animate-spin text-lg">⏳</span>
            Loading memories...
          </div>
        ) : errorMsg ? (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {errorMsg}
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-6 border border-dashed border-zinc-800 rounded-xl">
            <div className="text-2xl mb-2">🧠</div>
            <p className="text-zinc-300 text-xs font-medium">No memories found</p>
            <p className="text-zinc-500 text-[11px] mt-1 max-w-sm">
              Agents automatically record key facts, preferences, and project context here during chat turns. You can also add memories manually.
            </p>
            <button
              onClick={openCreateModal}
              className="mt-3 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition"
            >
              + Add First Memory
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {memories.map((mem) => (
              <div
                key={mem.id}
                className="p-3.5 rounded-xl bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition flex flex-col gap-2 group"
              >
                {/* Card Top */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider ${getCategoryBadgeClass(
                        mem.category,
                      )}`}
                    >
                      {mem.category}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 text-[10px]">
                      {mem.cubeSlug === "global" ? "🌐 Global" : `🤖 ${mem.cubeSlug}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                    <span className="text-[10px] text-zinc-500 mr-2">
                      {new Date(mem.updatedAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => openEditModal(mem)}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition text-xs"
                      title="Edit memory"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(mem.id)}
                      className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition text-xs"
                      title="Delete memory"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Content */}
                <p className="text-zinc-200 text-xs leading-relaxed whitespace-pre-wrap">
                  {mem.content}
                </p>

                {/* Keywords Chips */}
                {mem.keywords && (
                  <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-zinc-800/40">
                    <span className="text-[10px] text-zinc-500">Keywords:</span>
                    {mem.keywords.split(" ").slice(0, 8).map((kw, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.2 rounded bg-zinc-800/80 text-zinc-400 text-[10px] font-mono"
                      >
                        #{kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Dialog for Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-zinc-100 text-sm">
                {editingMemory ? "Edit Memory" : "Add New Memory"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value as MemoryCategory })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="general">General</option>
                    <option value="preference">Preference</option>
                    <option value="project">Project Context</option>
                    <option value="fact">Fact / Knowledge</option>
                    <option value="instruction">Instruction</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Scope (Kube)</label>
                  <input
                    type="text"
                    value={formData.cubeSlug}
                    onChange={(e) => setFormData({ ...formData, cubeSlug: e.target.value })}
                    placeholder="global or cube slug"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">Memory Content</label>
                <textarea
                  required
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="e.g. Always write production code using pnpm and strict TypeScript..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500 placeholder-zinc-600 resize-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">
                  Additional Keywords (optional)
                </label>
                <input
                  type="text"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="space separated e.g. typescript pnpm rule"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : editingMemory ? "Update" : "Save Fact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
