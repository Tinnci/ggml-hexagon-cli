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
import inquirer from 'inquirer';
import { createWriteStream } from 'fs';
import { config } from '../../config.js';
import { checkAndPushQnnLibs } from '../lib/adb.js';
import { executeCommand } from '../lib/system.js';
import { GLOBAL_YES } from '../state.js';
const REMOTE_ANDROID_PATH = '/data/local/tmp/';
export function runTestOpsAction(options) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(chalk.blue('🚀  准备运行 test-backend-ops...'));
        if (!GLOBAL_YES) {
            const { confirm } = yield inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirm',
                    message: `即将推送文件并在设备上运行 test-backend-ops。继续吗？`,
                    default: true,
                }]);
            if (!confirm) {
                console.log(chalk.yellow('操作已取消。'));
                return;
            }
        }
        // 确保核心库已存在于设备上
        yield checkAndPushQnnLibs();
        // 推送 test-backend-ops 可执行文件
        const testOpsPath = path.join(config.PROJECT_ROOT_PATH, `out/android/${options.backend}/bin/test-backend-ops`);
        if (!(yield pathExists(testOpsPath))) {
            console.log(chalk.red(`test-backend-ops 可执行文件未找到: ${testOpsPath}`));
            console.log(chalk.yellow('请先运行 ' + chalk.cyan(`ggml-hexagon-cli build --backend ${options.backend}`) + ' 命令。'));
            return;
        }
        yield executeCommand('adb', ['push', testOpsPath, REMOTE_ANDROID_PATH]);
        yield executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/test-backend-ops`]);
        let remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./test-backend-ops test`;
        if (options.op) {
            remoteCommand += ` -o ${options.op}`;
        }
        const result = yield executeCommand('adb', ['shell', remoteCommand], { silent: !!options.output });
        let finalOutputPath = options.output;
        if (!finalOutputPath && !GLOBAL_YES) {
            const { saveOutput } = yield inquirer.prompt([{
                    type: 'confirm',
                    name: 'saveOutput',
                    message: '是否要将 test-backend-ops 输出保存到文件？',
                    default: false,
                }]);
            if (saveOutput) {
                const { outputPath } = yield inquirer.prompt([{
                        type: 'input',
                        name: 'outputPath',
                        message: '请输入文件名 (例如: test_ops_results.txt):',
                        default: 'test_ops_output.txt',
                    }]);
                finalOutputPath = outputPath;
            }
        }
        if (finalOutputPath) {
            console.log(chalk.blue(`将输出保存到文件: ${finalOutputPath}`));
            createWriteStream(finalOutputPath).write(result.stdout + result.stderr);
        }
    });
}
