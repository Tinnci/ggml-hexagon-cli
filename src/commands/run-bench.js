var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import chalk from 'chalk';
import path from 'path';
import fsExtra from 'fs-extra';
const { pathExists } = fsExtra;
import { paths } from '../../config.js';
import { executeCommand } from '../lib/system.js';
import { ensureAdbDevice } from '../lib/adb.js';
import { checkAndDownloadPrebuiltModel } from '../lib/models.js';
import { GLOBAL_VERBOSE } from '../state.js';
const REMOTE_ANDROID_PATH = '/data/local/tmp';
const REMOTE_MODEL_PATH = '/sdcard/';
export function runBenchAction(options) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(chalk.blue('🚀  准备运行 llama-bench...'));
        yield ensureAdbDevice();
        const backendBuildDir = path.join(paths.OUT_DIR, 'android', options.backend, 'bin');
        const llamaBenchPath = path.join(backendBuildDir, 'llama-bench');
        if (!(yield pathExists(llamaBenchPath))) {
            console.error(chalk.red(`❌  未找到 llama-bench 可执行文件。请先运行 'npm run build -- --backend ${options.backend}' 进行编译。`));
            process.exit(1);
        }
        const remoteLlamaBenchPath = `${REMOTE_ANDROID_PATH}/llama-bench`;
        // 推送 llama-bench 可执行文件
        console.log(chalk.yellow(`推送 llama-bench 可执行文件到设备...`));
        yield executeCommand('adb', ['push', llamaBenchPath, REMOTE_ANDROID_PATH]);
        // 推送 ggml 库
        const ggmlLibs = [
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
            if (yield pathExists(localLibPath)) {
                console.log(chalk.yellow(`推送库 ${lib} 到设备...`));
                yield executeCommand('adb', ['push', localLibPath, remoteLibPath]);
            }
            else {
                if (GLOBAL_VERBOSE) {
                    console.log(chalk.gray(`本地库 ${lib} 不存在，跳过。`));
                }
            }
        }
        let modelPath = options.model;
        let remoteModelPath = '';
        if (!modelPath || !(yield pathExists(modelPath))) {
            console.log(chalk.blue('使用设备上的模型，检查预构建模型是否存在...'));
            const prebuiltModel = yield checkAndDownloadPrebuiltModel();
            if (prebuiltModel) {
                modelPath = prebuiltModel.localPath;
                remoteModelPath = prebuiltModel.remotePath;
            }
            else {
                console.error(chalk.red('❌  未找到模型文件。请提供本地模型路径，或确保预构建模型可用。'));
                process.exit(1);
            }
        }
        else {
            remoteModelPath = path.join(REMOTE_MODEL_PATH, path.basename(modelPath));
            console.log(chalk.blue(`本地模型 ${modelPath} 已指定，推送到设备...`));
            yield executeCommand('adb', ['push', modelPath, REMOTE_MODEL_PATH]);
            console.log(chalk.green('预构建模型推送完成。'));
        }
        // 确保可执行文件有执行权限
        console.log(chalk.blue(`确保 ${path.join(REMOTE_ANDROID_PATH, 'llama-bench')} 有执行权限...`));
        yield executeCommand('adb', ['shell', `chmod +x ${path.join(REMOTE_ANDROID_PATH, 'llama-bench')}`]);
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
        yield executeCommand('adb', ['shell', benchCommand.join(' ')]);
        console.log(chalk.green('llama-bench 运行完成。'));
    });
}
