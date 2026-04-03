import { useRef, useCallback } from "react";

const REVEAL_THRESHOLD = 80;
const DISMISS_THRESHOLD = 160;

export default function SwipeToReveal({ onAction, actionLabel = "Dismiss", actionColor = "#f97316", children }) {
  const cardRef = useRef(null);
  const startX = useRef(null);
  const currentX = useRef(0);
  const swiping = useRef(false);

  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    swiping.current = false;
    if (cardRef.current) {
      cardRef.current.style.transition = "none";
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx > 0) return; // only swipe left
    const absDx = Math.abs(dx);
    if (absDx > 10) swiping.current = true;
    currentX.current = dx;
    if (cardRef.current) {
      cardRef.current.style.transform = `translateX(${dx}px)`;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (startX.current === null) return;
    const absDx = Math.abs(currentX.current);

    if (cardRef.current) {
      cardRef.current.style.transition = "transform 300ms cubic-bezier(0.16,1,0.3,1)";
    }

    if (absDx >= DISMISS_THRESHOLD) {
      // auto-dismiss: slide off screen
      if (cardRef.current) {
        cardRef.current.style.transform = "translateX(-100%)";
      }
      setTimeout(() => onAction?.(), 200);
    } else {
      // spring back
      if (cardRef.current) {
        cardRef.current.style.transform = "translateX(0)";
      }
    }

    startX.current = null;
    currentX.current = 0;
  }, [onAction]);

  // prevent click when swiping
  const onClick = useCallback((e) => {
    if (swiping.current) {
      e.stopPropagation();
      e.preventDefault();
      swiping.current = false;
    }
  }, []);

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Action behind card */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
        style={{ width: REVEAL_THRESHOLD, background: actionColor }}
      >
        <div className="text-white text-center">
          <div className="text-base font-bold">✕</div>
          <div className="text-[11px] font-semibold mt-0.5">{actionLabel}</div>
        </div>
      </div>

      {/* Swipeable card */}
      <div
        ref={cardRef}
        className="relative"
        style={{ background: "#16161e" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClick}
      >
        {children}
      </div>
    </div>
  );
}
