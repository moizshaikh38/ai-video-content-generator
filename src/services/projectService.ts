import { Project, ContentOutput, CreatorProfile } from '../types';

const INITIAL_PROJECT_ID = 'demo-project-1';

const INITIAL_OUTPUTS: ContentOutput[] = [
  // YouTube
  {
    id: 'out-yt-1',
    project_id: INITIAL_PROJECT_ID,
    platform: 'youtube',
    content_type: 'title',
    content: 'How I Built a $1M SaaS in 18 Months (No Investors)',
    position: 0,
  },
  {
    id: 'out-yt-2',
    project_id: INITIAL_PROJECT_ID,
    platform: 'youtube',
    content_type: 'title',
    content: 'The Bootstrapping Playbook: Zero to 7 Figures',
    position: 1,
  },
  {
    id: 'out-yt-3',
    project_id: INITIAL_PROJECT_ID,
    platform: 'youtube',
    content_type: 'title',
    content: 'Why We Rejected VC Money and Grew Faster',
    position: 2,
  },
  {
    id: 'out-yt-4',
    project_id: INITIAL_PROJECT_ID,
    platform: 'youtube',
    content_type: 'title',
    content: 'How to Get Your First 100 Paying SaaS Customers',
    position: 3,
  },
  {
    id: 'out-yt-5',
    project_id: INITIAL_PROJECT_ID,
    platform: 'youtube',
    content_type: 'title',
    content: 'The $1,000,000 Bootstrapping Blueprint',
    position: 4,
  },
  {
    id: 'out-yt-desc',
    project_id: INITIAL_PROJECT_ID,
    platform: 'youtube',
    content_type: 'description',
    content: `In this video, I break down the exact strategies and tactical frameworks we used to bootstrap our software company from zero to $1,000,000 in Annual Recurring Revenue (ARR) with zero outside capital.

We cover:
- How we validated our idea before writing a single line of production code
- The manual direct outreach strategy that secured our first 10 paying customers
- Designing a product-led growth flywheel that compounds organically
- The critical hiring and operational mistakes that kill early-stage bootstrapped startups

Timestamps & Chapters:
0:00 Intro & The Zero Funding Decision
2:15 Validating Before Writing Code
5:40 Finding First 10 Paying Customers
9:22 Product-Led Growth Engine
13:10 Hiring Mistakes to Avoid
17:45 Conclusion & Action Plan

Resources mentioned:
- Startup Launch Checklist (link in bio)
- Community Discord: join our builder network

Subscribe for weekly deep-dives on bootstrapping, product growth, and founder mechanics!`,
    position: 0,
  },
  {
    id: 'out-yt-chapters',
    project_id: INITIAL_PROJECT_ID,
    platform: 'youtube',
    content_type: 'chapters',
    content: `0:00 Intro & The Zero Funding Decision
2:15 Validating Before Writing Code
5:40 Finding First 10 Paying Customers
9:22 Product-Led Growth Engine
13:10 Hiring Mistakes to Avoid
17:45 Conclusion & Action Plan`,
    position: 0,
  },
  {
    id: 'out-yt-keywords',
    project_id: INITIAL_PROJECT_ID,
    platform: 'youtube',
    content_type: 'keywords',
    content: `saas bootstrapping, build in public, how to build a saas, 7 figure saas, startup without funding, founder journey, software business, product led growth, customer acquisition, micro saas, indie hacker, arr growth`,
    position: 0,
  },

  // Instagram
  {
    id: 'out-ig-h1',
    project_id: INITIAL_PROJECT_ID,
    platform: 'instagram',
    content_type: 'hook',
    content: 'Stop looking for investors. Here is why bootstrapping is your unfair advantage in 2026:',
    position: 0,
  },
  {
    id: 'out-ig-h2',
    project_id: INITIAL_PROJECT_ID,
    platform: 'instagram',
    content_type: 'hook',
    content: 'How we got to $1M ARR without spending a single dollar on paid advertisements:',
    position: 1,
  },
  {
    id: 'out-ig-h3',
    project_id: INITIAL_PROJECT_ID,
    platform: 'instagram',
    content_type: 'hook',
    content: 'The single biggest mistake founders make in year one (and how to avoid it completely):',
    position: 2,
  },
  {
    id: 'out-ig-h4',
    project_id: INITIAL_PROJECT_ID,
    platform: 'instagram',
    content_type: 'hook',
    content: 'If I had to build a software business from scratch with $0, here is the exact 4-step playbook:',
    position: 3,
  },
  {
    id: 'out-ig-h5',
    project_id: INITIAL_PROJECT_ID,
    platform: 'instagram',
    content_type: 'hook',
    content: 'Why 90% of early-stage SaaS companies burn out before customer #10:',
    position: 4,
  },
  {
    id: 'out-ig-caption',
    project_id: INITIAL_PROJECT_ID,
    platform: 'instagram',
    content_type: 'caption',
    content: `Bootstrapping taught me one brutal truth: when you have no funding, you cannot buy your way out of bad product-market fit. 💡

We spent the first 6 months talking directly to 100+ potential users before writing our first line of production code.

Here are the 4 non-negotiable principles:
1. Don't build features until 3 customers ask for them.
2. Personally onboard every single signup.
3. Charge from day one — free users don't validate business models.
4. Keep personal burn rate ultra-low.

Swipe through for the complete breakdown. 🚀

Save this post for when you start your next project!`,
    position: 0,
  },
  {
    id: 'out-ig-hashtags',
    project_id: INITIAL_PROJECT_ID,
    platform: 'instagram',
    content_type: 'hashtags',
    content: `#saas #entrepreneurship #buildinpublic #startuptips #bootstrapping #techfounder #growthhacking #solopreneur #softwaredeveloper #businessgrowth #indiehacker #startupjourney`,
    position: 0,
  },

  // Shorts / Reels
  {
    id: 'out-shorts-1',
    project_id: INITIAL_PROJECT_ID,
    platform: 'shorts',
    content_type: 'moment',
    content: `⏱ 0:45–1:15
Hook: Why VC funding can actually slow you down
Description: Fast-paced vertical cut contrasting investor board pressure with founder autonomy. Emphasize speed of iteration when self-funded.`,
    position: 0,
  },
  {
    id: 'out-shorts-2',
    project_id: INITIAL_PROJECT_ID,
    platform: 'shorts',
    content_type: 'moment',
    content: `⏱ 5:40–6:25
Hook: The 3 direct messages that landed our first 10 customers
Description: Over-the-shoulder screen recording walkthrough of the value-first cold outreach framework that converted at 32%.`,
    position: 1,
  },
  {
    id: 'out-shorts-3',
    project_id: INITIAL_PROJECT_ID,
    platform: 'shorts',
    content_type: 'moment',
    content: `⏱ 13:10–14:02
Hook: Never hire these 2 roles before hitting $500k ARR
Description: Punchy founder warning on premature team scaling and runaway monthly burn rate.`,
    position: 2,
  },

  // LinkedIn
  {
    id: 'out-li-post',
    project_id: INITIAL_PROJECT_ID,
    platform: 'linkedin',
    content_type: 'post',
    content: `Most founders believe they need $1,000,000 in seed money to launch a software company.

What they actually need is 10 customers who care deeply about solving a real problem.

When we founded our SaaS, we had:
→ No venture capital
→ No marketing agency
→ No fancy downtown office

18 months later, we passed $1M ARR.

Here are 3 counter-intuitive lessons from the journey:

1. Sell the problem before building the solution
We presold 15 quarterly licenses using wireframes and Notion docs. That guaranteed market demand and funded our initial server bills.

2. Do things that don't scale
I personally hopped on Zoom calls with our first 75 customers. That direct feedback loop was 10x more valuable than any analytics dashboard.

3. Optimize for customer retention over vanity hype
A small cohort of raving fans will refer their peers for free. Sustainable growth is quiet, disciplined, and compounding.

Bootstrapping forces clarity that excessive capital often conceals.

Would you choose bootstrapping or venture capital for your next venture? Let me know in the comments.`,
    position: 0,
  },

  // X (Twitter)
  {
    id: 'out-x-thread',
    project_id: INITIAL_PROJECT_ID,
    platform: 'x',
    content_type: 'thread',
    content: `We bootstrapped our SaaS to $1M ARR with $0 funding.

No venture backing. No paid ads. Just relentless execution.

Here are the 7 counter-intuitive rules we followed: 🧵👇

1/ Validate manually before writing a single line of backend code.
If people won't preorder from a Figma prototype, they won't pay for your code either.

2/ Cold outreach is alive if you lead with bespoke value.
Never pitch on DM #1. Send an audit or a teardown showing how you save them time.

3/ Churn is your only real enemy in year one.
Fix the leaky bucket before spending energy filling it. Retention creates referral loops.

4/ Build in public.
People connect with human founders, not faceless corporate brands. Share your numbers, mistakes, and milestones.

5/ Charge from day one.
Free users give bad product feedback. Paying customers tell you what truly matters.

6/ Automate operations only after doing them manually 50 times.
Understand the friction point firsthand before writing a script.

7/ Profitability equals freedom.
When you control your burn rate, you control your destiny.

If you found this useful:
1. Retweet the first tweet to share with fellow builders.
2. Follow @founder for weekly SaaS blueprints.`,
    position: 0,
  },
];

