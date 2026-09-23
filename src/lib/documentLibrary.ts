import type { MindMapDocument } from "@/types/mindmap";

export type DocumentFilter = "all" | "pinned" | "unfinished";
export type DocumentSort = "recent" | "name" | "created";

export function taskProgress(document: MindMapDocument) {
  const tasks = document.nodes.filter(
    ({ data }) => data.type === "task" || (data.status && data.status !== "none")
  );
  const done = tasks.filter(({ data }) => data.status === "done").length;
  return { total: tasks.length, done, remaining: tasks.length - done };
}

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ko-KR");

export function queryDocuments(
  documents: MindMapDocument[], query: string, filter: DocumentFilter, sort: DocumentSort
) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return documents.flatMap((document) => {
    const progress = taskProgress(document);
    if (filter === "pinned" && !document.pinned) return [];
    if (filter === "unfinished" && !progress.remaining) return [];
    const fields = document.nodes.map(({ data }) => [
      data.label, data.description ?? "", ...(data.tags ?? []),
      ...(data.checklist ?? []).map((item) => item.text),
    ].join(" · "));
    const searchable = normalize([document.title, ...fields].join(" "));
    if (!words.every((word) => searchable.includes(word))) return [];
    const snippet = words.length
      ? fields.find((field) => words.some((word) => normalize(field).includes(word)))
      : undefined;
    return [{ document, progress, snippet }];
  }).sort(({ document: a }, { document: b }) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (sort === "name") return a.title.localeCompare(b.title, "ko", { numeric: true });
    const date = (d: MindMapDocument) => Date.parse(sort === "created" ? d.createdAt : d.updatedAt) || 0;
    return date(b) - date(a);
  });
}
