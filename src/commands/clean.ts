import chalk from 'chalk';
import fsExtra from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';

import { config } from '../../config.js';
import { GLOBAL_YES } from '../state.js';

export async function cleanAction() {
    const buildDir = path.join(config.PROJECT_ROOT_PATH, 'out', 'android');
    if (await fsExtra.pathExists(buildDir)) {
        console.log(chalk.yellow(`将要清理构建目录: ${buildDir}`));
        if (!GLOBAL_YES) {
            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: '确定要删除吗?',
                default: true,
            }]);
            if (!confirm) {
                console.log(chalk.yellow('操作已取消。'));
                return;
            }
        }
        await fsExtra.remove(buildDir);
        console.log(chalk.green('清理完成。'));
    } else {
        console.log(chalk.yellow('构建目录不存在，无需清理。'));
    }
} 