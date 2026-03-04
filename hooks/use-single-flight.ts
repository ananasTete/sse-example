import { useCallback, useRef } from "react";

export function useSingleFlight<TArgs extends unknown[], TResult>(
  task: (...args: TArgs) => Promise<TResult>,
) {
  const inFlightRef = useRef<Promise<TResult> | null>(null);

  const run = useCallback(
    (...args: TArgs) => {
      if (inFlightRef.current) {
        return inFlightRef.current;
      }

      const currentPromise = task(...args).finally(() => {
        if (inFlightRef.current === currentPromise) {
          inFlightRef.current = null;
        }
      });

      inFlightRef.current = currentPromise;
      return currentPromise;
    },
    [task],
  );

  const reset = useCallback(() => {
    inFlightRef.current = null;
  }, []);

  return { run, reset };
}
