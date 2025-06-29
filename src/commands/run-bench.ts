import chalk from 'chalk';
import path from 'path';
import fsExtra from 'fs-extra';
const { pathExists } = fsExtra;

import { config } from '../../config.js';
import { checkAndPushQnnLibs } from '../lib/adb.js';
import { checkAndDownloadPrebuiltModel } from '../lib/models.js';
import { executeCommand } from '../lib/system.js';

const REMOTE_ANDROID_PATH = '/data/local/tmp/';
const REMOTE_MODEL_PATH = '/sdcard/';

export async function runBenchAction(options: { backend: string, model: string }) {
    console.log(chalk.blue('🚀  准备运行 llama-bench...'));

    await checkAndPushQnnLibs();

    let remoteModelPath = options.model;
    // 检查提供的 model 路径是否是默认的远程路径
    if (!options.model.startsWith('/sdcard/')) {
        // 如果不是，假定它是一个本地路径
        const localModelPath = options.model;
        if (!(await pathExists(localModelPath))) {
            console.error(chalk.red(`错误：指定的模型文件不存在: ${localModelPath}`));
            return;
        }
        remoteModelPath = path.join(REMOTE_MODEL_PATH, path.basename(localModelPath)).replace(/\\/g, '/');
        console.log(chalk.blue(`推送本地模型 ${localModelPath} 到 ${remoteModelPath}...`));
        await executeCommand('adb', ['push', localModelPath, remoteModelPath]);
    } else {
        // 如果是远程路径（或默认值），确保预构建模型存在
        console.log(chalk.blue('使用设备上的模型，检查预构建模型是否存在...'));
        await checkAndDownloadPrebuiltModel();
    }

    // 推送 llama-bench 可执行文件
    const llamaBenchPath = path.join(config.PROJECT_ROOT_PATH, `out/android/${options.backend}/bin/llama-bench`);
    if (!(await pathExists(llamaBenchPath))) {
        console.log(chalk.red(`llama-bench 可执行文件未找到: ${llamaBenchPath}`));
        console.log(chalk.yellow('请先运行 ' + chalk.cyan(`ggml-hexagon-cli build --backend ${options.backend}`) + ' 命令。'));
        return;
    }
    await executeCommand('adb', ['push', llamaBenchPath, REMOTE_ANDROID_PATH]);
    await executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-bench`]);

    // 构造运行命令
    const remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./llama-bench -m ${remoteModelPath} ${config.RUNNING_PARAMS}`;
    await executeCommand('adb', ['shell', remoteCommand]);
} 