import { useEffect, useRef, useState } from 'react';
import { Captions, Crop, Layers, Link2, Scissors } from 'lucide-react';
import youtubeMark from '../../assets/landing/platforms/youtube.svg';
import instagramMark from '../../assets/landing/platforms/instagram.svg';
import tiktokMark from '../../assets/landing/platforms/tiktok.svg';

const tabs = [
  { label: 'AI Clips', icon: Scissors },
  { label: 'Captions', icon: Captions },
  { label: 'Reframe', icon: Crop },
  { label: 'AI B-roll', icon: Layers },
] as const;

const sceneTiming = [
  { steps: [1100, 2200, 3100], total: 7600 },
  { steps: [2100, 4200, 6300], total: 8500 },
  { steps: [1300, 3600], total: 7700 },
  { steps: [1500, 3300, 5400], total: 8700 },
] as const;

const clipResults = [
  { label: 'HOOK', poster: '/demo/landing/clips/mrbeast-clip-01-poster.jpg', mark: youtubeMark, platform: 'YouTube' },
  { label: 'MOMENT', poster: '/demo/landing/clips/mrbeast-clip-02-poster.jpg', mark: instagramMark, platform: 'Instagram' },
  { label: 'PAYOFF', poster: '/demo/landing/clips/mrbeast-clip-03-poster.jpg', mark: tiktokMark, platform: 'TikTok' },
] as const;

const captionPresets = ['Karaoke', 'Bold Pop', 'Minimal', 'Podcast'] as const;
const captionLines = ['No no way', 'Why did I fall', 'I was literally right at the top', 'I was right there'] as const;

const visualSuggestions = [
  { label: 'Challenge cutaway', poster: '/demo/landing/clips/mrbeast-clip-02-poster.jpg', state: 'Suggested' },
  { label: 'Sports reaction', poster: '/demo/landing/clips/ronaldo-clip-01-poster.jpg', state: 'Relevant' },
] as const;

