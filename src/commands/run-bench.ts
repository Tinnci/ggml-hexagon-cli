import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fsExtra from 'fs-extra';
const { pathExists } = fsExtra;
import { config, paths } from '../../config.js';
import { executeCommand, IExecuteCommandOptions } from '../lib/system.js';
import { ensureAdbDevice } from '../lib/adb.js';
import { checkAndDownloadPrebuiltModel, scanForModels } from '../lib/models.js';
import { GLOBAL_VERBOSE, GLOBAL_YES } from '../state.js';
import { createWriteStream } from 'fs';

const REMOTE_ANDROID_PATH = '/data/local/tmp';
const REMOTE_MODEL_PATH = '/sdcard/';

export async function runBenchAction(options: any) {
    console.log(chalk.blue('🚀  准备运行 llama-bench...'));

    await ensureAdbDevice();

    const backendBuildDir = path.join(paths.OUT_DIR, 'android', options.backend, 'bin');
    const llamaBenchPath = path.join(backendBuildDir, 'llama-bench');

    if (!(await pathExists(llamaBenchPath))) {
        console.error(chalk.red(`❌  未找到 llama-bench 可执行文件。请先运行 'npm run build -- --backend ${options.backend}' 进行编译。`));
        process.exit(1);
    }

    if (!GLOBAL_YES) {
        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `即将推送文件并在设备上运行 llama-bench。继续吗？`,
            default: true,
        }]);
        if (!confirm) {
            console.log(chalk.yellow('操作已取消。'));
            return;
        }
    }

    const remoteLlamaBenchPath = `${REMOTE_ANDROID_PATH}/llama-bench`;

    // 推送 llama-bench 可执行文件
    console.log(chalk.yellow(`推送 llama-bench 可执行文件到设备...`));
    await executeCommand('adb', ['push', llamaBenchPath, REMOTE_ANDROID_PATH]);

    // 推送 ggml 库
    const ggmlLibs = [
        'libllama.so',
        'libggml.so',
        'libggml-hexagon.so',
        'libggmldsp-skel.so',
        'libggmldsp-skelv79.so',
        'libggml-base.so',
        'libggml-cpu.so',
    ];

    for (const lib of ggmlLibs) {
        const localLibPath = path.join(backendBuildDir, lib);
        const remoteLibPath = `${REMOTE_ANDROID_PATH}/${lib}`;
        if (await pathExists(localLibPath)) {
            console.log(chalk.yellow(`推送库 ${lib} 到设备...`));
            await executeCommand('adb', ['push', localLibPath, remoteLibPath]);
        } else {
            if (GLOBAL_VERBOSE) {
                console.log(chalk.gray(`本地库 ${lib} 不存在，跳过。`));
            }
        }
    }


    let selectedModel: string;
    if (options.model) {
        if (!(await pathExists(options.model))) {
            console.error(chalk.red(`错误：指定的模型文件不存在: ${options.model}`));
            process.exit(1);
        }
        selectedModel = options.model;
        console.log(chalk.blue(`📋  使用指定的模型: ${selectedModel}`));
    } else {
        console.log(chalk.blue('🔍  扫描可用模型...'));
        const models = await scanForModels();
        if (models.length === 0) {
            console.log(chalk.red('在任何搜索目录中都未找到 .gguf 模型。'));
            console.log(chalk.yellow('请下载模型并首先放置到 models 目录中，或使用 --model <path> 指定。'));
            process.exit(1);
        }
        const modelChoices = models.map(modelPath => ({
            name: `${path.basename(modelPath)} (${path.dirname(modelPath)})`,
            value: modelPath
        }));
        const answer = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedModel',
                message: '您想运行哪个模型进行基准测试？',
                choices: modelChoices,
            },
        ]);
        selectedModel = answer.selectedModel;
    }

    const remoteModelPath = path.join(REMOTE_MODEL_PATH, path.basename(selectedModel));
    try {
        await executeCommand('adb', ['shell', `ls ${remoteModelPath}`], { silent: true });
        console.log(chalk.green(`模型 ${path.basename(selectedModel)} 已存在于设备上，跳过推送。`));
    } catch (error) {
        console.log(chalk.yellow(`模型不存在于设备上，开始推送 ${path.basename(selectedModel)}...`));
        await executeCommand('adb', ['push', selectedModel, remoteModelPath]);
    }


    // 确保可执行文件有执行权限
    console.log(chalk.blue(`确保 ${path.join(REMOTE_ANDROID_PATH, 'llama-bench')} 有执行权限...`));
    await executeCommand('adb', ['shell', `chmod +x ${path.join(REMOTE_ANDROID_PATH, 'llama-bench')}`]);

    // 运行 llama-bench
    console.log(chalk.blue('运行 llama-bench...'));

    const benchCommand = [
        `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./${path.basename(llamaBenchPath)}`,
        `-m ${remoteModelPath}`,
        `-ngl 99`, // QNN backend specific, number of layers to offload to GPU/DSP
        `-t ${options.threads || 8}`, // Number of threads
        `-n ${options.tokens || 256}`, // Number of tokens to generate
        `--no-warmup`, // Disable warmup runs for more accurate measurement
    ];

    const result = await executeCommand('adb', ['shell', benchCommand.join(' ')], { silent: !!options.output });

    let finalOutputPath = options.output;

    if (!finalOutputPath && !GLOBAL_YES) {
        const { saveOutput } = await inquirer.prompt([{
            type: 'confirm',
            name: 'saveOutput',
            message: '是否要将 llama-bench 输出保存到文件？',
            default: false,
        }]);
        if (saveOutput) {
            const { outputPath } = await inquirer.prompt([{
                type: 'input',
                name: 'outputPath',
                message: '请输入文件名 (例如: benchmark_results.txt):',
                default: 'llama_bench_output.txt',
            }]);
            finalOutputPath = outputPath;
        }
    }

    if (finalOutputPath) {
        console.log(chalk.blue(`将输出保存到文件: ${finalOutputPath}`));
        createWriteStream(finalOutputPath).write(result.stdout + result.stderr);
    }

    console.log(chalk.green('llama-bench 运行完成。'));
} 