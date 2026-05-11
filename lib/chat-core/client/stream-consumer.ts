export async function consumePatchStream(
  response: Response,
  parser: { feed: (chunk: string) => void },
): Promise<void> {
  if (!response.body) return;

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(value);
  }
}
