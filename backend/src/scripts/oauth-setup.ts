/**
 * OAuth Setup Script - OAuth配置脚本
 * 
 * 一次性GitLab OAuth授权配置
 */
import { createServer } from 'http';
import { parse } from 'url';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import readline from 'readline';
import { SQLiteSettingRepository } from '../infrastructure/sqlite-repositories.js';

// 动态导入open（可选依赖）
async function tryOpen(url: string): Promise<void> {
  try {
    const openModule = await import('open');
    await openModule.default(url);
  } catch {
    // open包不存在，忽略
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../../');
const CONFIG_PATH = join(PROJECT_ROOT, 'jihu_oauth_config.json');

const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PORT = 8000;
const CALLBACK_PATH = '/auth/oauth-callback';
const CALLBACK_URL = `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`;
const GITLAB_INSTANCE = 'https://jihulab.com';

interface OAuthResult {
  code: string | null;
  error: string | null;
}

async function runLocalServer(result: OAuthResult): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url || '', true);
      
      if (parsedUrl.pathname?.startsWith(CALLBACK_PATH)) {
        const code = parsedUrl.query.code as string | undefined;
        const error = parsedUrl.query.error as string | undefined;
        
        result.code = code || null;
        result.error = error || null;
        
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>OAuth 已完成，可以回到终端。</h2><p>You may close this window.</p></body></html>');
        
        setTimeout(() => {
          server.close();
          resolve();
        }, 1000);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
      console.log(`正在本地监听 ${CALLBACK_URL} 等待回调...`);
    });
  });
}

async function main(): Promise<void> {
  console.log('=== Jihu GitLab OAuth 一次性配置向导 ===\n');
  console.log('首先，你需要在浏览器中访问以下链接创建 GitLab 应用：');
  console.log('https://jihulab.com/-/user_settings/applications\n');
  console.log('创建应用时请注意：');
  console.log('- 名称：任意填写，如 \'coderider-backend\'');
  console.log(`- 重定向 URI：${CALLBACK_URL}`);
  console.log('- 权限范围：勾选 \'api\' 权限');
  console.log('- 创建后，复制 Application ID 和 Secret\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  // 检查是否已有配置
  let clientId = '';
  let clientSecret = '';
  
  // 检查SQLite中是否有保存的配置
  const settingRepo = new SQLiteSettingRepository();
  const savedClientId = settingRepo.get('client_id');
  const savedClientSecret = settingRepo.get('client_secret');
  
  if (savedClientId && savedClientSecret) {
    clientId = savedClientId;
    clientSecret = savedClientSecret;
    console.log('检测到已保存的 GitLab Application 配置，将直接复用：');
    console.log(`- client_id: ${clientId.slice(0, 4)}...${clientId.slice(-4)}`);
    console.log('- client_secret: ****（已隐藏）');
    const confirm = await question('按回车继续使用已有配置，或输入 \'n\' 重新录入: ');
    if (confirm.toLowerCase() === 'n') {
      clientId = '';
      clientSecret = '';
    }
  } else if (existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      if (config.client_id && config.client_secret) {
        clientId = config.client_id;
        clientSecret = config.client_secret;
        console.log('检测到已保存的 GitLab Application 配置，将直接复用：');
        console.log(`- client_id: ${clientId.slice(0, 4)}...${clientId.slice(-4)}`);
        console.log('- client_secret: ****（已隐藏）');
        const confirm = await question('按回车继续使用已有配置，或输入 \'n\' 重新录入: ');
        if (confirm.toLowerCase() === 'n') {
          clientId = '';
          clientSecret = '';
        }
      }
    } catch {}
  }

  if (!clientId || !clientSecret) {
    clientId = await question('请输入 GitLab 应用的 Application ID (client_id): ');
    clientSecret = await question('请输入 GitLab 应用的 Secret (client_secret): ');
    
    if (!clientId || !clientSecret) {
      console.error('client_id / client_secret 不能为空');
      process.exit(1);
    }
  }

  // 保存client_id和client_secret到SQLite（如果还没有保存）
  if (!savedClientId || !savedClientSecret) {
    settingRepo.set('client_id', clientId);
    settingRepo.set('client_secret', clientSecret);
  }

  const authUrl = `${GITLAB_INSTANCE}/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&response_type=code&scope=api`;

  console.log('\n在浏览器中打开以下链接完成授权：');
  console.log(authUrl);
  await tryOpen(authUrl);
  console.log('（已尝试自动打开浏览器，如果未打开请手动复制上方链接）');

  const result: OAuthResult = { code: null, error: null };
  await runLocalServer(result);

  if (result.error) {
    console.error(`OAuth 失败: ${result.error}`);
    process.exit(1);
  }
  if (!result.code) {
    console.error('在超时时间内未收到 OAuth 回调。');
    process.exit(1);
  }

  console.log('已收到授权 code，正在向 GitLab 交换 access_token / refresh_token...');

  const tokenUrl = `${GITLAB_INSTANCE}/oauth/token`;
  try {
    const response = await axios.post(tokenUrl, {
      grant_type: 'authorization_code',
      code: result.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: CALLBACK_URL,
    });

    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    if (!accessToken || !refreshToken) {
      console.error('返回中缺少 access_token 或 refresh_token:');
      console.error(JSON.stringify(response.data, null, 2));
      process.exit(1);
    }

    const cfg = {
      client_id: clientId,
      client_secret: clientSecret,
      access_token: accessToken,
      refresh_token: refreshToken,
      redirect_uri: CALLBACK_URL,
    };

    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');

    // 保存到SQLite
    settingRepo.set('access_token', accessToken);
    settingRepo.set('refresh_token', refreshToken);
    settingRepo.set('redirect_uri', CALLBACK_URL);

    console.log('\n已写入配置到文件:', CONFIG_PATH);
    console.log('并已将 GitLab Application 的 client_id / client_secret 持久化到 SQLite。');
    console.log('\n后续再次运行 oauth-setup 时，若检测到已有配置，将默认直接复用。');
    console.log('\n你现在可以启动后端，例如：');
    console.log('  cd backend && npm run dev');
  } catch (error: any) {
    console.error(`交换 token 失败: HTTP ${error.response?.status} ${error.response?.data}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(console.error);

