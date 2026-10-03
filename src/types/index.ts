export interface HealthCheckResponse {
  status: 'ok' | 'error';
}

export interface ProjectPlaceholder {
  id: string;
  title: string;
  sourceUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  duration?: string;
  contentTypes?: string[];
}

export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  iconName: string;
  tag: string;
}

export interface StepItem {
  step: number;
  title: string;
  description: string;
}
