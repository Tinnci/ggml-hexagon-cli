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
const REMOTE_MODEL_PATH = '/sdcard/';
export function runBenchAction(options) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(chalk.blue('🚀  准备运行 llama-bench...'));
        yield checkAndPushQnnLibs();
        let remoteModelPath = options.model;
        // 检查提供的 model 路径是否是默认的远程路径
        if (!options.model.startsWith('/sdcard/')) {
            // 如果不是，假定它是一个本地路径
            const localModelPath = options.model;
            if (!(yield pathExists(localModelPath))) {
                console.error(chalk.red(`错误：指定的模型文件不存在: ${localModelPath}`));
                return;
            }
            remoteModelPath = path.join(REMOTE_MODEL_PATH, path.basename(localModelPath)).replace(/\\/g, '/');
            console.log(chalk.blue(`推送本地模型 ${localModelPath} 到 ${remoteModelPath}...`));
            yield executeCommand('adb', ['push', localModelPath, remoteModelPath]);
        }
        else {
            // 如果是远程路径（或默认值），确保预构建模型存在
            console.log(chalk.blue('使用设备上的模型，检查预构建模型是否存在...'));
            yield checkAndDownloadPrebuiltModel();
        }
        // 推送 llama-bench 可执行文件
        const llamaBenchPath = path.join(config.PROJECT_ROOT_PATH, `out/android/${options.backend}/bin/llama-bench`);
        if (!(yield pathExists(llamaBenchPath))) {
            console.log(chalk.red(`llama-bench 可执行文件未找到: ${llamaBenchPath}`));
            console.log(chalk.yellow('请先运行 ' + chalk.cyan(`ggml-hexagon-cli build --backend ${options.backend}`) + ' 命令。'));
            return;
        }
        yield executeCommand('adb', ['push', llamaBenchPath, REMOTE_ANDROID_PATH]);
        yield executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-bench`]);
        // 构造运行命令
        const remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./llama-bench -m ${remoteModelPath} ${config.RUNNING_PARAMS}`;
        yield executeCommand('adb', ['shell', remoteCommand]);
    });
}
