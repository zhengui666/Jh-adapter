#!/usr/bin/env node
/**
 * 部署后自动配置 D1 数据库绑定
 * 使用 Cloudflare API 更新 Worker 的绑定配置，避免在 wrangler.toml 中硬编码
 */

const https = require('https');

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const WORKER_NAME = process.env.WORKER_NAME || 'jh-adapter-backend';
const D1_DATABASE_NAME = process.env.D1_DATABASE_NAME || 'JH_ADAPTER_DB';
const D1_DATABASE_ID = process.env.D1_DATABASE_ID;

if (!CLOUDFLARE_API_TOKEN) {
  console.error('❌ Error: CLOUDFLARE_API_TOKEN is not set');
  process.exit(1);
}

if (!CLOUDFLARE_ACCOUNT_ID) {
  console.error('❌ Error: CLOUDFLARE_ACCOUNT_ID is not set');
  process.exit(1);
}

if (!D1_DATABASE_ID) {
  console.error('❌ Error: D1_DATABASE_ID is not set');
  process.exit(1);
}

console.log(`🔧 Configuring D1 binding for Worker: ${WORKER_NAME}`);
console.log(`   Database: ${D1_DATABASE_NAME} (ID: ${D1_DATABASE_ID})`);

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function configureD1Binding() {
  try {
    // 使用 Cloudflare API 更新 Worker 的绑定
    // 注意：需要通过 Workers Scripts API 的 settings 端点来更新绑定
    
    // 首先获取当前 Worker 的设置
    const settingsResponse = await makeRequest('GET', `/workers/services/${WORKER_NAME}`);
    
    if (!settingsResponse.success) {
      // 如果 GET 失败，尝试直接 PUT（创建新配置）
      console.log('⚠️  Worker settings not found, creating new binding configuration...');
    }

    // 准备 D1 绑定配置
    const d1Binding = {
      type: 'd1_database',
      name: 'DB',
      database_id: D1_DATABASE_ID,
      database_name: D1_DATABASE_NAME,
    };

    // 使用 Workers Scripts Settings API 更新绑定
    // 注意：这个 API 可能需要完整的 settings 对象，包括其他现有绑定
    const updateData = {
      bindings: [d1Binding],
    };

    const updateResponse = await makeRequest(
      'PUT',
      `/workers/scripts/${WORKER_NAME}/bindings`,
      updateData
    );

    // 如果上面的端点不存在，尝试使用 Workers Scripts API
    if (!updateResponse.success && updateResponse.errors?.[0]?.code === 10000) {
      console.log('⚠️  Trying alternative API endpoint...');
      
      // 使用 Workers Scripts 的 settings 端点
      const altResponse = await makeRequest(
        'PATCH',
        `/workers/scripts/${WORKER_NAME}`,
        {
          bindings: [d1Binding],
        }
      );

      if (altResponse.success) {
        console.log('✅ Successfully configured D1 binding (via alternative endpoint)');
        console.log(`   Binding: DB -> ${D1_DATABASE_NAME} (${D1_DATABASE_ID})`);
        return;
      }
    }

    if (updateResponse.success) {
      console.log('✅ Successfully configured D1 binding');
      console.log(`   Binding: DB -> ${D1_DATABASE_NAME} (${D1_DATABASE_ID})`);
    } else {
      console.error('❌ Error: Failed to configure D1 binding');
      console.error('Response:', JSON.stringify(updateResponse, null, 2));
      console.error('');
      console.error('💡 Tip: You may need to configure the D1 binding manually in Cloudflare Dashboard:');
      console.error('   1. Go to Workers & Pages → Your Worker → Settings → Variables');
      console.error('   2. Add a D1 Database binding');
      console.error(`   3. Name: DB, Database: ${D1_DATABASE_NAME}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('💡 Tip: You may need to configure the D1 binding manually in Cloudflare Dashboard');
    process.exit(1);
  }
}

configureD1Binding();

