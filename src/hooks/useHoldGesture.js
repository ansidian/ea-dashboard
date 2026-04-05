import { useState, useRef, useCallback } from "react";

const HOLD_DURATION = 1500;

export default function useHoldGesture({ onShortPress } = {}) {
  const [holdProgress, setHoldProgress] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const holdTimerRef = useRef(null);
  const holdProgressRef = useRef(null);

  const startHold = useCallback(() => {
    setHoldProgress(0);
    const start = Date.now();
    holdProgressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setHoldProgress(pct);
    }, 16);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = "fired";
      clearInterval(holdProgressRef.current);
      setHoldProgress(0);
      setShowConfirm(true);
    }, HOLD_DURATION);
  }, []);

  const endHold = useCallback((cancel) => {
    clearInterval(holdProgressRef.current);
    setHoldProgress(0);
    if (holdTimerRef.current === "fired") {
      holdTimerRef.current = null;
      return;
    }
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (!cancel && onShortPress) onShortPress();
  }, [onShortPress]);

  const onPointerDown = useCallback(() => {
    startHold();
  }, [startHold]);

  const onPointerUp = useCallback(() => {
    endHold(false);
  }, [endHold]);

  const onPointerLeave = useCallback(() => {
    endHold(true);
  }, [endHold]);

  return {
    holdProgress,
    showConfirm,
    setShowConfirm,
    startHold,
    endHold,
    holdTimerRef,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
  };
}
