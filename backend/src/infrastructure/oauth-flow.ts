/**
 * OAuth Flow - OAuth流程处理
 */
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../../');

export function triggerOAuthSetupAsync(): void {
  const script = join(PROJECT_ROOT, 'oauth-setup.ts');
  // 在后台启动oauth-setup脚本
  spawn('tsx', [script], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    detached: true,
  }).unref();
}

