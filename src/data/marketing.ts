// Marketing plan definitions aligned with application plan configuration (server/src/services/billing/planConfig.ts).
// Free tier is active. Paid plans (Creator, Pro, Studio) are fully engineered in-app; live payment checkout is currently undergoing sandbox verification prior to public commercial release.

export interface MarketingPlan {
  name: string;
  badge?: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  available: boolean;
  statusNote: string;
}

export const plans: MarketingPlan[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/ month',
    description: 'Get started with essential video clipping and platform content kits.',
    features: [
      '15 video processing minutes / mo',
      'AI transcription & moment detection',
      'Export vertical 9:16 clips',
      'Multi-platform content kits (6 channels)',
    ],
    available: true,
    statusNote: 'Sandbox preview • Allowance under review',
  },
  {
    name: 'Creator',
    badge: 'POPULAR',
    price: '$12',
    period: '/ mo ($72/yr, 50% off)',
    description: 'For active creators publishing weekly short-form video content.',
    features: [
      '120 video processing minutes / mo',
      'Everything in Free',
      'Custom brand voice presets',
    ],
    available: false,
    statusNote: 'Sandbox preview • Checkout activation pending',
  },
  {
    name: 'Pro',
    price: '$24',
    period: '/ mo ($144/yr, 50% off)',
    description: 'For creators publishing across multiple platforms.',
    features: [
      '360 video processing minutes / mo',
      'Everything in Creator',
      'Custom watermarks & brand assets',
    ],
    available: false,
    statusNote: 'Sandbox preview • Checkout activation pending',
  },
  {
    name: 'Studio',
    badge: 'STUDIO',
    price: '$49',
    period: '/ mo ($294/yr, 50% off)',
    description: 'For high-volume short-form video production.',
    features: [
      '900 video processing minutes / mo',
      'Everything in Pro',
      'Priority enterprise support',
    ],
    available: false,
    statusNote: 'Sandbox preview • Checkout activation pending',
  },
];

export const examples = [
  { platform: 'YouTube', type: 'Title + description', sample: 'The lessons that changed how I run my business' },
  { platform: 'Instagram', type: 'Hook + caption', sample: 'The one thing I wish I knew before I started…' },
  { platform: 'Shorts / Reels', type: 'Moment ideas', sample: 'A sharp takeaway, ready to turn into a clip' },
  { platform: 'TikTok', type: 'Hook + caption', sample: 'The moment that changes how you think about your next video' },
  { platform: 'LinkedIn', type: 'Professional post', sample: 'Three practical lessons from building in public' },
  { platform: 'X', type: 'Thread outline', sample: 'A concise story, structured post by post' },
];
