import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Link2, Play, UploadCloud } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AiClippingPreview } from './AiClippingPreview';
import './cinematic-hero.css';

const creators = [
  { name: 'MrBeast', category: 'Challenges', poster: '/demo/landing/creators/mrbeast-card-v3.webp', placement: 'left-one' },
  { name: 'IShowSpeed', category: 'Gaming / Reactions', poster: '/demo/landing/creators/ishowspeed-card-v3.webp', placement: 'left-two' },
  { name: 'Joe Rogan', category: 'Podcast', poster: '/demo/landing/creators/joe-rogan-card-v3.webp', placement: 'left-three' },
  { name: 'Lex Fridman', category: 'Podcast / Ideas', poster: '/demo/landing/creators/lex-fridman-card-v3.webp', placement: 'right-one' },
  { name: 'Cristiano Ronaldo', category: 'Sports', poster: '/demo/landing/creators/ronaldo-card-v3.webp', placement: 'right-two' },
  { name: 'Lionel Messi', category: 'Sports', poster: '/demo/landing/creators/messi-card-v3.webp', placement: 'right-three' },
] as const;

function creationPath(isAuthenticated: boolean, path: string) {
  return isAuthenticated ? path : `/signup?next=${encodeURIComponent(path)}`;
}

function HeroVideoInput() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
      setError('');
      const projectPath = `/projects/new?url=${encodeURIComponent(trimmed)}`;
      navigate(creationPath(isAuthenticated, projectPath));
    } catch {
      setError('Enter a valid YouTube or direct video URL, including https://.');
    }
  }

  return (
    <div className="vc-hero-create">
      <form className="vc-hero-form" onSubmit={submit} noValidate>
        <Link2 size={22} aria-hidden="true" />
        <label className="sr-only" htmlFor="vc-video-url">YouTube or direct video URL</label>
        <input
          id="vc-video-url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="Paste a YouTube or video link..."
          value={url}
          onChange={(event) => { setUrl(event.target.value); if (error) setError(''); }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'vc-video-url-error' : undefined}
        />
        <button className="vc-hero-submit" type="submit">Get free clips <ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      {error && <p id="vc-video-url-error" className="vc-form-error" role="alert">{error}</p>}
      <Link className="vc-upload-link" to={creationPath(isAuthenticated, '/projects/new')}>
        <UploadCloud size={17} aria-hidden="true" /> Upload video
      </Link>
    </div>
  );
}

function HeroCreators() {
  return (
    <div className="vc-creators" aria-label="Examples of sample creator footage">
      {creators.map((creator) => (
        <div
          className={`vc-creator vc-creator--${creator.placement}`}
          key={creator.name}
        >
          <img src={creator.poster} alt="" loading="lazy" decoding="async" />
          <span className="vc-creator-shade" aria-hidden="true" />
          <span className="vc-creator-glint" aria-hidden="true" />
          <span className="vc-creator-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
          <span className="vc-creator-label"><strong>{creator.name}</strong><small>{creator.category}</small></span>
        </div>
      ))}
    </div>
  );
}

export function LandingHero() {
  return (
    <section className="vc-hero" aria-labelledby="hero-title">
      <div className="vc-hero-orbit">
        <div className="vc-hero-content">
          <p className="vc-hero-eyebrow">BEST FREE VIDEO CLIPPING TOOL</p>
          <h1 id="hero-title"><span>One video in.</span><span>Your <em>best clips</em> out.</span></h1>
          <p className="vc-hero-description">Find the strongest moments, clip them, add captions, reframe, and create ready-to-post content for every platform — in minutes.</p>
          <HeroVideoInput />
          <div className="vc-hero-benefits" aria-label="Getting started details">
            <span><Check size={15} aria-hidden="true" /> Free plan available</span>
            <span><Check size={15} aria-hidden="true" /> No credit card required</span>
          </div>
        </div>
        <HeroCreators />
      </div>
      <div className="vc-showcase-shell">
        <div className="vc-friend-showcase">
          <AiClippingPreview />
        </div>
      </div>
      <p className="vc-hero-media-note">Sample footage for demonstration only. No creator endorsement is implied.</p>
    </section>
  );
}
