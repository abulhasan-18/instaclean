import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InstaClean • Bulk Unlike & Delete Comments',
  description: 'Clean your digital footprint by mass unliking Instagram posts and deleting old comments safely.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#08090d] text-gray-100 antialiased selection:bg-pink-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
