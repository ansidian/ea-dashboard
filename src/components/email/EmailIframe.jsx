import { useRef, useState, useEffect } from "react";
import DOMPurify from "dompurify";
export default function EmailIframe({ html }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    function resize() {
      try {
        const h = iframe.contentDocument?.documentElement?.scrollHeight;
        if (h && h > 50) setHeight(Math.min(h + 16, window.innerHeight * 0.7));
      } catch { /* cross-origin */ }
    }
    iframe.addEventListener("load", resize);
    return () => iframe.removeEventListener("load", resize);
  }, [html]);

  // Sanitize then wrap in a full document so the email's own styles apply
  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ["style", "link", "meta", "img", "center"],
    ADD_ATTR: ["src", "alt", "width", "height", "style", "class", "align", "valign", "bgcolor", "cellpadding", "cellspacing", "border", "role"],
    WHOLE_DOCUMENT: true,
  });

  return (
    <iframe
      ref={iframeRef}
      className="w-full border-none rounded-default min-h-[200px] max-h-[70vh] bg-white"
      style={{ height }}
      sandbox="allow-same-origin"
      srcDoc={sanitized}
      title="Email content"
    />
  );
}
