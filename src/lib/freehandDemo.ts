import type { InkStroke, InkPoint, AnalogBrush } from "@/types/mindmap";
import { hashSeed, seeded } from "./ink";

// Original single-line lettering and doodles expressed entirely as freehand
// trajectories. No nodes, font outlines, converted branches or image assets.
const glyphs: Record<string, number[][]> = {
  A: [
    [0, 10, 3.5, 0, 7, 10],
    [1.3, 6, 5.8, 6],
  ],
  B: [
    [0, 10, 0, 0, 4, 0, 6, 1, 6, 3, 4, 5, 0, 5],
    [4, 5, 6, 6, 6, 9, 4, 10, 0, 10],
  ],
  C: [[7, 1, 5, 0, 2, 0, 0, 2, 0, 8, 2, 10, 5, 10, 7, 9]],
  D: [[0, 10, 0, 0, 3, 0, 6, 2, 7, 5, 6, 8, 3, 10, 0, 10]],
  E: [
    [7, 0, 0, 0, 0, 10, 7, 10],
    [0, 5, 5.5, 5],
  ],
  F: [
    [7, 0, 0, 0, 0, 10],
    [0, 5, 5.5, 5],
  ],
  G: [[7, 1, 5, 0, 2, 0, 0, 2, 0, 8, 2, 10, 5, 10, 7, 8, 7, 5, 4, 5]],
  H: [
    [0, 0, 0, 10],
    [7, 0, 7, 10],
    [0, 5, 7, 5],
  ],
  I: [
    [1, 0, 6, 0],
    [3.5, 0, 3.5, 10],
    [1, 10, 6, 10],
  ],
  J: [[7, 0, 7, 8, 5, 10, 2, 10, 0, 8]],
  K: [
    [0, 0, 0, 10],
    [7, 0, 0, 5, 7, 10],
  ],
  L: [[0, 0, 0, 10, 7, 10]],
  M: [[0, 10, 0, 0, 3.5, 5, 7, 0, 7, 10]],
  N: [[0, 10, 0, 0, 7, 10, 7, 0]],
  O: [[3, 0, 1, 1, 0, 4, 0, 7, 2, 10, 5, 10, 7, 8, 7, 3, 5, 0, 3, 0]],
  P: [[0, 10, 0, 0, 5, 0, 7, 2, 7, 4, 5, 5, 0, 5]],
  Q: [
    [3, 0, 1, 1, 0, 4, 0, 7, 2, 10, 5, 10, 7, 8, 7, 3, 5, 0, 3, 0],
    [4, 7, 8, 11],
  ],
  R: [
    [0, 10, 0, 0, 5, 0, 7, 2, 7, 4, 5, 5, 0, 5],
    [3, 5, 7, 10],
  ],
  S: [[7, 1, 5, 0, 2, 0, 0, 2, 1, 4, 6, 6, 7, 8, 5, 10, 2, 10, 0, 9]],
  T: [
    [0, 0, 7, 0],
    [3.5, 0, 3.5, 10],
  ],
  U: [[0, 0, 0, 8, 2, 10, 5, 10, 7, 8, 7, 0]],
  V: [[0, 0, 3.5, 10, 7, 0]],
  W: [[0, 0, 1, 10, 3.5, 5, 6, 10, 7, 0]],
  X: [
    [0, 0, 7, 10],
    [7, 0, 0, 10],
  ],
  Y: [
    [0, 0, 3.5, 5, 7, 0],
    [3.5, 5, 3.5, 10],
  ],
  Z: [[0, 0, 7, 0, 0, 10, 7, 10]],
};
export function freehandGarden(): InkStroke[] {
  const strokes: InkStroke[] = [];
  const point = (x: number, y: number): InkPoint => ({ x, y, pressure: 1 });
  const add = (
    ps: InkPoint[],
    color: string,
    width: number,
    brush: AnalogBrush = "pen",
    opacity = 1,
  ) => {
    const id = "garden-ink-" + strokes.length;
    strokes.push({
      id,
      points: ps,
      color,
      width,
      brush,
      seed: hashSeed(id),
      opacity,
      texture: 0.8,
      taper: 0.72,
    });
  };
  const poly = (
    coords: number[],
    x: number,
    y: number,
    scale: number,
    color: string,
    width: number,
    brush: AnalogBrush = "pen",
    opacity = 1,
  ) =>
    add(
      Array.from({ length: coords.length / 2 }, (_, i) =>
        point(x + coords[i * 2] * scale, y + coords[i * 2 + 1] * scale),
      ),
      color,
      width,
      brush,
      opacity,
    );
  const circle = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: string,
    width: number,
    brush: AnalogBrush = "pen",
  ) =>
    add(
      Array.from({ length: 65 }, (_, i) =>
        point(
          x + Math.cos((i / 64) * Math.PI * 2) * rx,
          y + Math.sin((i / 64) * Math.PI * 2) * ry,
        ),
      ),
      color,
      width,
      brush,
    );
  const curve = (
    x: number,
    y: number,
    ex: number,
    ey: number,
    bend: number,
    color: string,
    width: number,
    brush: AnalogBrush = "brush",
  ) =>
    add(
      Array.from({ length: 65 }, (_, i) => {
        const t = i / 64;
        return point(
          x + (ex - x) * t - (ey - y) * bend * 2 * t * (1 - t),
          y + (ey - y) * t + (ex - x) * bend * 2 * t * (1 - t),
        );
      }),
      color,
      width,
      brush,
    );
  const write = (
    text: string,
    x: number,
    y: number,
    height: number,
    color: string,
    angle = 0,
  ) => {
    const scale = height / 10,
      total = (text.length * 9 - 2) * scale,
      rad = (angle * Math.PI) / 180;
    const rand = seeded(hashSeed(text + x + y));
    [...text].forEach((c, index) => {
      for (const coords of glyphs[c] ?? []) {
        const pts = Array.from({ length: coords.length / 2 }, (_, i) => {
          const px = -total / 2 + index * 9 * scale + coords[i * 2] * scale,
            py = (coords[i * 2 + 1] - 5) * scale;
          return point(
            x + px * Math.cos(rad) - py * Math.sin(rad) + (rand() - 0.5) * 0.35,
            y + px * Math.sin(rad) + py * Math.cos(rad) + (rand() - 0.5) * 0.35,
          );
        });
        add(pts, color, Math.max(1.25, height * 0.055));
      }
    });
  };
  // A hand-coloured sapling in the centre, surrounded by a loose pencil ring.
  circle(0, 0, 108, 92, "#bc9a6a", 7, "pencil");
  curve(0, 22, 0, -76, 0.13, "#795d40", 13);
  for (const [x, y, side] of [
    [-22, -30, -1],
    [24, -51, 1],
    [-12, -70, -1],
  ]) {
    curve(0, y + 22, x + side * 10, y + 2, 0.12, "#795d40", 2, "pen");
    poly(
      [0, 18, side * 22, 9, side * 30, -7, side * 12, -13, 0, 18],
      x,
      y,
      1,
      "#246d56",
      2,
    );
    for (let j = 0; j < 3; j++)
      curve(
        x + side * (5 + j * 4),
        y + 10,
        x + side * 21,
        y - 7,
        -side * 0.12,
        "#61a56a",
        6,
        "marker",
      );
    poly([0, 18, side * 23, -6], x, y, 1, "#254b39", 1.2);
  }
  write("IDEA", 0, 44, 27, "#324e40");
  write("GARDEN", 0, 75, 20, "#324e40");
  const branches = [
    {
      x: 360,
      y: -248,
      c: "#e0614e",
      word: "CREATE",
      kids: ["SKETCH", "TRY"],
      icon: "bulb",
      a: -28,
    },
    {
      x: 440,
      y: 8,
      c: "#285b85",
      word: "LEARN",
      kids: ["ASK", "READ"],
      icon: "book",
      a: 2,
    },
    {
      x: 350,
      y: 264,
      c: "#246d56",
      word: "MOVE",
      kids: ["WALK", "BREATHE"],
      icon: "sun",
      a: 28,
    },
    {
      x: -350,
      y: 264,
      c: "#c49229",
      word: "CONNECT",
      kids: ["LISTEN", "THANK"],
      icon: "heart",
      a: -28,
    },
    {
      x: -440,
      y: 8,
      c: "#7868ad",
      word: "REST",
      kids: ["MUSIC", "SLEEP"],
      icon: "music",
      a: -2,
    },
    {
      x: -360,
      y: -248,
      c: "#e08f32",
      word: "EXPLORE",
      kids: ["NOTICE", "GROW"],
      icon: "leaf",
      a: 28,
    },
  ];
  branches.forEach((b, j) => {
    const sign = Math.sign(b.x),
      bend = (j % 2 ? 0.19 : -0.22) * sign;
    curve(sign * 90, b.y > 100 ? 40 : -14, b.x, b.y, bend, b.c, 27);
    // Thin hand-drawn edge gives the broad coloured sweep a clear hierarchy.
    curve(sign * 90, b.y > 100 ? 47 : -7, b.x, b.y + 7, bend, b.c, 1.7, "pen");
    const sx = sign * 90,
      sy = b.y > 100 ? 40 : -14,
      dx = b.x - sx,
      dy = b.y - sy,
      t = 0.57,
      tx = dx - dy * bend * 2 * (1 - 2 * t),
      ty = dy + dx * bend * 2 * (1 - 2 * t),
      length = Math.hypot(tx, ty),
      nx = (sign * ty) / length,
      ny = (-sign * tx) / length;
    let angle = (Math.atan2(ty, tx) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    write(
      b.word,
      sx + dx * t - dy * bend * 2 * t * (1 - t) + nx * 38,
      sy + dy * t + dx * bend * 2 * t * (1 - t) + ny * 38,
      25,
      b.c,
      angle,
    );
    b.kids.forEach((w, k) => {
      const ex = b.x + sign * 145,
        ey = b.y + (k ? 58 : -46);
      curve(b.x - sign * 24, b.y + 3, ex, ey, (k ? 0.2 : -0.2) * sign, b.c, 9);
      const kx = b.x - sign * 24,
        ky = b.y + 3,
        kdx = ex - kx,
        kdy = ey - ky,
        kbend = (k ? 0.2 : -0.2) * sign,
        kl = Math.hypot(kdx, kdy);
      let ka = (Math.atan2(kdy, kdx) * 180) / Math.PI;
      if (ka > 90) ka -= 180;
      if (ka < -90) ka += 180;
      write(
        w,
        kx + kdx * 0.5 - kdy * kbend * 0.5 + ((sign * kdy) / kl) * 20,
        ky + kdy * 0.5 + kdx * kbend * 0.5 - ((sign * kdx) / kl) * 20,
        15,
        b.c,
        ka,
      );
    });
    const x = b.x + sign * 22,
      y = b.y - 124,
      ink = "#344149";
    if (b.icon === "book") {
      for (let k = 0; k < 5; k++)
        poly(
          [0, 0, 22, -9, 44, 0],
          x - 22,
          y + k * 7,
          1,
          b.c,
          9,
          "highlighter",
        );
      poly(
        [0, 0, 0, 38, 22, 45, 44, 38, 44, 0, 22, 7, 0, 0],
        x - 22,
        y,
        1,
        ink,
        1.8,
      );
      poly([22, 7, 22, 45], x - 22, y, 1, ink, 1.8);
      for (let k = 0; k < 3; k++)
        poly([4, 10, 17, 14], x - 22, y + k * 8, 1, ink, 1.1);
    } else if (b.icon === "bulb") {
      circle(x, y + 14, 22, 24, "#eab53c", 14, "pencil");
      circle(x, y + 14, 23, 25, ink, 1.8);
      poly([-11, 38, 11, 38, 8, 46, -8, 46, -11, 38], x, y, 1, ink, 2);
      for (let k = 0; k < 5; k++) {
        const a = (k / 4) * Math.PI;
        poly(
          [
            Math.cos(a) * 30,
            -Math.sin(a) * 30,
            Math.cos(a) * 39,
            -Math.sin(a) * 39,
          ],
          x,
          y + 12,
          1,
          b.c,
          2,
        );
      }
    } else if (b.icon === "sun") {
      circle(x, y + 15, 19, 19, "#d39b27", 12, "marker");
      circle(x, y + 15, 21, 21, ink, 1.6);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        poly(
          [
            Math.cos(a) * 28,
            Math.sin(a) * 28,
            Math.cos(a) * 37,
            Math.sin(a) * 37,
          ],
          x,
          y + 15,
          1,
          b.c,
          2,
        );
      }
    } else if (b.icon === "heart") {
      for (let k = 0; k < 6; k++)
        poly(
          [-21 + k * 3, 1, -10, 20, 0, 33, 20 - k * 3, 1],
          x,
          y + 2,
          1,
          "#e0614e",
          6,
          "pencil",
        );
      poly(
        [
          0, 32, -23, 8, -24, -4, -16, -11, -7, -10, 0, -1, 7, -10, 16, -11, 24,
          -4, 23, 8, 0, 32,
        ],
        x,
        y,
        1,
        ink,
        1.8,
      );
    } else if (b.icon === "music") {
      poly([0, 28, 0, -12, 29, -19, 29, 22], x - 10, y, 1, ink, 3);
      circle(x - 18, y + 30, 9, 6, b.c, 8, "marker");
      circle(x + 12, y + 24, 9, 6, b.c, 8, "marker");
    } else {
      for (let k = 0; k < 6; k++)
        curve(
          x - 18 + k * 4,
          y + 32,
          x + 20,
          y - 7,
          0.65,
          "#61a56a",
          6,
          "pencil",
        );
      curve(x - 18, y + 32, x + 20, y - 7, 0.7, ink, 1.8, "pen");
      curve(x - 18, y + 32, x + 20, y - 7, -0.1, ink, 1.8, "pen");
      poly([-18, 32, 19, -6], x, y, 1, ink, 1.2);
    }
  });
  write("MAKE SPACE FOR A LITTLE WONDER", 0, 151, 13, "#6a7d62");
  curve(-170, 175, 170, 175, 0.03, "#61a56a", 4, "pencil");
  return strokes;
}
