import React from 'react';
import { Outlet } from 'react-router-dom';
import { PageLoading } from '../components/PageLoading';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

export const RootLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1 w-full">
        <React.Suspense fallback={<PageLoading />}><Outlet /></React.Suspense>
      </main>
      <Footer />
    </div>
  );
};
