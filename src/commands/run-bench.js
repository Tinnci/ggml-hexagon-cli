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
import { config } from '../../config.js';
import { checkAndPushQnnLibs } from '../lib/adb.js';
import { checkAndDownloadPrebuiltModel } from '../lib/models.js';
import { executeCommand } from '../lib/system.js';
const REMOTE_ANDROID_PATH = '/data/local/tmp/';
export function runBenchAction(options) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(chalk.blue('🚀  准备运行 llama-bench...'));
        // 确保核心库和可执行文件已存在于设备上
        yield checkAndPushQnnLibs();
        yield checkAndDownloadPrebuiltModel(); // 确保默认模型已在设备上
        // 推送 llama-bench 可执行文件
        const llamaBenchPath = path.join(config.PROJECT_ROOT_PATH, 'out/android/bin/llama-bench');
        if (!(yield pathExists(llamaBenchPath))) {
            console.log(chalk.red(`llama-bench 可执行文件未找到: ${llamaBenchPath}`));
            console.log(chalk.yellow('请先运行 ' + chalk.cyan('ggml-hexagon-cli build') + ' 命令。'));
            return;
        }
        yield executeCommand('adb', ['push', llamaBenchPath, REMOTE_ANDROID_PATH]);
        yield executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-bench`]);
        // 构造运行命令
        const remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./llama-bench -m ${options.modelPath} ${config.RUNNING_PARAMS}`;
        yield executeCommand('adb', ['shell', remoteCommand]);
    });
}
