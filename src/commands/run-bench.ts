import chalk from 'chalk';
import path from 'path';
import fsExtra from 'fs-extra';
const { pathExists } = fsExtra;

import { config } from '../../config.js';
import { checkAndPushQnnLibs } from '../lib/adb.js';
import { checkAndDownloadPrebuiltModel } from '../lib/models.js';
import { executeCommand } from '../lib/system.js';

const REMOTE_ANDROID_PATH = '/data/local/tmp/';

export async function runBenchAction(options: { modelPath: string }) {
    console.log(chalk.blue('🚀  准备运行 llama-bench...'));

    // 确保核心库和可执行文件已存在于设备上
    await checkAndPushQnnLibs();
    await checkAndDownloadPrebuiltModel(); // 确保默认模型已在设备上

    // 推送 llama-bench 可执行文件
    const llamaBenchPath = path.join(config.PROJECT_ROOT_PATH, 'out/android/bin/llama-bench');
    if (!(await pathExists(llamaBenchPath))) {
        console.log(chalk.red(`llama-bench 可执行文件未找到: ${llamaBenchPath}`));
        console.log(chalk.yellow('请先运行 ' + chalk.cyan('ggml-hexagon-cli build') + ' 命令。'));
        return;
    }
    await executeCommand('adb', ['push', llamaBenchPath, REMOTE_ANDROID_PATH]);
    await executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-bench`]);

    // 构造运行命令
    const remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./llama-bench -m ${options.modelPath} ${config.RUNNING_PARAMS}`;
    await executeCommand('adb', ['shell', remoteCommand]);
} 