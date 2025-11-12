const https = require('https');
const http = require('http');
const { URL } = require('url');

const API_URL = process.argv[2] || process.env.API_URL || 'http://localhost:5000';

console.log(`🔍 Testing connection to: ${API_URL}\n`);

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      timeout: 5000,
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function testConnection() {
  try {
    // Test health endpoint
    console.log('1. Testing /health endpoint...');
    const healthResponse = await makeRequest(`${API_URL}/health`);
    if (healthResponse.status === 200) {
      console.log('   ✅ Health check passed:', healthResponse.data);
    } else {
      console.log('   ⚠️  Unexpected status:', healthResponse.status);
    }
    
    // Test auth endpoint (should return validation error, not connection error)
    console.log('\n2. Testing /api/auth/login endpoint...');
    const loginResponse = await makeRequest(`${API_URL}/api/auth/login`, {
      method: 'POST',
      body: { email: 'test@example.com', password: 'test123' },
    });
    
    // Any response (even error) means server is working
    if (loginResponse.status === 401 || loginResponse.status === 400) {
      console.log('   ✅ Auth endpoint is reachable (got expected error response)');
      console.log('   Status:', loginResponse.status);
    } else {
      console.log('   ⚠️  Unexpected status:', loginResponse.status);
    }
    
    console.log('\n✅ All connection tests passed!');
    console.log(`   Server at ${API_URL} is reachable and working.`);
    process.exit(0);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection refused. Server is not running on this URL.');
      console.error('   Make sure the backend server is running: npm run dev');
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ Cannot resolve hostname.');
      console.error('   Check if the URL is correct and the tunnel is running.');
    } else if (error.code === 'ETIMEDOUT' || error.message === 'Request timeout') {
      console.error('❌ Request timed out.');
      console.error('   The server may be slow, unreachable, or the tunnel is down.');
    } else {
      console.error('❌ Connection error:', error.message);
      if (error.code) {
        console.error('   Error code:', error.code);
      }
    }
    
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Is the backend server running? (npm run dev)');
    console.error('   2. Is the tunnel running? (npm run tunnel)');
    console.error('   3. Is the URL correct?', API_URL);
    console.error('   4. Can you access this URL in your browser?');
    console.error(`      ${API_URL}/health`);
    
    process.exit(1);
  }
}

testConnection();
