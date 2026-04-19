import { useCallback, useEffect, useRef, useState } from "react";

export default function useBriefingSearchPanel({
  isMobile,
  openEmail,
  setOpenEmail,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [showBillForm, setShowBillForm] = useState(false);
  const inputRef = useRef(null);
  const inputWrapRef = useRef(null);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);

  const updatePos = useCallback(() => {
    if (!inputWrapRef.current) return;
    const rect = inputWrapRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    window.addEventListener("resize", updatePos);
    return () => window.removeEventListener("resize", updatePos);
  }, [open, updatePos]);

  useEffect(() => {
    if (!open || isMobile) return undefined;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (isMobile) return undefined;
    function handleClick(event) {
      if (inputWrapRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setOpen(false);
      setOpenEmail(null);
    }
    if (open) document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open, isMobile, setOpenEmail]);

  useEffect(() => {
    if (isMobile && openEmail) inputRef.current?.blur();
  }, [isMobile, openEmail]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowBillForm(false);
  }, [openEmail?.uid]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !open) return undefined;
    function handleWheel(event) {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const atTop = scrollTop <= 0 && event.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && event.deltaY > 0;
      if (atTop || atBottom) event.preventDefault();
    }
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [open]);

  return {
    open,
    setOpen,
    pos,
    showBillForm,
    setShowBillForm,
    inputRef,
    inputWrapRef,
    panelRef,
    scrollRef,
  };
}
