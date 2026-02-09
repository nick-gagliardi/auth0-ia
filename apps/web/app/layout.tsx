import type { ReactNode } from 'react';

export const metadata = {
  title: 'Auth0 IA (Docs Graph)',
  description: 'Docs intelligence layer for Auth0 docs-v2'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontWeight: 700 }}>Auth0 IA — Docs Graph</div>
          <div style={{ fontSize: 13, color: '#555' }}>
            Search + explain pages/snippets via a weekly-built index
          </div>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </body>
    </html>
  );
}
