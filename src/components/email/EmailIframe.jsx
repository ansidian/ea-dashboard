import DOMPurify from "dompurify";

// Renders a sanitized email body inside an iframe. The iframe always fills
// its parent container's height (100%) — EmailReader provides a fixed-size
// scrollable region, and the iframe's own scrollbar handles overflow for
// long emails. Width is 100% so multi-column layouts can reflow.
export default function EmailIframe({ html }) {
  // Sanitize then wrap in a full document so the email's own styles apply
  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ["style", "link", "meta", "img", "center"],
    ADD_ATTR: ["src", "alt", "width", "height", "style", "class", "align", "valign", "bgcolor", "cellpadding", "cellspacing", "border", "role"],
    FORBID_TAGS: ["script"],
    WHOLE_DOCUMENT: true,
  })
    // Strip tracking pixels (1x1 or 0x0 images, common tracker domains)
    .replace(/<img[^>]*(?:width\s*=\s*["']?[01]|height\s*=\s*["']?[01]|\.gif\?[^"']*["'])[^>]*\/?>/gi, "");

  return (
    <iframe
      className="w-full h-full border-none rounded-default bg-white"
      sandbox="allow-same-origin"
      srcDoc={sanitized}
      title="Email content"
    />
  );
}
