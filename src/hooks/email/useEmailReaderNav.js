import { useMemo, useCallback } from "react";

// Derives navigation props ({ position, hasPrev, hasNext, onPrev, onNext })
// for EmailReaderOverlay given a flat email list and the currently open
// email. Parent owns the openEmail state; this hook is pure derivation.
//
// The `keyOf` function extracts the matching id from both list items and
// the open email — defaults to `uid || id` which works for search results,
// briefing emails, and live emails alike.
const defaultKeyOf = (e) => e?.uid || e?.id;

export default function useEmailReaderNav({ list, openEmail, onOpen, keyOf }) {
  const getKey = keyOf || defaultKeyOf;
  const openKey = openEmail ? getKey(openEmail) : null;

  const index = useMemo(() => {
    if (openKey == null) return -1;
    return list.findIndex((e) => getKey(e) === openKey);
  }, [list, openKey, getKey]);

  const total = list.length;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < total - 1;

  const onPrev = useCallback(() => {
    if (!hasPrev) return;
    onOpen(list[index - 1]);
  }, [hasPrev, list, index, onOpen]);

  const onNext = useCallback(() => {
    if (!hasNext) return;
    onOpen(list[index + 1]);
  }, [hasNext, list, index, onOpen]);

  if (index < 0) return null;
  return {
    position: { index, total },
    hasPrev,
    hasNext,
    onPrev,
    onNext,
  };
}
