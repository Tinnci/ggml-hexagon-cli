import chalk from 'chalk';
import { checkHostCommand } from '../lib/system.js';
import { ensureAndroidNdk, ensureQnnSdk, ensureHexagonSdk } from '../lib/sdk.js';
import { GLOBAL_YES } from '../state.js';
import inquirer from 'inquirer';

export async function setupAction() {
    console.log(chalk.blue('🚀  开始设置开发环境...'));

    if (!GLOBAL_YES) {
        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: '即将开始环境设置，可能会下载并解压多个SDK，此过程可能耗时较长。要继续吗？',
            default: true,
        }]);
        if (!confirm) {
            console.log(chalk.yellow('操作已取消。'));
            return;
        }
    }

    await checkHostCommand('wget');
    await checkHostCommand('xzcat');
    await checkHostCommand('unzip');
    await ensureAndroidNdk();
    await ensureQnnSdk();
    await ensureHexagonSdk();
    console.log(chalk.green.bold('🎉  环境设置完成！'));
} 