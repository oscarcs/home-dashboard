import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Home Dashboard',
  description: 'E-Paper home dashboard for weather, calendar, and more',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
