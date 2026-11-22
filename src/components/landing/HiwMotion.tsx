import "../../styles/hiw-motion.css";

/**
 * "How it works" motion piece: Moiz's supplied HTML template, adapted
 * (clean background, real sample-footage frames, blended into the page).
 * Embedded as an isolated self-contained document; illustrative only.
 */
export default function HiwMotion() {
  return (
    <div className="hiw-motion-embed lv-reveal">
      <iframe
        src="/hiw-motion.html"
        title="Illustrative animation: one long video becomes vertical clips"
        className="hiw-motion-frame"
        loading="lazy"
        scrolling="no"
        aria-label="Illustrative process animation, simplified. Not a recording of product output."
      />
    </div>
  );
}
