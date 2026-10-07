import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Cardshop shader lab' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#080808] text-[#F5F3EF]">{children}</body>
    </html>
  );
}
