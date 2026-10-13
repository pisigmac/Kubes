import assert from "node:assert/strict";
import test from "node:test";

function extractArtifactInfo(inputPath: string, content: string) {
  const normalized = inputPath.trim().replace(/^(\.\/|\/)+/, "");
  const parts = normalized.split("/");
  const fileName = parts.pop() || "untitled";
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;

  let language = "text";
  if (extension === "py") language = "python";
  else if (extension === "ts" || extension === "tsx") language = "typescript";
  else if (extension === "js" || extension === "jsx") language = "javascript";
  else if (extension === "json") language = "json";
  else if (extension === "md" || extension === "markdown") language = "markdown";
  else if (extension === "sh" || extension === "bash") language = "bash";
  else if (extension === "html") language = "html";
  else if (extension === "css") language = "css";

  return {
    name: fileName,
    path: inputPath,
    content,
    language,
    isMarkdown: language === "markdown",
  };
}

test("extracts artifact metadata and language types from paths", () => {
  const pythonArtifact = extractArtifactInfo("scripts/scraper.py", "import requests\nprint('hello')");
  assert.equal(pythonArtifact.name, "scraper.py");
  assert.equal(pythonArtifact.language, "python");
  assert.equal(pythonArtifact.isMarkdown, false);

  const markdownArtifact = extractArtifactInfo("notes/applications.md", "# Job Applications\n- Company A");
  assert.equal(markdownArtifact.name, "applications.md");
  assert.equal(markdownArtifact.language, "markdown");
  assert.equal(markdownArtifact.isMarkdown, true);

  const jsonArtifact = extractArtifactInfo("data/config.json", '{"version": 1}');
  assert.equal(jsonArtifact.name, "config.json");
  assert.equal(jsonArtifact.language, "json");
});

test("handles nested and root-relative file paths properly", () => {
  const nested = extractArtifactInfo("/deeply/nested/folder/report.markdown", "# Report");
  assert.equal(nested.name, "report.markdown");
  assert.equal(nested.isMarkdown, true);

  const simple = extractArtifactInfo("todo.txt", "1. Buy milk");
  assert.equal(simple.name, "todo.txt");
  assert.equal(simple.language, "text");
});
