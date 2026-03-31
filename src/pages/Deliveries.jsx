import { Navigate } from 'react-router-dom';

/**
 * Deliveries are managed under Production (not a top-level nav item).
 * Route kept for bookmarks and deep links only.
 */
export default function Deliveries() {
  return <Navigate to="/operations" replace state={{ focusOpsTab: 'deliveries' }} />;
}
