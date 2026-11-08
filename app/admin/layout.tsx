import { ReactNode } from 'react';
import { AdminShell } from './_components/AdminNav';
import './admin.css';

// Standalone admin chrome — does not share the public nav.
// Auth gate is enforced client-side inside each page (acceptable for the
// static-export model).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
