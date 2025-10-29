// ✅ Load environment variables FIRST (before anything else)
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve .env.backend path (one level up from src/)
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.backend');
dotenv.config({ path: envPath });

// Debug check – ensure .env loaded
console.log('✅ Loaded SUPABASE_URL:', process.env.SUPABASE_URL || '❌ Missing');

// -------------------------------------------------------------
// Import core dependencies (safe to import now)
import express from 'express';
import cors from 'cors';
import errorHandler from './middleware/errorHandler.js';
import authMiddleware from './middleware/auth.js';
import cacheMiddleware from './middleware/cache.js';

// -------------------------------------------------------------
// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// -------------------------------------------------------------
// Global Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// -------------------------------------------------------------
// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// -------------------------------------------------------------
// ✅ Dynamically import routes AFTER dotenv is loaded
const { default: dashboardRoutes } = await import('./routes/dashboard.js');
const { default: analysisRoutes } = await import('./routes/analysis.js');
const { default: assetsRoutes } = await import('./routes/assets.js');
const { default: stockRoutes } = await import('./routes/stocks.js');

// Attach routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/stock', stockRoutes);

// -------------------------------------------------------------
// Error handler middleware
app.use(errorHandler);

// -------------------------------------------------------------
// Start the server
app.listen(PORT, () => {
  console.log(`\n✅ Portfolio Tracker Backend running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard API: http://localhost:${PORT}/api/dashboard/asset-allocation`);
  console.log(`📈 Analysis Dashboard: http://localhost:${PORT}/api/analysis/dashboard`);
  console.log(`📋 Analysis Summary: http://localhost:${PORT}/api/analysis/summary`);
  console.log(`📊 Free Stocks: http://localhost:${PORT}/api/analysis/free-stocks`);
  console.log(`📈 Stock - Open Holdings: http://localhost:${PORT}/api/stock/open`);
  console.log(`📈 Stock - Closed Holdings: http://localhost:${PORT}/api/stock/closed`);
  console.log(`📈 Stock - ETF: http://localhost:${PORT}/api/stock/etf`);
  console.log(`📈 Stock - Portfolio: http://localhost:${PORT}/api/stock/portfolio`);
  console.log(`🏦 Assets - Bank: http://localhost:${PORT}/api/assets/bank`);
  console.log(`🏦 Assets - NPS: http://localhost:${PORT}/api/assets/nps`);
  console.log(`🏦 Assets - BDM: http://localhost:${PORT}/api/assets/bdm`);
  console.log(`🏦 Assets - EPF: http://localhost:${PORT}/api/assets/epf`);
  console.log(`🏦 Assets - PPF: http://localhost:${PORT}/api/assets/ppf`);
  console.log(`💰 Assets - MF: http://localhost:${PORT}/api/assets/mf`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health\n`);
});