export function ResponsiveFeatureShowcase() {
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState(0);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const running = inView && pageVisible;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .15 });
    observer.observe(root);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  useEffect(() => {
    if (!running) return;
    setPhase(0);
    const timing = sceneTiming[active];
    const timers = timing.steps.map((delay, index) => window.setTimeout(() => setPhase(index + 1), delay));
    timers.push(window.setTimeout(() => setActive((current) => (current + 1) % tabs.length), timing.total));
    return () => timers.forEach(window.clearTimeout);
  }, [active, running]);

  useEffect(() => {
    const videos = Array.from(rootRef.current?.querySelectorAll('video') ?? []);
    videos.forEach((video) => {
      if (running) video.play().catch(() => {});
      else video.pause();
    });
    return () => videos.forEach((video) => video.pause());
  }, [active, running]);

  function choose(index: number) {
    setPhase(0);
    setActive(index);
  }

  return (
    <section className="vc-responsive-showcase" ref={rootRef} aria-label="VireoClip animated product demonstration using sample media" data-active-scene={tabs[active].label} data-phase={phase}>
      <div className="vc-responsive-head"><span>THE PRODUCT, IN MOTION</span><small>Illustrative workflow</small></div>
      <div className="vc-responsive-tabs" role="tablist" aria-label="Product capabilities">
        {tabs.map((tab, index) => <button key={tab.label} type="button" role="tab" aria-selected={index === active} onClick={() => choose(index)}><tab.icon size={15} aria-hidden="true" />{tab.label}</button>)}
      </div>
      <div className={`vc-responsive-stage vc-responsive-stage--${active} vc-responsive-stage--phase-${phase}`} role="tabpanel" aria-label={tabs[active].label}>
        {active === 0 && <>
          <div className="vc-rs-topline"><strong>AI Clips</strong><span>Sample creator footage</span></div>
          <div className="vc-rs-source">
            <video src="/demo/landing/clips/mrbeast-clip-01.mp4" poster="/demo/landing/clips/mrbeast-clip-01-poster.jpg" muted loop playsInline preload="none" />
            <span>Source clip · 00:24</span>
          </div>
          <div className="vc-rs-url"><Link2 size={15} aria-hidden="true" /><span>{phase >= 1 ? 'youtube.com/watch?v=sample-video' : 'Paste a YouTube or video link...'}</span><b className={phase >= 2 ? 'is-pressed' : ''}>Get clips</b></div>
          <div className="vc-rs-results" aria-label="Three example clip moments">
            {clipResults.map((clip, index) => <div className="vc-rs-result" key={clip.label} style={{ transitionDelay: `${index * 110}ms` }}><img src={clip.poster} alt="" loading="lazy" /><span><img src={clip.mark} alt={clip.platform} />{clip.label}</span></div>)}
          </div>
        </>}
        {active === 1 && <>
          <div className="vc-rs-topline"><strong>Captions</strong><span>IShowSpeed sample clip</span></div>
          <div className="vc-rs-caption-layout">
            <div className="vc-rs-caption-video"><video src="/demo/landing/clips/ishowspeed-clip-01.mp4" poster="/demo/landing/clips/ishowspeed-clip-01-poster.jpg" muted loop playsInline preload="none" /><div className={`vc-rs-caption-line vc-rs-caption-line--${phase}`} key={phase}>{captionLines[phase].split(' ').map((word, index) => <span key={`${word}-${index}`} style={{ animationDelay: `${index * 140}ms` }}>{word}</span>)}</div></div>
            <div className="vc-rs-presets"><small>Caption presets</small>{captionPresets.map((preset, index) => <div className={phase === index ? 'is-selected' : ''} key={preset}>{preset}</div>)}</div>
          </div>
        </>}
        {active === 2 && <>
          <div className="vc-rs-topline"><strong>Smart Reframe</strong><span>Same source segment</span></div>
          <div className="vc-rs-before"><video src="/demo/landing/reframe/ronaldo-before.mp4" poster="/demo/landing/reframe/ronaldo-before-poster.jpg" muted loop playsInline preload="none" /><span className="vc-rs-crop" aria-hidden="true" /><b>Original 16:9</b></div>
          <div className="vc-rs-after"><video src="/demo/landing/clips/ronaldo-clip-01.mp4" poster="/demo/landing/clips/ronaldo-clip-01-poster.jpg" muted loop playsInline preload="none" /><span>9:16 Smart Reframe</span></div>
        </>}
        {active === 3 && <>
          <div className="vc-rs-topline"><strong>AI B-roll</strong><span>Illustrative sample media</span></div>
          <div className="vc-rs-broll-preview"><video src="/demo/landing/clips/joe-rogan-clip-01.mp4" poster="/demo/landing/clips/joe-rogan-clip-01-poster.jpg" muted loop playsInline preload="none" /><img src="/demo/landing/clips/mrbeast-clip-02-poster.jpg" alt="" loading="lazy" /></div>
          <div className="vc-rs-timeline"><div className="vc-rs-track"><i /><i /><i /><i /><span /></div><div className="vc-rs-slot"><span>Visual track</span><img src="/demo/landing/clips/mrbeast-clip-02-poster.jpg" alt="Added sample visual" loading="lazy" /></div></div>
          <div className="vc-rs-suggestions"><small>{phase === 0 ? 'Exploring sample visuals…' : 'Illustrative cutaways'}</small>{visualSuggestions.map((item, index) => <div className={phase >= 2 && index === 0 ? 'is-selected' : ''} key={item.label}><img src={item.poster} alt="" loading="lazy" /><span>{item.label}</span><em>{phase >= 3 && index === 0 ? 'Added' : item.state}</em></div>)}</div>
        </>}
      </div>
      <p className="vc-demo-note">Sample media only · no creator endorsement or live AI processing is implied.</p>
    </section>
  );
}
