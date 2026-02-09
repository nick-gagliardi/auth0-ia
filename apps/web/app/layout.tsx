import type { ReactNode } from 'react';
import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Auth0 IA (Docs Graph)',
  description: 'Docs intelligence layer for Auth0 docs-v2'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
