import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { Button } from '../components/Button';
import { Container } from '../components/Container';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="py-24 text-center">
      <Container size="sm">
        <div className="space-y-4">
          <p className="text-6xl font-black text-indigo-500 font-mono">404</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Page Not Found</h1>
          <p className="text-slate-400 max-w-sm mx-auto text-sm leading-relaxed">
            The page you are looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="pt-4">
            <Link to="/">
              <Button variant="primary" size="md" leftIcon={<Home className="w-4 h-4" />}>
                Return Home
              </Button>
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
};
