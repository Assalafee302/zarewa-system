import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { PageHeader, PageShell, MainPanel } from '../components/layout';

const NotFound = () => {
  return (
    <PageShell>
      <PageHeader eyebrow="Workspace" title="Page not found" subtitle="That route does not exist in this workspace." />
      <MainPanel className="max-w-lg">
        <p className="text-sm text-gray-600 mb-6">
          Check the sidebar for available modules, or return to the dashboard.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 z-btn-primary no-underline"
        >
          <Home size={16} /> Back to dashboard
        </Link>
      </MainPanel>
    </PageShell>
  );
};

export default NotFound;
