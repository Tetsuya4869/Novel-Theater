export interface GenerateResponse {
  workId: string;
  metrics: {
    scenes: number;
    imagesGenerated: number;
    imagesFailed: number;
    timeToFirstPanelMs?: number;
    totalCostUSD: number;
    totalMs: number;
  };
}

export async function requestGenerate(input: {
  text: string;
  title?: string;
  style?: string;
}): Promise<GenerateResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ?? `生成に失敗しました (${res.status})`);
  }
  return json as GenerateResponse;
}
