import { ReactNode } from 'react';
import type { Metadata } from 'next';
import { AdminShell } from './_components/AdminNav';
import './admin.css';

// Standalone admin chrome — does not share the public nav.
// Auth gate is enforced client-side inside each page (acceptable for the
// static-export model).
// PWA del panel (fase 6): manifest propio, con inicio y alcance en /admin/.
export const metadata: Metadata = { manifest: '/icons/admin.webmanifest' };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
