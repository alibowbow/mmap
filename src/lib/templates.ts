import { createId } from "@/lib/id";
import { layoutRightTree } from "@/lib/layout";
import { buildEdgesFromNodes } from "@/lib/tree";
import { NODE_TYPE_CONFIG } from "@/lib/constants";
import type {
  ChecklistItem,
  Edge,
  MindMapNode,
  MindMapNodeStatus,
  MindMapNodeType,
  TemplateType,
} from "@/types/mindmap";

// A lightweight nested spec used to author templates ergonomically.
type Spec = {
  label: string;
  type?: MindMapNodeType;
  status?: MindMapNodeStatus;
  description?: string;
  tags?: string[];
  link?: string;
  color?: string;
  checklist?: string[];
  children?: Spec[];
};

function checklistFrom(items?: string[]): ChecklistItem[] | undefined {
  if (!items?.length) return undefined;
  return items.map((text) => ({ id: createId("c"), text, checked: false }));
}

// Flatten a nested spec into positioned nodes + edges.
function buildFromSpec(root: Spec): { nodes: MindMapNode[]; edges: Edge[] } {
  const nodes: MindMapNode[] = [];

  const walk = (spec: Spec, parentId: string | null, isRoot: boolean) => {
    const id = createId(isRoot ? "root" : "n");
    const type = spec.type ?? (isRoot ? "root" : "idea");
    nodes.push({
      id,
      type: "mindmap",
      position: { x: 0, y: 0 },
      data: {
        label: spec.label,
        description: spec.description,
        parentId,
        isRoot,
        type,
        status: spec.status ?? "none",
        color: spec.color ?? NODE_TYPE_CONFIG[type].color,
        tags: spec.tags,
        link: spec.link,
        checklist: checklistFrom(spec.checklist),
        collapsed: false,
      },
    });
    for (const child of spec.children ?? []) walk(child, id, false);
  };

  walk(root, null, true);
  const laidOut = layoutRightTree(nodes);
  return { nodes: laidOut, edges: buildEdgesFromNodes(laidOut) };
}

// ── Template specifications ──────────────────────────────────────────────────

const BLANK: Spec = {
  label: "중심 주제",
  type: "root",
};

const PROJECT_PLAN: Spec = {
  label: "프로젝트 기획",
  type: "root",
  children: [
    {
      label: "목표",
      type: "idea",
      children: [
        { label: "성공 지표 정의", type: "task", status: "todo" },
        { label: "핵심 가치 제안", type: "note" },
      ],
    },
    {
      label: "범위",
      type: "idea",
      children: [
        { label: "포함 사항", type: "note" },
        { label: "제외 사항", type: "warning" },
      ],
    },
    {
      label: "일정",
      type: "task",
      status: "doing",
      children: [
        { label: "마일스톤 1", type: "task", status: "doing" },
        { label: "마일스톤 2", type: "task", status: "todo" },
      ],
    },
    {
      label: "리스크",
      type: "warning",
      children: [{ label: "주요 리스크 식별", type: "question" }],
    },
    {
      label: "팀 & 역할",
      type: "note",
      children: [{ label: "담당자 배정", type: "task", status: "todo" }],
    },
  ],
};

const RESEARCH_MAP: Spec = {
  label: "리서치 맵",
  type: "root",
  children: [
    {
      label: "리서치 질문",
      type: "question",
      children: [
        { label: "핵심 가설", type: "idea" },
        { label: "하위 질문", type: "question" },
      ],
    },
    {
      label: "자료 출처",
      type: "link",
      children: [
        { label: "논문 / 보고서", type: "note" },
        { label: "인터뷰", type: "note" },
      ],
    },
    {
      label: "발견",
      type: "idea",
      children: [
        { label: "패턴", type: "note" },
        { label: "예외 사례", type: "warning" },
      ],
    },
    {
      label: "결론",
      type: "task",
      status: "todo",
      children: [{ label: "다음 단계", type: "task", status: "todo" }],
    },
  ],
};

const INVESTMENT_THESIS: Spec = {
  label: "투자 아이디어",
  type: "root",
  children: [
    {
      label: "핵심 아이디어",
      type: "idea",
      description: "한 문장으로 정리한 투자 논리",
      children: [
        { label: "왜 지금인가", type: "question" },
        { label: "차별화 요소", type: "note" },
      ],
    },
    {
      label: "시장 구조",
      type: "note",
      children: [
        { label: "시장 규모(TAM)", type: "note" },
        { label: "경쟁 구도", type: "warning" },
        { label: "고객 세그먼트", type: "idea" },
      ],
    },
    {
      label: "성장 동력",
      type: "idea",
      children: [
        { label: "매출 성장률", type: "note" },
        { label: "신규 제품/시장", type: "idea" },
      ],
    },
    {
      label: "리스크",
      type: "warning",
      children: [
        { label: "규제 리스크", type: "warning" },
        { label: "경쟁 심화", type: "warning" },
        { label: "실행 리스크", type: "question" },
      ],
    },
    {
      label: "밸류에이션",
      type: "task",
      status: "doing",
      children: [
        { label: "PER / PSR", type: "note" },
        { label: "DCF 시나리오", type: "task", status: "todo" },
      ],
    },
    {
      label: "차트 / 타이밍",
      type: "link",
      link: "https://www.tradingview.com",
      children: [
        { label: "지지/저항", type: "note" },
        { label: "진입 시나리오", type: "task", status: "todo" },
      ],
    },
    {
      label: "체크리스트",
      type: "task",
      status: "todo",
      checklist: [
        "비즈니스 모델 이해",
        "재무제표 확인",
        "경영진 평가",
        "밸류에이션 점검",
        "리스크 정리",
        "포지션 사이즈 결정",
      ],
    },
  ],
};

