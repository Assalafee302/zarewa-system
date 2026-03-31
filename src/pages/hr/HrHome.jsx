import React from 'react';
import { Link } from 'react-router-dom';
import { MainPanel, PageHeader } from '../../components/layout';

export default function HrHome() {
  return (
    <MainPanel>
      <PageHeader title="Human resources" subtitle="Directory, payroll, attendance, and staff loans." />
      <p className="text-sm text-slate-600">Use the tabs above to open a section.</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-violet-700">
        <li>
          <Link className="hover:underline" to="/hr/staff">
            Staff directory
          </Link>
        </li>
        <li>
          <Link className="hover:underline" to="/hr/payroll">
            Payroll runs
          </Link>
        </li>
        <li>
          <Link className="hover:underline" to="/hr/salary-welfare">
            Salary &amp; welfare
          </Link>
        </li>
      </ul>
    </MainPanel>
  );
}
