// Jev (TypeSafe AI) suggestions through Vercel AI Gateway.
//
// The browser never sees the gateway key: it posts the context of one edited
// node and this route asks Jev two typed questions about it in a single
// parallel pass — what kind of node it is, and which top-level branch it
// belongs under. The questions are fixed here, so the route can't be used as
// a general-purpose proxy for the key.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ENDPOINT = "https://ai-gateway.vercel.sh/typesafe/v1/systemone";
const MODEL = "typesafe-ai/jev";

const KINDS = {
  idea: "An idea, proposal, possibility or thought to explore",
  task: "An action someone needs to do; a to-do item",
  question: "An open question or something still to be found out",
  warning: "A risk, concern, constraint or thing to be careful about",
  note: "A fact, reference, example or plain statement",
} as const;

type Branch = { id: string; label: string };
type Body = {
  topic?: unknown;
  text?: unknown;
  parent?: unknown;
  branches?: unknown;
};
type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

const clip = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

// Best-effort per-instance throttle (serverless instances don't share it).
const hits = new Map<string, number[]>();
function throttled(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 60;
}

export async function POST(req: Request) {
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (throttled(ip))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const text = clip(body.text, 300);
  if (!text) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const branches: Branch[] = (Array.isArray(body.branches) ? body.branches : [])
    .slice(0, 16)
    .map((b) => ({ id: clip((b as Branch)?.id, 64), label: clip((b as Branch)?.label, 80) }))
    .filter((b) => b.id && b.label);

  const questions: Record<string, unknown> = {
    kind: {
      type: "choice",
      instructions:
        "Which kind of mind-map node is node_text? Judge only the node's own text, in the context of the map.",
      criteria: KINDS,
    },
  };
  // Branch indices keep option keys short and free of user text.
  if (branches.length >= 2) {
    const criteria: Record<string, string> = {};
    branches.forEach((b, i) => (criteria[`b${i}`] = b.label));
    criteria.none = "None of these branches clearly fits";
    questions.branch = {
      type: "choice",
      instructions:
        "Under which top-level branch of this mind map does node_text belong best?",
      criteria,
    };
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        state: {
          map_topic: clip(body.topic, 120),
          node_text: text,
          current_parent: clip(body.parent, 120),
          top_level_branches: branches.map((b) => b.label),
        },
        questions,
      }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 502 });
  }
  if (!res.ok)
    return NextResponse.json({ error: "upstream", status: res.status }, { status: 502 });

  const data = (await res.json().catch(() => null)) as {
    answers?: Record<string, ChoiceAnswer>;
  } | null;
  const kind = data?.answers?.kind;
  const branch = data?.answers?.branch;
  const branchIndex = branch?.choice?.startsWith("b") ? Number(branch.choice.slice(1)) : -1;
  return NextResponse.json({
    kind:
      kind && kind.choice in KINDS
        ? { value: kind.choice, confidence: kind.confidence ?? 0 }
        : null,
    branch:
      branch && branches[branchIndex]
        ? { id: branches[branchIndex].id, confidence: branch.confidence ?? 0 }
        : null,
  });
}
