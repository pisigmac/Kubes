"use client";

import { useEffect, useRef, useState } from "react";

export interface ProviderItem {
  id: string;
  name: string;
  configured: boolean;
  baseURL: string;
  defaultModel: string;
  fallbackModels: string[];
}

export const BROWSER_PROVIDER_KEYS = "kubes.providerKeys";
export const BROWSER_ACTIVE_PROVIDER = "kubes.activeProvider";
export const BROWSER_PROVIDER_VERIFICATION = "kubes.providerVerification";
export const BROWSER_PROVIDER_UPDATED = "kubes.providerUpdated";

function readBrowserProviderKeys(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(BROWSER_PROVIDER_KEYS) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function readBrowserProviderVerification(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(BROWSER_PROVIDER_VERIFICATION) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function getBrowserProviderSelection(): { providerId?: string; providerKey?: string } {
  try {
    const providerId = window.localStorage.getItem(BROWSER_ACTIVE_PROVIDER) || undefined;
    const keys = readBrowserProviderKeys();
    const verification = readBrowserProviderVerification();
    return providerId && verification[providerId] && keys[providerId]
      ? { providerId, providerKey: keys[providerId] }
      : {};
  } catch {
    return {};
  }
}

export function ProviderModal({
  isOpen,
  onClose,
  onModelSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onModelSelect?: (model: string) => void;
}) {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    message: string;
  } | null>(null);
  const [customKey, setCustomKey] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string>("gemini");
  const keyInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onModelSelectRef = useRef(onModelSelect);

  useEffect(() => {
    onModelSelectRef.current = onModelSelect;
  });

  // Focus trapping and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Initial focus on close button or modal container
    requestAnimationFrame(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>("button, input");
      firstFocusable?.focus();
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let isCurrent = true;
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data: { providers?: ProviderItem[]; activeProvider?: string }) => {
        if (isCurrent && data.providers) {
          const browserKeys = readBrowserProviderKeys();
          setProviders(
            data.providers.map((provider) => ({
              ...provider,
              configured: provider.configured || Boolean(browserKeys[provider.id]),
            })),
          );
          const activeProvider = window.localStorage.getItem(BROWSER_ACTIVE_PROVIDER) || data.activeProvider;
          if (activeProvider) {
            setSelectedProvider(activeProvider);
            const activeProviderConfig = data.providers.find((provider) => provider.id === activeProvider);
            if (activeProviderConfig?.defaultModel) onModelSelectRef.current?.(activeProviderConfig.defaultModel);
          }
          setLoading(false);
          const activeKey = activeProvider ? browserKeys[activeProvider] : undefined;
          if (activeProvider && activeKey) {
            void fetch("/api/providers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "test", providerId: activeProvider, apiKey: activeKey }),
            })
              .then((res) => res.json() as Promise<{ ok?: boolean; models?: string[] }>)
              .then((result) => {
                if (!isCurrent || !result.ok || !result.models?.length) return;
                setProviders((current) =>
                  current.map((provider) =>
                    provider.id === activeProvider
                      ? { ...provider, configured: true, fallbackModels: result.models ?? provider.fallbackModels }
                      : provider,
                  ),
                );
              })
              .catch(() => undefined);
          }
          setCustomKey(activeProvider && activeKey ? activeKey : "");
        }
      })
      .catch((err) => {
        if (isCurrent) {
          console.error("Failed to load providers", err);
          setLoading(false);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [isOpen]);

  async function handleActivate(providerId: string) {
    const browserKey = readBrowserProviderKeys()[providerId];
    const effectiveKey = browserKey || undefined;
    try {
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate",
          providerId,
          apiKey: effectiveKey,
        }),
      });
      window.localStorage.setItem(BROWSER_ACTIVE_PROVIDER, providerId);
      window.dispatchEvent(new Event(BROWSER_PROVIDER_UPDATED));
      setSelectedProvider(providerId);
      const provider = providers.find((item) => item.id === providerId);
      if (provider?.defaultModel) onModelSelectRef.current?.(provider.defaultModel);
    } catch (err) {
      console.error("Failed to activate provider", err);
    }
  }

  async function handleTest(providerId: string, apiKey?: string) {
    setTestingId(providerId);
    setTestResult(null);
    try {
      const browserKey = readBrowserProviderKeys()[providerId];
      const effectiveKey = apiKey?.trim() || customKey.trim() || browserKey || undefined;
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          providerId,
          apiKey: effectiveKey,
        }),
      });
      const text = await res.text().catch(() => "");
      let body: { ok: boolean; message?: string; error?: string; models?: string[] };
      try {
        body = text ? JSON.parse(text) : { ok: false, error: "Empty response from server" };
      } catch {
        setTestResult({
          id: providerId,
          ok: false,
          message: `Server returned HTTP ${res.status}${text ? `: ${text.slice(0, 100)}` : " (empty response)"}`,
        });
        return;
      }
      setTestResult({
        id: providerId,
        ok: body.ok,
        message:
          body.ok && effectiveKey
            ? `${body.message ?? "Connected!"} Saved in this browser.`
            : body.ok
              ? (body.message ?? "Connected!")
              : (body.error ?? "Connection failed"),
      });
      if (body.ok && effectiveKey) {
        const keys = readBrowserProviderKeys();
        keys[providerId] = effectiveKey;
        window.localStorage.setItem(BROWSER_PROVIDER_KEYS, JSON.stringify(keys));
        window.localStorage.setItem(BROWSER_ACTIVE_PROVIDER, providerId);
        const verification = readBrowserProviderVerification();
        verification[providerId] = true;
        window.localStorage.setItem(BROWSER_PROVIDER_VERIFICATION, JSON.stringify(verification));
        window.dispatchEvent(new Event(BROWSER_PROVIDER_UPDATED));
        setCustomKey(effectiveKey);
        const provider = providers.find((item) => item.id === providerId);
        if (provider?.defaultModel) onModelSelectRef.current?.(provider.defaultModel);

        void fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "activate",
            providerId,
            apiKey: effectiveKey,
          }),
        }).catch((e) => console.warn("Failed to activate provider on server:", e));
      }
      if (body.ok && body.models?.length) {
        setProviders((current) =>
          current.map((provider) =>
            provider.id === providerId ? { ...provider, configured: true, fallbackModels: body.models ?? provider.fallbackModels } : provider,
          ),
        );
      }
    } catch (err) {
      setTestResult({
        id: providerId,
        ok: false,
        message: err instanceof Error ? err.message : "Network error testing provider",
      });
    } finally {
      setTestingId(null);
    }
  }

  function configureProvider(providerId: string) {
    setSelectedProvider(providerId);
    window.localStorage.setItem(BROWSER_ACTIVE_PROVIDER, providerId);
    setCustomKey(readBrowserProviderKeys()[providerId] || "");
    const provider = providers.find((item) => item.id === providerId);
    if (provider?.defaultModel) onModelSelectRef.current?.(provider.defaultModel);
    requestAnimationFrame(() => {
      keyInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      keyInputRef.current?.focus();
    });
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="provider-modal-title"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#0c0c0e] shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔑</span>
            <div>
              <h2 id="provider-modal-title" className="text-base font-semibold text-white">
                AI Provider & KeyMint Gateway
              </h2>
              <p className="text-xs text-white/50">
                Multi-provider routing with free tier auto-discovery and zero-trust proxy
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close provider modal"
            className="rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Free Tier Banner */}
          <div className="rounded-xl border border-[#e7ff3a]/20 bg-[#e7ff3a]/5 p-4 text-xs space-y-2">
            <p className="font-semibold text-[#e7ff3a] flex items-center gap-1.5">
              <span>✨</span> 100% Free Providers Available
            </p>
            <p className="text-white/80 leading-relaxed">
              If your xAI subscription expired, you can switch instantly to <strong>Google Gemini (Free)</strong> or{" "}
              <strong>Groq Cloud (Free)</strong> with generous rate limits.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] text-white hover:bg-white/10 transition"
              >
                <span>↗</span> Get Free Gemini API Key
              </a>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] text-white hover:bg-white/10 transition"
              >
                <span>↗</span> Get Free Groq API Key
              </a>
            </div>
          </div>

          {/* Providers List */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Configured Providers
            </h3>

            {loading ? (
              <p className="text-xs text-white/40 animate-pulse">Loading providers...</p>
            ) : (
              <div className="space-y-2.5">
                {providers.map((p) => {
                  const isTesting = testingId === p.id;
                  const result = testResult?.id === p.id ? testResult : null;

                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border p-3.5 transition ${
                        p.configured
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{p.name}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
                                p.configured
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-white/10 text-white/40"
                              }`}
                            >
                              {p.configured ? "● Active" : "○ Not Configured"}
                            </span>
                          </div>
                          <p className="font-mono text-[11px] text-white/40 truncate max-w-sm">
                            {p.baseURL}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {p.configured && selectedProvider === p.id ? (
                            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                              ✓ Active
                            </span>
                          ) : p.configured ? (
                            <button
                              type="button"
                              onClick={() => void handleActivate(p.id)}
                              className="rounded-full border border-[#e7ff3a]/40 bg-[#e7ff3a]/10 px-2.5 py-1 text-[11px] font-medium text-[#e7ff3a] hover:bg-[#e7ff3a]/20 transition"
                            >
                              Activate
                            </button>
                          ) : null}

                          {p.configured ? (
                            <button
                              type="button"
                              onClick={() => void handleTest(p.id)}
                              disabled={isTesting}
                              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white hover:bg-white/10 transition disabled:opacity-50"
                            >
                              {isTesting ? "Testing..." : "Test"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => configureProvider(p.id)}
                              className="rounded-full border border-[#e7ff3a]/30 bg-[#e7ff3a]/10 px-3 py-1 text-xs text-[#e7ff3a] hover:bg-[#e7ff3a]/20 transition"
                            >
                              Configure
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Test feedback */}
                      {result ? (
                        <div
                          className={`mt-2 rounded-lg p-2 text-xs font-mono ${
                            result.ok
                              ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40"
                              : "bg-red-950/60 text-red-300 border border-red-800/40"
                          }`}
                        >
                          {result.ok ? "✓ " : "✗ "} {result.message}
                        </div>
                      ) : null}

                      {/* Fallback models badges */}
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {p.fallbackModels.slice(0, 3).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => onModelSelect?.(m)}
                            className="rounded-full border border-white/5 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-white/60 hover:text-white hover:border-white/20 transition"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick API Key Tester & Guide */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Configure {providers.find((p) => p.id === selectedProvider)?.name ?? "Provider"}
            </h3>
            <div className="flex gap-2">
              <select
                id="provider-select"
                name="provider"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0c0c0e] px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-[#e7ff3a]"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                ref={keyInputRef}
                id="provider-api-key"
                name="providerApiKey"
                type="password"
                autoComplete="off"
                placeholder={`Paste ${providers.find((p) => p.id === selectedProvider)?.name ?? "provider"} API key...`}
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-[#0c0c0e] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#e7ff3a]"
              />
              <button
                type="button"
                onClick={() => void handleTest(selectedProvider, customKey)}
                disabled={testingId !== null || !customKey.trim()}
                className="rounded-lg bg-[#e7ff3a] px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#e7ff3a]/90 transition disabled:opacity-40"
              >
                {testingId === selectedProvider ? "Verifying..." : "Verify Key"}
              </button>
            </div>
            <p className="text-[11px] text-white/40">
              Verified keys are stored only in this browser and used for this app session. They are not written to the server or <code>.env.local</code>.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 bg-[#070708]">
          <span className="text-[11px] text-white/40">
            Powered by KeyMint & KubeRoute Multi-Provider Protocol
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