const INITIAL_PROJECTS: Project[] = [
  {
    id: INITIAL_PROJECT_ID,
    title: 'How I Built a 7-Figure SaaS With Zero Funding',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    notes: 'Comprehensive breakdown on bootstrapping from bedroom to $1M ARR. Covers manual outreach, validation, product-led growth, and avoiding premature hiring.',
    status: 'complete',
    error: null,
    created_at: new Date(Date.now() - 3600 * 1000 * 24 * 2).toISOString(),
  },
  {
    id: 'demo-project-2',
    title: 'AI Engineering in 2026: Systems Architecture',
    video_url: 'https://youtube.com/watch?v=sample-ai-video',
    notes: 'Technical architectural patterns for asynchronous video analysis, queue workers, and modular AI integrations.',
    status: 'complete',
    error: null,
    created_at: new Date(Date.now() - 3600 * 1000 * 24 * 5).toISOString(),
  },
];

const INITIAL_PROFILE: CreatorProfile = {
  name: 'Alex Rivera',
  email: 'alex@creatorstudio.co',
  niche: 'Tech, SaaS & Solopreneurship',
  audience: 'Startup founders, developers, and creators',
  language: 'English',
  tone: 'Inspirational',
};

class ProjectService {
  private projects: Project[] = [];
  private outputs: ContentOutput[] = [];
  private profile: CreatorProfile = INITIAL_PROFILE;

