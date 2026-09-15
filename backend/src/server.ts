import express, { Express } from 'express';
import cors from 'cors';
import { validateEnv, getEnv } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import incomeRoutes from './routes/income';
import recruitmentRoutes from './routes/recruitment';
import peopleRoutes from './routes/people';
import proposalRoutes from './routes/proposals';
import payrollRoutes from './routes/payroll';
import orgRoutes from './routes/org';
import expenseRoutes from './routes/expenses';

// Initialize Express app
const app: Express = express();

// Middleware
// 12mb: photos/logos/PO documents travel as base64 data URIs in JSON bodies
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ limit: '12mb', extended: true }));

// CORS Configuration
const corsOptions = {
  origin: getEnv().CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Aveon HR API v1',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      income: '/api/income',
    },
  });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/expenses', expenseRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Validate environment
    validateEnv();

    // Connect to database
    try {
      await connectDatabase();
    } catch (dbError) {
      console.warn('⚠ Database connection delayed, will retry on first request');
    }

    // Start listening
    const port = getEnv().PORT;
    app.listen(port, () => {
      console.log(`
╔════════════════════════════════════════╗
║    Aveon HR API Server                 ║
║    Environment: ${getEnv().NODE_ENV.padEnd(16)}           ║
║    Port: ${port.toString().padEnd(28)}║
║    Status: Running                     ║
╚════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await disconnectDatabase();
  process.exit(0);
});

// Start the server
startServer();

export default app;
