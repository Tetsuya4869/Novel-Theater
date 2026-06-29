import type { WorkView } from "@/lib/view";

export interface PlanResponse {
  workId: string;
  cached: boolean;
  scenes: number;
}

async function asJson<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error ?? `エラー (${res.status})`);
  }
  return json as T;
}

export async function requestGenerate(input: {
  text: string;
  title?: string;
  style?: string;
}): Promise<PlanResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return asJson<PlanResponse>(res);
}

export async function fetchWork(workId: string): Promise<WorkView> {
  const res = await fetch(`/api/works/${workId}`, { cache: "no-store" });
  return asJson<WorkView>(res);
}

export async function prefetchScenes(
  workId: string,
  from: number,
  count: number,
): Promise<{ enqueued: number }> {
  const res = await fetch(`/api/works/${workId}/prefetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, count }),
  });
  return asJson<{ enqueued: number }>(res);
}

export async function regenerateScene(workId: string, sceneId: string): Promise<void> {
  const res = await fetch(`/api/works/${workId}/scenes/${sceneId}/regenerate`, {
    method: "POST",
  });
  await asJson<{ ok: boolean }>(res);
}
