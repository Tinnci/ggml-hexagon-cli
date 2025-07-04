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
import fsExtra from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { config } from '../../config.js';
import { GLOBAL_YES } from '../state.js';
export function cleanAction() {
    return __awaiter(this, void 0, void 0, function* () {
        const buildDir = path.join(config.PROJECT_ROOT_PATH, 'out', 'android');
        if (yield fsExtra.pathExists(buildDir)) {
            console.log(chalk.yellow(`将要清理构建目录: ${buildDir}`));
            if (!GLOBAL_YES) {
                const { confirm } = yield inquirer.prompt([{
                        type: 'confirm',
                        name: 'confirm',
                        message: '确定要删除吗?',
                        default: true,
                    }]);
                if (!confirm) {
                    console.log(chalk.yellow('操作已取消。'));
                    return;
                }
            }
            yield fsExtra.remove(buildDir);
            console.log(chalk.green('清理完成。'));
        }
        else {
            console.log(chalk.yellow('构建目录不存在，无需清理。'));
        }
    });
}
