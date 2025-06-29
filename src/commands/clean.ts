import chalk from 'chalk';
import fsExtra from 'fs-extra';
import path from 'path';

import { config } from '../../config.js';

export async function cleanAction() {
    const buildDir = path.join(config.PROJECT_ROOT_PATH, 'out', 'android');
    if (await fsExtra.pathExists(buildDir)) {
        console.log(chalk.blue(`清理构建目录: ${buildDir}`));
        await fsExtra.remove(buildDir);
        console.log(chalk.green('清理完成。'));
    } else {
        console.log(chalk.yellow('构建目录不存在，无需清理。'));
    }
} 