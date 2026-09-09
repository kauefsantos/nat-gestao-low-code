import { useRef, useCallback } from "react";

export type UndoAction =
  | { type: "add"; itemId: string }
  | { type: "delete"; item: any }
  | { type: "update"; itemId: string; prev: Record<string, any> };

const MAX_HISTORY = 50;

export function useUndoStack() {
  const stackRef = useRef<UndoAction[]>([]);

  const push = useCallback((action: UndoAction) => {
    stackRef.current.push(action);
    if (stackRef.current.length > MAX_HISTORY) {
      stackRef.current.shift();
    }
  }, []);

  const pop = useCallback((): UndoAction | undefined => {
    return stackRef.current.pop();
  }, []);

  return { push, pop };
}
