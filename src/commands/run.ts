import chalk from 'chalk';
import path from 'path';
import fsExtra from 'fs-extra';
const { pathExists } = fsExtra;
import inquirer from 'inquirer';

import { config } from '../../config.js';
import { scanForModels } from '../lib/models.js';
import { checkAndPushQnnLibs } from '../lib/adb.js';
import { executeCommand } from '../lib/system.js';

const REMOTE_ANDROID_PATH = '/data/local/tmp/';
const REMOTE_MODEL_PATH = '/sdcard/';

export async function runAction(options: {
    backend: string;
    model?: string;
    prompt: string;
    tokens: string;
    threads: string;
    noCnv?: boolean;
}) {
    let selectedModel: string;

    if (options.model) {
        if (!(await pathExists(options.model))) {
            console.error(chalk.red(`错误：指定的模型文件不存在: ${options.model}`));
            return;
        }
        selectedModel = options.model;
        console.log(chalk.blue(`📋  使用指定的模型: ${selectedModel}`));
    } else {
        console.log(chalk.blue('🔍  扫描可用模型...'));
        const models = await scanForModels();

        if (models.length === 0) {
            console.log(chalk.red('在任何搜索目录中都未找到 .gguf 模型。'));
            console.log(chalk.yellow('请下载模型并首先放置到 models 目录中，或使用 --model <path> 指定。'));
            return;
        }

        // 提取模型名称用于显示
        const modelChoices = models.map(modelPath => ({
            name: `${path.basename(modelPath)} (${path.dirname(modelPath)})`,
            value: modelPath
        }));

        // 交互式提问
        const answer = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedModel',
                message: '您想运行哪个模型？',
                choices: modelChoices,
            },
        ]);
        selectedModel = answer.selectedModel;
    }

    const { confirmation } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmation',
            message: `您即将运行 ${chalk.cyan(path.basename(selectedModel))}。继续吗？`,
            default: true,
        }
    ]);

    if (!confirmation) {
        console.log(chalk.yellow('操作已取消。'));
        return;
    }

    console.log(chalk.blue(`🚀  准备运行 ${path.basename(selectedModel)}...`));

    // 确保核心库和可执行文件已存在于设备上
    await checkAndPushQnnLibs();

    // 推送选择的模型
    const remoteModelFullPath = path.join(REMOTE_MODEL_PATH, path.basename(selectedModel)).replace(/\\/g, '/');

    // 检查模型是否已存在于设备上
    try {
        await executeCommand('adb', ['shell', `ls ${remoteModelFullPath}`]);
        console.log(chalk.green(`模型 ${path.basename(selectedModel)} 已存在于设备上，跳过推送。`));
    } catch (error) {
        console.log(chalk.yellow(`模型不存在于设备上，开始推送 ${path.basename(selectedModel)}...`));
        await executeCommand('adb', ['push', selectedModel, remoteModelFullPath]);
    }

    // 推送 llama-cli 可执行文件
    const llamaCliPath = path.join(config.PROJECT_ROOT_PATH, `out/android/${options.backend}/bin/llama-cli`);
    if (!(await pathExists(llamaCliPath))) {
        console.log(chalk.red(`llama-cli 可执行文件未找到: ${llamaCliPath}`));
        console.log(chalk.yellow('请先运行 ' + chalk.cyan(`ggml-hexagon-cli build --backend ${options.backend}`) + ' 命令。'));
        return;
    }
    await executeCommand('adb', ['push', llamaCliPath, REMOTE_ANDROID_PATH]);
    await executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-cli`]);

    // 构造运行命令
    let remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./llama-cli -m ${remoteModelFullPath}`;
    // 添加运行参数
    remoteCommand += ` -n ${options.tokens} -p "${options.prompt}"`;
    if (options.noCnv) {
        remoteCommand += ' -no-cnv';
    }
    remoteCommand += ` -t ${options.threads}`;
    // 保持与 shell 脚本一致的 running_params
    remoteCommand += ` ${config.RUNNING_PARAMS}`;

    // 在执行前显示完整的命令
    console.log(chalk.blue('\n即将通过 adb shell 执行以下命令:'));
    console.log(chalk.magenta(remoteCommand));

    await executeCommand('adb', ['shell', remoteCommand]);
} 