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
import { checkHostCommand } from '../lib/system.js';
import { ensureAndroidNdk, ensureQnnSdk, ensureHexagonSdk } from '../lib/sdk.js';
import { GLOBAL_YES } from '../state.js';
import inquirer from 'inquirer';
export function setupAction() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(chalk.blue('🚀  开始设置开发环境...'));
        if (!GLOBAL_YES) {
            const { confirm } = yield inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirm',
                    message: '即将开始环境设置，可能会下载并解压多个SDK，此过程可能耗时较长。要继续吗？',
                    default: true,
                }]);
            if (!confirm) {
                console.log(chalk.yellow('操作已取消。'));
                return;
            }
        }
        yield checkHostCommand('wget');
        yield checkHostCommand('xzcat');
        yield checkHostCommand('unzip');
        yield ensureAndroidNdk();
        yield ensureQnnSdk();
        yield ensureHexagonSdk();
        console.log(chalk.green.bold('🎉  环境设置完成！'));
    });
}
