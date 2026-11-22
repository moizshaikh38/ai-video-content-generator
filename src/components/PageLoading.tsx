import React from 'react';

export const PageLoading: React.FC = () => (
  <div className="flex min-h-[45vh] w-full items-center justify-center bg-black" role="status" aria-label="Loading page">
    <span className="h-7 w-7 animate-spin rounded-full border-2 border-violet-500/25 border-t-violet-400 motion-reduce:animate-none" style={{ animationDuration: '600ms' }} aria-hidden="true" />
    <span className="sr-only">Loading page...</span>
  </div>
);
