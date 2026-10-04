"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/code-block";

export function MarkdownView({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`markdown-content leading-7 text-[15px] ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !String(children).includes("\n");
            if (isInline) {
              return (
                <code
                  className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[13px] text-[#e7ff3a]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock
                language={match ? match[1] : undefined}
                value={String(children).replace(/\n$/, "")}
                className={className}
                {...props}
              />
            );
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#e7ff3a] underline underline-offset-4 hover:opacity-80 transition-opacity"
                {...props}
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full border-collapse text-left text-sm">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="border-b border-white/10 bg-white/[0.04] text-white/80">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-white/5">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="transition-colors hover:bg-white/[0.02]">{children}</tr>;
          },
          th({ children }) {
            return <th className="px-3.5 py-2.5 font-medium">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3.5 py-2.5 text-white/70">{children}</td>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-2 border-[#e7ff3a]/60 pl-4 italic text-white/70">
                {children}
              </blockquote>
            );
          },
          ul({ children }) {
            return <ul className="my-2.5 list-disc pl-6 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2.5 list-decimal pl-6 space-y-1">{children}</ol>;
          },
          h1({ children }) {
            return <h1 className="mt-5 mb-2.5 text-xl font-semibold tracking-tight text-white">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mt-4 mb-2 text-lg font-medium tracking-tight text-white">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mt-3 mb-1.5 text-base font-medium text-white/90">{children}</h3>;
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
          },
          hr() {
            return <hr className="my-4 border-white/10" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
