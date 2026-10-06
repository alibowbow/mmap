import type {
  AnalogBrush,
  InkObject,
  InkPoint,
  InkStroke,
  MindMapDocument,
} from "@/types/mindmap";
import { DEFAULT_APPEARANCE } from "./appearance";
import { branchGeometry, hashSeed, renderPoints } from "./ink";
import { deformStrokeAt } from "./inkCurveEditing";

/** A small original vector board. All strokes, labels and masks are editable;
 * stable IDs, seeds and dates keep its appearance reproducible after export.
 */
export function editingStudioDocument(): MindMapDocument {
  const strokes: InkStroke[] = [];
  const objects: InkObject[] = [];
  const order: string[] = [];
  let serial = 0;
  const nextId = (kind: string) => `editing-studio-${kind}-${serial++}`;
  const addStroke = (s: InkStroke) => {
    strokes.push(s);
    order.push(s.id);
    return s;
  };
  const addObject = (o: InkObject) => {
    objects.push(o);
    order.push(o.id);
    return o;
  };
  const point = (x: number, y: number, pressure = 0.86): InkPoint => ({
    x,
    y,
    pressure,
  });
  const line = (
    points: InkPoint[],
    brush: AnalogBrush,
    color: string,
    width: number,
    extra: Partial<InkStroke> = {},
  ) => {
    const id = nextId(brush);
    return addStroke({
      id,
      points,
      brush,
      color,
      width,
      seed: hashSeed(id),
      opacity: 1,
      texture: 0.65,
      taper: 0.9,
      materialStyle: "grain-v1",
      ...extra,
    });
  };
  const label = (
    text: string,
    x: number,
    y: number,
    fontSize = 20,
    color = "#46514b",
  ) =>
    addObject({
      id: nextId("label"),
      kind: "label",
      text,
      x,
      y,
      fontSize,
      color,
      width: Math.max(
        20,
        [...text].reduce((n, c) => n + (/[^\x00-\x7F]/.test(c) ? 1 : 0.55), 0) *
          fontSize,
      ),
      height: fontSize * 1.5,
      fill: false,
    });
  const branch = (
    a: InkPoint,
    b: InkPoint,
    color: string,
    width: number,
    curve: number,
    extra: Partial<InkStroke> = {},
  ) =>
    line([a, b], "branch", color, width, {
      branchStyle: "hand-v1",
      texture: 0.48,
      taper: 0.92,
      curve,
      ...extra,
    });
  const fork = (
    parent: InkStroke,
    sample: number,
    end: InkPoint,
    width: number,
    curve: number,
  ) => {
    const start = renderPoints(parent)[sample];
    const geometry = branchGeometry(parent);
    const i = geometry.points.findIndex(
      (p) => p.x === start.x && p.y === start.y,
    );
    const joinWidth = Math.max(
      0.1,
      (geometry.radii[Math.max(0, i)] ?? 2) * 1.7,
    );
    return branch(start, end, parent.color, width, curve, { joinWidth });
  };
  const sampleLine = (x: number, y: number, length: number, height: number) =>
    Array.from({ length: 41 }, (_, i) => {
      const t = i / 40;
      return point(
        x + length * t,
        y + Math.sin(t * Math.PI * 2) * height,
        0.48 + Math.sin(t * Math.PI) * 0.42,
      );
    });

  label("손끝으로 자라는 생각", 500, 38, 34, "#293e35");
  label(
    "가지에 붙이고, 곡선을 다듬고, 종이의 결을 느껴보세요",
    500,
    76,
    17,
    "#798278",
  );

  // Four main colours share a quiet centre; short labels sit above each branch.
  const green = branch(point(475, 214), point(250, 150), "#35755e", 34, 0.25);
  fork(green, 40, point(145, 103, 0.72), 15, 0.12);
  fork(green, 53, point(133, 199, 0.7), 14, -0.17);
  const coral = branch(point(522, 209), point(760, 142), "#ce7951", 34, -0.17);
  fork(coral, 44, point(878, 103, 0.72), 15, -0.15);
  fork(coral, 54, point(882, 201, 0.7), 14, 0.14);
  const blue = branch(point(477, 237), point(255, 316), "#527e9a", 32, -0.24);
  fork(blue, 40, point(144, 337, 0.72), 14, 0.05);
  fork(blue, 53, point(236, 378, 0.7), 13, -0.12);
  const plum = branch(point(522, 233), point(757, 313), "#92749e", 32, 0.21);
  fork(plum, 42, point(870, 341, 0.72), 14, -0.11);
  fork(plum, 51, point(749, 381, 0.7), 13, 0.12);

  addObject({
    id: nextId("centre"),
    kind: "stamp",
    shape: "circle",
    x: 500,
    y: 222,
    width: 155,
    height: 91,
    color: "#efe6cc",
    fill: true,
    fontSize: 20,
  });
  addObject({
    id: nextId("centre-ring"),
    kind: "stamp",
    shape: "circle",
    x: 500,
    y: 222,
    width: 155,
    height: 91,
    color: "#72816a",
    fill: false,
    fontSize: 20,
  });
  label("나의 하루", 500, 218, 26, "#344e40");
  label("작은 생각의 씨앗", 500, 242, 11, "#7a8472");
  label("배우기", 365, 125, 25, green.color);
  label("읽기", 154, 86, 18, green.color);
  label("기록", 142, 180, 18, green.color);
  label("만들기", 655, 120, 25, coral.color);
  label("그리기", 880, 86, 18, coral.color);
  label("실험", 880, 182, 18, coral.color);
  label("돌보기", 255, 287, 25, blue.color);
  label("산책", 151, 318, 18, blue.color);
  label("쉬기", 237, 358, 18, blue.color);
  label("나누기", 757, 284, 25, plum.color);
  label("이야기", 869, 320, 18, plum.color);
  label("함께", 795, 355, 18, plum.color);

  // A gentle pencil divider keeps the three small practice areas distinct.
  line([point(54, 416), point(948, 416)], "pencil", "#aeb4a2", 2, {
    texture: 0.85,
  });
  line([point(408, 450), point(408, 603)], "pencil", "#c3c7b7", 1.5);
  line([point(710, 450), point(710, 603)], "pencil", "#c3c7b7", 1.5);

  label("도구마다 다른 자국", 226, 454, 22, "#526453");
  label("색연필", 97, 499, 15, "#7a826a");
  line(sampleLine(145, 500, 230, 5), "pencil", "#648766", 14, {
    texture: 0.85,
  });
  label("마커", 98, 543, 15, "#9f714e");
  line(sampleLine(145, 544, 230, 4), "marker", "#d6a163", 22, {
    texture: 0.72,
  });
  label("붓", 99, 587, 15, "#7d6c91");
  line(sampleLine(145, 588, 230, 7), "brush", "#92749e", 22, {
    branchStyle: "hand-v1",
    taper: 0.85,
    texture: 0.7,
  });
  label("겹치면 더 깊어지는 색", 227, 627, 14, "#869080");

  label("곡선 다듬기", 557, 454, 22, "#526453");
  const beforeId = nextId("curve-before");
  const before: InkStroke = {
    id: beforeId,
    points: sampleLine(447, 562, 220, 0),
    color: "#b2b5a7",
    brush: "brush",
    width: 10,
    seed: hashSeed(beforeId),
    branchStyle: "hand-v1",
    materialStyle: "grain-v1",
    texture: 0.35,
    taper: 0.9,
  };
  addStroke(before);
  const afterId = nextId("curve-after");
  addStroke({
    ...deformStrokeAt(before, 0.5, { x: 557, y: 511 }),
    id: afterId,
    seed: hashSeed(afterId),
    color: "#35755e",
    width: 17,
  });
  label("전", 463, 582, 14, "#a0a694");
  label("후", 559, 490, 14, "#35755e");
  label("선택 → 곡선 다듬기", 558, 627, 14, "#869080");

  label("부분 지우기", 839, 454, 22, "#526453");
  line(sampleLine(751, 514, 179, 3), "marker", "#cc8055", 26);
  line(sampleLine(751, 572, 179, 3), "marker", "#cc8055", 26, {
    erasures: [
      {
        points: [
          { x: 840, y: 549 },
          { x: 840, y: 595 },
        ],
        radius: 10,
      },
    ],
  });
  label("지우기 전", 840, 494, 13, "#aa947c");
  label("일부만 지운 뒤", 840, 602, 13, "#aa947c");
  label("선의 결은 그대로", 840, 627, 14, "#869080");

  return {
    id: "analog-editing-studio",
    title: "손끝으로 자라는 생각 · 편집 연습",
    boardMode: "blank",
    nodes: [],
    edges: [],
    ink: {
      version: 4,
      strokes,
      objects,
      order,
      paper: { kind: "cream", texture: 0.4, seed: 1977 },
    },
    inkSettings: {
      color: "#35755e",
      width: 28,
      brush: "branch",
      branchStyle: "hand-v1",
      materialStyle: "grain-v1",
      taper: 0.92,
      texture: 0.6,
      curve: 0.22,
      connectBranches: true,
      eraserMode: "partial",
      labelOnBranch: true,
    },
    appearance: { ...DEFAULT_APPEARANCE, font: "jua", canvasBg: "none" },
    createdAt: "2026-10-06T13:30:00Z",
    updatedAt: "2026-10-06T13:30:00Z",
  };
}
