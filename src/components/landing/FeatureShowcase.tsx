import { useEffect, useRef, useState } from 'react';
import { mountFeatureShowcase } from './featureShowcaseEngine';
import { ResponsiveFeatureShowcase } from './ResponsiveFeatureShowcase';
import './FeatureShowcase.css';

const quietScenes = [
  { title: 'AI Clips', image: '/demo/landing/clips/mrbeast-clip-01-poster.jpg', detail: 'Opening hook · challenge moment · emotional payoff' },
  { title: 'Captions', image: '/demo/landing/clips/ishowspeed-clip-01-poster.jpg', detail: 'Karaoke · Bold Pop · Minimal · Podcast' },
  { title: 'Reframe', image: '/demo/landing/clips/ronaldo-clip-01-poster.jpg', detail: 'Original 16:9 → 9:16 Smart Reframe' },
  { title: 'AI B-roll', image: '/demo/landing/clips/joe-rogan-clip-01-poster.jpg', detail: 'Illustrative visual suggestions and timeline placement' },
] as const;

export function FeatureShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1100px)').matches);
  const [quietScene, setQuietScene] = useState(0);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reduced || compact || !rootRef.current) return;
    return mountFeatureShowcase(rootRef.current);
  }, [reduced, compact]);

  if (reduced) {
    const scene = quietScenes[quietScene];
    return (
      <section className="vc-quiet-showcase" aria-label="VireoClip product demonstration, reduced motion">
        <div className="vc-quiet-tabs" role="tablist" aria-label="Product capabilities">
          {quietScenes.map((item, index) => (
            <button key={item.title} type="button" role="tab" aria-selected={index === quietScene} onClick={() => setQuietScene(index)}>{item.title}</button>
          ))}
        </div>
        <div className="vc-quiet-panel" role="tabpanel">
          <img src={scene.image} alt={`${scene.title} demonstration still`} loading="lazy" />
          <div><span>PRODUCT PREVIEW</span><h2>{scene.title}</h2><p>{scene.detail}</p><small>Demonstration media; no live processing is shown.</small></div>
        </div>
      </section>
    );
  }

  if (compact) return <ResponsiveFeatureShowcase />;

  return (
    <div className="vc-showcase" ref={rootRef}>
      <section className="showcase" aria-label="Animated VireoClip product demonstration using sample media">
        <div className="sc-head" id="scHead" />
        <div className="sc-viewport" id="scViewport">
          <div className="sc-design" id="scDesign" />
        </div>
        <div className="sc-tabs" id="scTabs" role="tablist" aria-label="Product capabilities" />
        <p className="vc-demo-note">Illustrative workflow · creator footage is sample media, not an endorsement.</p>
      </section>
    </div>
  );
}
