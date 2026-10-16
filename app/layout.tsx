import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NRF 2027 Venue RFPs | Impact Analytics',
  description: 'Shortlist, RFP outreach and quote tracking for two evenings around NRF 2027 in New York.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#264CD7' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500&family=Spectral:ital,wght@0,300;1,300&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
