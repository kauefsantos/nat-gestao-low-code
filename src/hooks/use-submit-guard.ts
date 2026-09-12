import { useCallback, useRef, useState } from "react";

export function useSubmitGuard() {
  const lockRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const begin = useCallback(() => {
    if (lockRef.current) return false;
    lockRef.current = true;
    setSubmitting(true);
    return true;
  }, []);

  const reset = useCallback(() => {
    lockRef.current = false;
    setSubmitting(false);
  }, []);

  return { submitting, begin, reset };
}
