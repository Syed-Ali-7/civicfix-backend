const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./src/routes/authRoutes');
const issueRoutes = require('./src/routes/issueRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const demoRoutes = require('./src/routes/demoRoutes');
const userRoutes = require('./src/routes/userRoutes');
const errorHandler = require('./src/middleware/errorHandler');
const { connectDB, sequelize } = require('./src/config/db');
// SLA TRACKER: Background service for SLA breach escalation
const slaEscalationService = require('./src/services/slaEscalationService');
const fs = require('fs');

dotenv.config();

if (!process.env.RESEND_API_KEY) {
  console.warn(
    '[EMAIL] Warning: Resend API key not set. Escalation emails will be skipped.'
  );
}

const logAIPipelineStatus = () => {
  const pipelinePath = path.resolve(process.cwd(), 'ai', 'ai_pipeline.py');
  const exists = fs.existsSync(pipelinePath);
  console.log(`[AI] Resolved pipeline path: ${pipelinePath}`);
  if (!exists) {
    console.error('[AI] ai_pipeline.py not found. AI pipeline will use safe defaults.');
  }
};

const app = express();

// Define CORS options
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root route
app.get('/', (req, res) => {
  res.send('CivicFix Backend running');
});

app.get('/health', (req, res) => {
  console.log(
    `📨 Health check from: ${req.ip || req.connection.remoteAddress}`
  );
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/health', (req, res) => {
  console.log(
    `📨 POST Health check from: ${req.ip || req.connection.remoteAddress}`
  );
  res.json({
    status: 'ok',
    method: 'POST',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
// DEMO CONTROLS
app.use('/api/demo', demoRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await sequelize.sync();

    logAIPipelineStatus();

    // SLA TRACKER: Start hourly escalation checks
    slaEscalationService.start();

    app.listen(PORT, '0.0.0.0', () => {
      const os = require('os');
      const networkInterfaces = os.networkInterfaces();
      let ipv4Address = '127.0.0.1';
      
      // Get all IPv4 addresses, excluding virtual and internal ones
      const allAddresses = [];
      for (const name of Object.keys(networkInterfaces)) {
        // Skip known virtual adapters
        if (name.toLowerCase().includes('virtual') || 
            name.toLowerCase().includes('vethernet') || 
            name.toLowerCase().includes('vmware') ||
            name.toLowerCase().includes('hyperv') ||
            name === 'VirtualBox Host-Only Ethernet Adapter') {
          continue;
        }
        
        for (const iface of networkInterfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
            allAddresses.push({
              address: iface.address,
              name: name,
              mac: iface.mac
            });
          }
        }
      }
      
      // Pick the most likely real address (usually the first non-virtual one)
      if (allAddresses.length > 0) {
        ipv4Address = allAddresses[0].address;
      }
      
      console.log(
        `🚀 Server is running on port ${PORT} (listening on 0.0.0.0)`
      );
      console.log(`✅ IPv4 Address: ${ipv4Address}`);
      console.log(`✅ Accessible at: http://${ipv4Address}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
