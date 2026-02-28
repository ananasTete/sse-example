export async function parseJsonSafe<T>(request: Request, fallback: T): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return fallback;
  }
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