  constructor() {
    this.load();
  }

  private load() {
    try {
      const p = localStorage.getItem('vireo_projects');
      const o = localStorage.getItem('vireo_outputs');
      const pr = localStorage.getItem('vireo_profile');

      this.projects = p ? JSON.parse(p) : INITIAL_PROJECTS;
      this.outputs = o ? JSON.parse(o) : INITIAL_OUTPUTS;
      this.profile = pr ? JSON.parse(pr) : INITIAL_PROFILE;
    } catch {
      this.projects = INITIAL_PROJECTS;
      this.outputs = INITIAL_OUTPUTS;
      this.profile = INITIAL_PROFILE;
    }
  }

  private save() {
    try {
      localStorage.setItem('vireo_projects', JSON.stringify(this.projects));
      localStorage.setItem('vireo_outputs', JSON.stringify(this.outputs));
      localStorage.setItem('vireo_profile', JSON.stringify(this.profile));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  getProjects(): Project[] {
    return [...this.projects];
  }

  getProject(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id);
  }

  getOutputs(projectId: string): ContentOutput[] {
    return this.outputs.filter((o) => o.project_id === projectId);
  }

  getProfile(): CreatorProfile {
    return { ...this.profile };
  }

  updateProfile(profile: Partial<CreatorProfile>): CreatorProfile {
    this.profile = { ...this.profile, ...profile };
    this.save();
    return this.profile;
  }

  createProject(title: string, videoUrl: string | null, notes: string): Project {
    const newProj: Project = {
      id: 'proj-' + Date.now(),
      title: title.trim() || 'Untitled Video Project',
      video_url: videoUrl,
      notes: notes.trim(),
      status: 'queued',
      error: null,
      created_at: new Date().toISOString(),
    };

    this.projects.unshift(newProj);
    this.save();

    // Trigger simulated multi-stage processing progression
    this.simulatePipeline(newProj.id);

    return newProj;
  }

  updateOutputContent(outputId: string, content: string): boolean {
    const item = this.outputs.find((o) => o.id === outputId);
    if (!item) return false;
    item.content = content;
    this.save();
    return true;
  }

  deleteProject(id: string): boolean {
    this.projects = this.projects.filter((p) => p.id !== id);
    this.outputs = this.outputs.filter((o) => o.project_id !== id);
    this.save();
    return true;
  }

  private simulatePipeline(projectId: string) {
    const stages: Array<{ status: Project['status']; delay: number }> = [
      { status: 'transcribing', delay: 1200 },
      { status: 'analyzing', delay: 2800 },
      { status: 'generating', delay: 4500 },
      { status: 'complete', delay: 6500 },
    ];

    stages.forEach(({ status, delay }) => {
      setTimeout(() => {
        const p = this.projects.find((item) => item.id === projectId);
        if (p && p.status !== 'failed') {
          p.status = status;
          if (status === 'complete') {
            // Generate standard outputs based on project title
            this.generateOutputsForProject(p);
          }
          this.save();
          // Dispatch custom event so listeners can re-render reactively
          window.dispatchEvent(new CustomEvent('vireo_project_updated', { detail: { projectId, status } }));
        }
      }, delay);
    });
  }

  private generateOutputsForProject(project: Project) {
    // Clone demo outputs with adjusted title keywords
    const newOutputs: ContentOutput[] = INITIAL_OUTPUTS.map((out) => ({
      ...out,
      id: 'out-' + Math.random().toString(36).substring(2, 9),
      project_id: project.id,
      content: out.content.replace(/How I Built a \$1M SaaS/g, project.title),
    }));
    this.outputs.push(...newOutputs);
    this.save();
  }
}

export const projectService = new ProjectService();
