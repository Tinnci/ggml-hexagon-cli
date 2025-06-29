import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import { config } from '../../config.js';
import { ensureAdbDevice } from '../lib/adb.js';
import { executeCommand } from '../lib/system.js';
import { GLOBAL_YES } from '../state.js';

const REMOTE_ANDROID_PATH = '/data/local/tmp';

const files_to_clean = [
    // executables
    'llama-bench',
    'llama-cli',
    'test-backend-ops',
    // config
    'ggml-hexagon.cfg',
    // ggml/llama libs
    'libllama.so',
    'libggml.so',
    'libggml-hexagon.so',
    'libggmldsp-skel.so',
    'libggmldsp-skelv79.so',
    'libggml-base.so',
    'libggml-cpu.so',
    // QNN libs
    'libQnnSystem.so',
    'libQnnCpu.so',
    'libQnnHtp.so',
    'libQnnHtpPrepare.so',
    'libQnnHtpV75Stub.so',
    'libQnnHtpV79Skel.so',
    'libqnn-htp-v75-perf.so',
    `libQnnHtp${config.HTP_ARCH_VERSION_A}Skel.so`,
];

const models_to_clean = [
    config.GGUF_MODEL_NAME, // default prebuilt model
];

export async function cleanDeviceAction() {
    console.log(chalk.blue('🧹  准备清理安卓设备上的文件...'));
    await ensureAdbDevice();

    const remoteTempPaths = files_to_clean.map(f => `${REMOTE_ANDROID_PATH}/${f}`);
    const allPathsToClean = [...remoteTempPaths, ...models_to_clean];

    console.log(chalk.yellow('将要删除以下设备上的文件:'));
    allPathsToClean.forEach(p => console.log(`  - ${p}`));

    if (!GLOBAL_YES) {
        const { confirmClean } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmClean',
                message: `您确定要删除这些文件吗？此操作不可恢复。`,
                default: false,
            },
        ]);
        if (!confirmClean) {
            console.log(chalk.yellow('操作已取消。'));
            return;
        }
    }

    // Using a single rm command with multiple files is more efficient and handles cases where files don't exist.
    const command = ['shell', 'rm', '-f', ...allPathsToClean];
    await executeCommand('adb', command);

    console.log(chalk.green('✅  设备清理完成。'));
} 