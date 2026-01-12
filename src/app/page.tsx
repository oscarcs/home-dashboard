import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        Home Dashboard
      </h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        E-Paper home dashboard for weather, calendar, and more
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link
          href="/dashboard"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#000',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '0.5rem'
          }}
        >
          Open Dashboard
        </Link>
        <Link
          href="/admin"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#666',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '0.5rem'
          }}
        >
          Admin Panel
        </Link>
        <Link
          href="/test-services"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#059669',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '0.5rem'
          }}
        >
          Test Services
        </Link>
        <Link
          href="/preview"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#3b36cbff',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '0.5rem'
          }}
        >
          Preview Mode
        </Link>
      </div>
    </div>
  );
}
