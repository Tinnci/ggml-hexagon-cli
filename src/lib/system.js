var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import { GLOBAL_VERBOSE } from '../state.js';
/**
 * 执行一个 shell 命令并实时显示其输出
 * @param command - 要执行的命令字符串
 * @param args - 命令的参数数组
 * @param options - execa 选项
 */
export function executeCommand(command, args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const fullCommand = `${command} ${args.join(' ')}`;
        if (GLOBAL_VERBOSE) {
            console.log(chalk.magenta(`[CMD] ${fullCommand}`));
        }
        const spinner = GLOBAL_VERBOSE ? null : ora(chalk.yellow(`Executing: ${fullCommand}`)).start();
        try {
            const subprocess = execa(command, args, options);
            (_a = subprocess.stdout) === null || _a === void 0 ? void 0 : _a.pipe(process.stdout);
            (_b = subprocess.stderr) === null || _b === void 0 ? void 0 : _b.pipe(process.stderr);
            yield subprocess;
            if (spinner)
                spinner.succeed(chalk.green(`Successfully executed: ${fullCommand}`));
        }
        catch (error) {
            if (spinner)
                spinner.fail(chalk.red(`Error executing command: ${fullCommand}`));
            console.error(chalk.red(`\n❌  Error details: ${error.message}`));
            process.exit(1); // 出错时退出
        }
    });
}
/**
 * 检查命令是否存在于主机上
 */
export function checkHostCommand(cmd) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield execa('which', [cmd]);
            console.log(chalk.green(`${cmd} 已安装`));
        }
        catch (error) {
            console.log(chalk.red(`${cmd} 未安装。请先安装 ${cmd}。`));
            process.exit(1);
        }
    });
}
