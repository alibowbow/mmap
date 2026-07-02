// Keyboard helpers shared by the shortcut hook and command palette.

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

// True when the active element is a text input, so we don't hijack typing.
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

// Normalizes Cmd (mac) / Ctrl (others).
export function modPressed(e: KeyboardEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

export const SHORTCUT_GROUPS: {
  title: string;
  items: { keys: string[]; label: string }[];
}[] = [
  {
    title: "노드 편집",
    items: [
      { keys: ["Tab"], label: "자식 노드 추가" },
      { keys: ["Enter"], label: "형제 노드 추가" },
      { keys: ["Shift", "Enter"], label: "편집 중 줄바꿈" },
      { keys: ["Delete"], label: "선택 노드 삭제" },
      { keys: ["F2"], label: "선택 노드 제목 편집" },
      { keys: ["Mod", "D"], label: "하위 트리 복제" },
      { keys: ["Mod", "C"], label: "하위 트리 복사" },
      { keys: ["Mod", "V"], label: "선택 노드 아래 붙여넣기" },
    ],
  },
  {
    title: "탐색 & 명령",
    items: [
      { keys: ["Mod", "K"], label: "커맨드 팔레트" },
      { keys: ["Mod", "F"], label: "검색" },
      { keys: ["Mod", "S"], label: "저장" },
      { keys: ["↑", "↓", "←", "→"], label: "노드 간 이동" },
      { keys: ["Shift", "드래그"], label: "박스 다중 선택" },
      { keys: ["Space"], label: "캔버스 이동 모드" },
      { keys: ["Esc"], label: "선택 해제 / 닫기" },
    ],
  },
  {
    title: "히스토리",
    items: [
      { keys: ["Mod", "Z"], label: "실행 취소" },
      { keys: ["Mod", "Shift", "Z"], label: "다시 실행" },
    ],
  },
];
