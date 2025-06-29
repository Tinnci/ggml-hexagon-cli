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
// 辅助函数：统一处理 execa 的结果类型转换
function getExecaProcessedResult(execaOutput, isFailed) {
    var _a, _b, _c;
    const stdout = ((_a = execaOutput.stdout) === null || _a === void 0 ? void 0 : _a.toString()) || '';
    const stderr = ((_b = execaOutput.stderr) === null || _b === void 0 ? void 0 : _b.toString()) || '';
    const all = ((_c = execaOutput.all) === null || _c === void 0 ? void 0 : _c.toString()) || '';
    const message = execaOutput.message || ''; // 捕获消息，如果不存在则为空字符串
    return {
        stdout,
        stderr,
        all,
        exitCode: execaOutput.exitCode,
        command: execaOutput.command || '',
        failed: isFailed,
        killed: execaOutput.killed || false,
        signal: execaOutput.signal,
        timedOut: execaOutput.timedOut || false,
        isCanceled: execaOutput.isCanceled || false,
        message: message,
    };
}
/**
 * 带有 ora 指示器的命令执行器
 * @param command - 要执行的命令
 * @param args - 命令参数
 * @param options - execa 选项
 * @returns
 */
export function executeCommand(command_1, args_1) {
    return __awaiter(this, arguments, void 0, function* (command, args, options = {}) {
        var _a, _b;
        const { silent = false, ignoreExitCode = false } = options, execaOptions = __rest(options, ["silent", "ignoreExitCode"]);
        const effectiveOptions = Object.assign(Object.assign({}, execaOptions), { all: true });
        // Verbose 模式，直接打印
        if (GLOBAL_VERBOSE) {
            try {
                const subprocess = execa(command, args, Object.assign(Object.assign({}, effectiveOptions), { stdio: 'inherit' }));
                const result = yield subprocess;
                return getExecaProcessedResult(result, false);
            }
            catch (error) {
                const e = error;
                if (!ignoreExitCode) {
                    console.error(chalk.red(`❌  Error executing command: ${e.command}`));
                    console.error(chalk.red(`❌  Error details: ${e.message}`));
                    throw e; // 重新抛出原始 ExecaError，以便外部捕获原始错误信息
                }
                return getExecaProcessedResult(e, true); // 返回处理后的 ICommandResult
            }
        }
        // Silent 模式，不显示任何东西，仅返回结果
        if (silent) {
            try {
                const result = yield execa(command, args, effectiveOptions);
                return getExecaProcessedResult(result, false);
            }
            catch (e) {
                const error = e;
                if (!ignoreExitCode)
                    throw error; // 如果不忽略退出码，重新抛出原始 ExecaError
                return getExecaProcessedResult(error, true);
            }
        }
        // 默认模式，带 Spinner
        let spinner = null;
        let interval = null;
        const subprocess = execa(command, args, effectiveOptions);
        try {
            let lastLine = '';
            const getProgressText = () => {
                const memUsage = process.memoryUsage();
                const memText = `Mem: ${(memUsage.rss / 1024 / 1024).toFixed(0)}MB`;
                let progressText = lastLine.substring(0, 80).trim();
                if (progressText.length < lastLine.length)
                    progressText += '...';
                return `${chalk.cyan(command)}... [${memText}] ${progressText}`;
            };
            spinner = ora({ text: `Executing: ${chalk.cyan(command)} ${args.join(' ')}` }).start();
            (_a = subprocess.all) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
                const lines = data.toString().split('\n');
                const newLine = lines[lines.length - 2] || '';
                if (newLine.includes('[') && newLine.includes('%]')) {
                    lastLine = newLine.replace(/\u001b\[\\d+m/g, '');
                }
            });
            interval = setInterval(() => {
                if (spinner)
                    spinner.text = getProgressText();
            }, 200);
            const result = yield subprocess;
            if (interval)
                clearInterval(interval);
            spinner.succeed(`Successfully executed: ${command} ${args.join(' ')}`);
            return getExecaProcessedResult(result, false);
        }
        catch (e) {
            if (interval)
                clearInterval(interval);
            const error = e;
            if (spinner) {
                spinner.fail(`Error executing command: ${command} ${args.join(' ')}`);
            }
            if (!ignoreExitCode) {
                console.error(chalk.red(`❌  Error details: ${((_b = error.all) === null || _b === void 0 ? void 0 : _b.toString()) || error.message}`));
                throw error; // 重新抛出原始 ExecaError
            }
            return getExecaProcessedResult(error, true);
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
        const result = yield executeCommand('which', [command], { silent: true, ignoreExitCode: true });
        if (result.failed) {
            console.log(chalk.red(`${command} 未安装。请先安装 ${command}。`));
            process.exit(1);
        }
    });
}