const STUDY_PLANNER: Spec = {
  label: "공부 계획",
  type: "root",
  children: [
    {
      label: "과목",
      type: "idea",
      children: [
        { label: "개념 정리", type: "note" },
        { label: "문제 풀이", type: "task", status: "doing" },
      ],
    },
    {
      label: "주간 목표",
      type: "task",
      status: "doing",
      checklist: ["월: 복습", "화: 새 챕터", "수: 문제풀이", "목: 정리", "금: 모의고사"],
    },
    {
      label: "복습 사이클",
      type: "note",
      children: [
        { label: "1일 후", type: "task", status: "todo" },
        { label: "7일 후", type: "task", status: "todo" },
        { label: "30일 후", type: "task", status: "todo" },
      ],
    },
    {
      label: "약점",
      type: "warning",
      children: [{ label: "취약 단원", type: "question" }],
    },
  ],
};

const MEETING_NOTES: Spec = {
  label: "회의 노트",
  type: "root",
  children: [
    {
      label: "안건",
      type: "idea",
      children: [
        { label: "안건 1", type: "note" },
        { label: "안건 2", type: "note" },
      ],
    },
    {
      label: "논의 내용",
      type: "note",
      children: [
        { label: "결정 사항", type: "task", status: "done" },
        { label: "이견 / 보류", type: "warning" },
      ],
    },
    {
      label: "액션 아이템",
      type: "task",
      status: "doing",
      checklist: ["담당자 지정", "기한 설정", "팔로업 일정"],
    },
    {
      label: "다음 회의",
      type: "link",
      children: [{ label: "준비 사항", type: "task", status: "todo" }],
    },
  ],
};

const PRODUCT_ROADMAP: Spec = {
  label: "제품 로드맵",
  type: "root",
  children: [
    {
      label: "Now",
      type: "task",
      status: "doing",
      children: [
        { label: "현재 스프린트", type: "task", status: "doing" },
        { label: "버그 수정", type: "warning" },
      ],
    },
    {
      label: "Next",
      type: "idea",
      children: [
        { label: "다음 분기 기능", type: "idea" },
        { label: "기술 부채", type: "warning" },
      ],
    },
    {
      label: "Later",
      type: "note",
      children: [
        { label: "비전 기능", type: "idea" },
        { label: "탐색 아이디어", type: "question" },
      ],
    },
    {
      label: "지표",
      type: "link",
      children: [{ label: "북극성 지표", type: "note" }],
    },
  ],
};

const PROBLEM_SOLVING: Spec = {
  label: "문제 해결",
  type: "root",
  children: [
    {
      label: "문제 정의",
      type: "question",
      children: [
        { label: "현재 상태", type: "note" },
        { label: "원하는 상태", type: "idea" },
      ],
    },
    {
      label: "원인 분석",
      type: "warning",
      children: [
        { label: "근본 원인", type: "warning" },
        { label: "기여 요인", type: "note" },
      ],
    },
    {
      label: "해결책 후보",
      type: "idea",
      children: [
        { label: "옵션 A", type: "idea" },
        { label: "옵션 B", type: "idea" },
        { label: "옵션 C", type: "idea" },
      ],
    },
    {
      label: "실행 계획",
      type: "task",
      status: "todo",
      checklist: ["우선순위 결정", "리소스 확보", "실행", "검증"],
    },
  ],
};

const SPECS: Record<TemplateType, Spec> = {
  blank: BLANK,
  "project-plan": PROJECT_PLAN,
  "research-map": RESEARCH_MAP,
  "investment-thesis": INVESTMENT_THESIS,
  "study-planner": STUDY_PLANNER,
  "meeting-notes": MEETING_NOTES,
  "product-roadmap": PRODUCT_ROADMAP,
  "problem-solving": PROBLEM_SOLVING,
};

export type TemplateMeta = {
  id: TemplateType;
  title: string;
  description: string;
  icon: string;
  accent: string;
};

export const TEMPLATES: TemplateMeta[] = [
  { id: "blank", title: "빈 문서", description: "중심 주제 하나로 시작", icon: "Square", accent: "slate" },
  { id: "project-plan", title: "프로젝트 기획", description: "목표·범위·일정·리스크", icon: "Rocket", accent: "indigo" },
  { id: "research-map", title: "리서치 맵", description: "질문·자료·발견·결론", icon: "Microscope", accent: "sky" },
  { id: "investment-thesis", title: "투자 논리", description: "시장·성장·리스크·밸류", icon: "TrendingUp", accent: "emerald" },
  { id: "study-planner", title: "공부 계획", description: "과목·목표·복습·약점", icon: "GraduationCap", accent: "violet" },
  { id: "meeting-notes", title: "회의 노트", description: "안건·논의·액션", icon: "Users", accent: "amber" },
  { id: "product-roadmap", title: "제품 로드맵", description: "Now·Next·Later·지표", icon: "Map", accent: "cyan" },
  { id: "problem-solving", title: "문제 해결", description: "정의·원인·해결·실행", icon: "Puzzle", accent: "rose" },
];

export function buildTemplate(type: TemplateType): {
  nodes: MindMapNode[];
  edges: Edge[];
} {
  return buildFromSpec(SPECS[type] ?? BLANK);
}

export function templateTitle(type: TemplateType): string {
  return TEMPLATES.find((t) => t.id === type)?.title ?? "새 마인드맵";
}
