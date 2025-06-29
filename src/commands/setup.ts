import chalk from 'chalk';
import { checkHostCommand } from '../lib/system.js';
import { ensureAndroidNdk, ensureQnnSdk, ensureHexagonSdk } from '../lib/sdk.js';

export async function setupAction() {
    console.log(chalk.blue('🚀  开始设置开发环境...'));
    await checkHostCommand('wget');
    await checkHostCommand('xzcat');
    await checkHostCommand('unzip');
    await ensureAndroidNdk();
    await ensureQnnSdk();
    await ensureHexagonSdk();
    console.log(chalk.green.bold('🎉  环境设置完成！'));
} 