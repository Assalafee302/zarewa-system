import { Navigate } from 'react-router-dom';

/** Bookmarks / old links → Sales workspace, Customers tab */
export default function Customers() {
  return <Navigate to="/sales" replace state={{ focusSalesTab: 'customers' }} />;
}
