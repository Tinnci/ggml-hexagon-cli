var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { execa } from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import { GLOBAL_VERBOSE } from '../state.js';
/**
 * 带有 ora 指示器的命令执行器
 * @param command - 要执行的命令
 * @param args - 命令参数
 * @param options - execa 选项
 * @returns
 */
export function executeCommand(command_1, args_1) {
    return __awaiter(this, arguments, void 0, function* (command, args, options = {}) {
        var _a;
        const { silent = false, ignoreExitCode = false } = options, execaOptions = __rest(options, ["silent", "ignoreExitCode"]);
        if (GLOBAL_VERBOSE || silent) {
            try {
                // 在详细或静默模式下，直接继承 stdio
                const result = yield execa(command, args, Object.assign({ stdio: 'inherit' }, execaOptions));
                return result;
            }
            catch (error) {
                const e = error;
                if (!ignoreExitCode) {
                    console.error(chalk.red(`❌  Error executing command: ${e.command}`));
                    console.error(chalk.red(`❌  Error details: ${e.message}`));
                    throw e; // 重新抛出错误，让调用者处理
                }
                return e; // 返回错误对象供调用者检查
            }
        }
        let spinner = null;
        let interval = null;
        try {
            const subprocess = execa(command, args, execaOptions);
            let lastLine = '';
            const getProgressText = () => {
                const memUsage = process.memoryUsage();
                const memText = `Mem: ${(memUsage.rss / 1024 / 1024).toFixed(0)}MB`;
                let progressText = lastLine.substring(0, 60);
                if (progressText.length < lastLine.length)
                    progressText += '...';
                return `[${memText}] ${progressText}`;
            };
            spinner = ora({
                text: `Executing: ${chalk.cyan(command)} ${args.join(' ')}`,
                spinner: 'dots',
            }).start();
            (_a = subprocess.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                const lines = data.toString().split('\n');
                const newLine = lines[lines.length - 2] || '';
                if (newLine.includes('[') && newLine.includes('%]')) {
                    lastLine = newLine;
                }
            });
            // 实时状态更新
            interval = setInterval(() => {
                if (spinner) {
                    spinner.text = getProgressText();
                }
            }, 200);
            const result = yield subprocess;
            if (interval)
                clearInterval(interval);
            spinner.succeed(`Successfully executed: ${command} ${args.join(' ')}`);
            return result;
        }
        catch (error) {
            if (interval)
                clearInterval(interval);
            const e = error;
            if (spinner) {
                spinner.fail(`Error executing command: ${command} ${args.join(' ')}`);
            }
            if (!ignoreExitCode) {
                console.error(chalk.red(`❌  Error details: ${e.stdout || e.stderr || e.message}`));
                throw e;
            }
            return e;
        }
    });
}
/**
 * 检查主机是否安装了特定命令
 * @param command - 要检查的命令
 * @returns
 */
export function checkHostCommand(command) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield execa('which', [command]);
            console.log(chalk.green(`${command} 已安装`));
        }
        catch (error) {
            console.log(chalk.red(`${command} 未安装。请先安装 ${command}。`));
            process.exit(1);
        }
    });
}
