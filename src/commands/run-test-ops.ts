import chalk from 'chalk';
import path from 'path';
import fsExtra from 'fs-extra';
const { pathExists } = fsExtra;

import { config } from '../../config.js';
import { checkAndPushQnnLibs } from '../lib/adb.js';
import { executeCommand } from '../lib/system.js';

const REMOTE_ANDROID_PATH = '/data/local/tmp/';

export async function runTestOpsAction(options: { backend: string, op?: string }) {
    console.log(chalk.blue('🚀  准备运行 test-backend-ops...'));

    // 确保核心库已存在于设备上
    await checkAndPushQnnLibs();

    // 推送 test-backend-ops 可执行文件
    const testOpsPath = path.join(config.PROJECT_ROOT_PATH, `out/android/${options.backend}/bin/test-backend-ops`);
    if (!(await pathExists(testOpsPath))) {
        console.log(chalk.red(`test-backend-ops 可执行文件未找到: ${testOpsPath}`));
        console.log(chalk.yellow('请先运行 ' + chalk.cyan(`ggml-hexagon-cli build --backend ${options.backend}`) + ' 命令。'));
        return;
    }
    await executeCommand('adb', ['push', testOpsPath, REMOTE_ANDROID_PATH]);
    await executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/test-backend-ops`]);

    let remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./test-backend-ops test`;

    if (options.op) {
        remoteCommand += ` -o ${options.op}`;
    }

    await executeCommand('adb', ['shell', remoteCommand]);
} 