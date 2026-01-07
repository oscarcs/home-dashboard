import express, { Application, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { applyMiddleware } from './lib/middleware.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app: Application = express();
const PORT = parseInt(process.env.PORT || '7272', 10);
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', './views');

// Static file serving
app.use('/styles', express.static('views/styles', {
  setHeaders: (res, path) => {
    if (path.endsWith('.otf') || path.endsWith('.ttf') || path.endsWith('.woff') || path.endsWith('.woff2')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

app.use('/assets', express.static('views/assets', {
  setHeaders: (res, path) => {
    if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.svg')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Body parsing
app.use(express.json());

// Apply all standard middleware
applyMiddleware(app);

// Mount route modules
app.use('/', adminRoutes);
app.use('/', dashboardRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const baseUrl = `http://localhost:${PORT}`;
  console.log(`Server listening on ${baseUrl}`);
  console.log(`Network access: http://0.0.0.0:${PORT}`);

  console.log(`Dashboard page: ${baseUrl}/dashboard`);
  console.log(`Admin page: ${baseUrl}/admin`);
});

export default app; // For testing
