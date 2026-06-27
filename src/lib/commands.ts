// Command palette command registry. Execution is handled in the store via
// executeCommand(commandId) so the same list powers desktop + mobile palettes.

export type CommandId =
  | "new-map"
  | "add-child"
  | "add-sibling"
  | "auto-layout"
  | "open-search"
  | "open-templates"
  | "toggle-theme"
  | "export-json"
  | "import-json"
  | "export-markdown"
  | "load-sample"
  | "presentation";

export type CommandDef = {
  id: CommandId;
  title: string;
  description: string;
  icon: string; // lucide icon name
  keywords: string[];
  shortcut?: string;
};

export const COMMANDS: CommandDef[] = [
  {
    id: "new-map",
    title: "새 마인드맵",
    description: "빈 문서를 만듭니다",
    icon: "FilePlus2",
    keywords: ["new", "document", "create", "새", "문서"],
  },
  {
    id: "add-child",
    title: "자식 노드 추가",
    description: "선택한 노드에 자식을 추가",
    icon: "CornerDownRight",
    keywords: ["child", "node", "자식", "추가"],
    shortcut: "Tab",
  },
  {
    id: "add-sibling",
    title: "형제 노드 추가",
    description: "선택한 노드 옆에 형제를 추가",
    icon: "Plus",
    keywords: ["sibling", "node", "형제", "추가"],
    shortcut: "Enter",
  },
  {
    id: "auto-layout",
    title: "자동 정렬",
    description: "현재 레이아웃으로 전체 정렬",
    icon: "LayoutGrid",
    keywords: ["layout", "arrange", "정렬", "자동"],
  },
  {
    id: "open-search",
    title: "검색 열기",
    description: "노드를 검색합니다",
    icon: "Search",
    keywords: ["search", "find", "검색"],
    shortcut: "Mod F",
  },
  {
    id: "open-templates",
    title: "템플릿 열기",
    description: "템플릿으로 새 문서 만들기",
    icon: "LayoutTemplate",
    keywords: ["template", "템플릿"],
  },
  {
    id: "toggle-theme",
    title: "테마 변경",
    description: "라이트 / 다크 전환",
    icon: "SunMoon",
    keywords: ["theme", "dark", "light", "테마"],
  },
  {
    id: "export-json",
    title: "JSON 내보내기",
    description: "현재 문서를 JSON으로 저장",
    icon: "FileJson",
    keywords: ["export", "json", "내보내기"],
  },
  {
    id: "import-json",
    title: "JSON 가져오기",
    description: "JSON 파일에서 문서 불러오기",
    icon: "Upload",
    keywords: ["import", "json", "가져오기"],
  },
  {
    id: "export-markdown",
    title: "Markdown 내보내기",
    description: "현재 문서를 Markdown으로 저장",
    icon: "FileText",
    keywords: ["export", "markdown", "md", "내보내기"],
  },
  {
    id: "load-sample",
    title: "샘플 맵 불러오기",
    description: "예제 마인드맵을 새 문서로 추가",
    icon: "Sparkles",
    keywords: ["sample", "example", "샘플", "예제"],
  },
  {
    id: "presentation",
    title: "프레젠테이션 모드",
    description: "발표용 전체 화면 모드",
    icon: "Presentation",
    keywords: ["present", "slideshow", "발표", "프레젠테이션"],
  },
];

export function filterCommands(query: string): CommandDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMMANDS;
  return COMMANDS.filter((c) => {
    const haystack = [c.title, c.description, ...c.keywords]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
