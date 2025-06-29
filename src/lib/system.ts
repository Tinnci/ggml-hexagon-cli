import { execa, ExecaError, Options } from 'execa';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { GLOBAL_VERBOSE } from '../state.js';
import os from 'os';

// 定义一个接口，用于描述 executeCommand 的 options 对象
export interface IExecuteCommandOptions extends Options {
    silent?: boolean;
    ignoreExitCode?: boolean;
}

// 定义一个统一的命令执行结果接口
export interface ICommandResult {
    stdout: string;
    stderr: string;
    all: string;
    exitCode?: number; // 可以是 undefined，如果进程没有正常退出
    command: string;
    failed: boolean;
    killed: boolean; // 确保是布尔值
    signal?: string; // 可以是 undefined
    timedOut: boolean; // 确保是布尔值
    isCanceled: boolean; // 确保是布尔值
    message: string; // 错误信息，确保是字符串
}

// 辅助函数：统一处理 execa 的结果类型转换
function getExecaProcessedResult(execaOutput: any, isFailed: boolean): ICommandResult {
    const stdout = execaOutput.stdout?.toString() || '';
    const stderr = execaOutput.stderr?.toString() || '';
    const all = execaOutput.all?.toString() || '';
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
export async function executeCommand(command: string, args: string[], options: IExecuteCommandOptions = {}): Promise<ICommandResult> {
    const { silent = false, ignoreExitCode = false, ...execaOptions } = options;

    const effectiveOptions: Options = {
        ...execaOptions,
        all: true, // 合并 stdout 和 stderr 到 all 属性
    };
    
    // Verbose 模式，直接打印
    if (GLOBAL_VERBOSE) {
        try {
            const subprocess = execa(command, args, { ...effectiveOptions, stdio: 'inherit' });
            const result = await subprocess;
            return getExecaProcessedResult(result, false);
        } catch (error) {
            const e = error as ExecaError;
            if (!ignoreExitCode) {
                 console.error(chalk.red(`❌  Error executing command: ${e.command}`),);
                 console.error(chalk.red(`❌  Error details: ${e.message}`),);
                throw e; // 重新抛出原始 ExecaError，以便外部捕获原始错误信息
            }
            return getExecaProcessedResult(e, true); // 返回处理后的 ICommandResult
        }
    }
    
    // Silent 模式，不显示任何东西，仅返回结果
    if (silent) {
        try {
            const result = await execa(command, args, effectiveOptions);
            return getExecaProcessedResult(result, false);
        } catch (e) {
            const error = e as ExecaError;
            if (!ignoreExitCode) throw error; // 如果不忽略退出码，重新抛出原始 ExecaError
            return getExecaProcessedResult(error, true);
        }
    }

    // 默认模式，带 Spinner
    let spinner: Ora | null = null;
    let interval: NodeJS.Timeout | null = null;
    const subprocess = execa(command, args, effectiveOptions);

    try {
        let lastLine = '';
        const getProgressText = () => {
             const memUsage = process.memoryUsage();
             const memText = `Mem: ${(memUsage.rss / 1024 / 1024).toFixed(0)}MB`;
             let progressText = lastLine.substring(0, 80).trim();
             if (progressText.length < lastLine.length) progressText += '...';
             return `${chalk.cyan(command)}... [${memText}] ${progressText}`;
        }
        
        spinner = ora({ text: `Executing: ${chalk.cyan(command)} ${args.join(' ')}` }).start();
        
        subprocess.all?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n');
            const newLine = lines[lines.length - 2] || '';
            if (newLine.includes('[') && newLine.includes('%]')) {
                 lastLine = newLine.replace(/\u001b\[\\d+m/g, '');
            }
        });

        interval = setInterval(() => {
            if (spinner) spinner.text = getProgressText();
        }, 200);

        const result = await subprocess;
        if(interval) clearInterval(interval);
        spinner.succeed(`Successfully executed: ${command} ${args.join(' ')}`);
        return getExecaProcessedResult(result, false);

    } catch (e) {
        if(interval) clearInterval(interval);
        const error = e as ExecaError;
        if (spinner) {
            spinner.fail(`Error executing command: ${command} ${args.join(' ')}`);
        }
        if (!ignoreExitCode) {
            console.error(chalk.red(`❌  Error details: ${error.all?.toString() || error.message}`),);
            throw error; // 重新抛出原始 ExecaError
        }
        return getExecaProcessedResult(error, true);
    }
}

/**
 * 检查主机是否安装了特定命令
 * @param command - 要检查的命令
 * @returns
 */
export async function checkHostCommand(command: string) {
    const result = await executeCommand('which', [command], { silent: true, ignoreExitCode: true });
    if (result.failed) {
        console.log(chalk.red(`${command} 未安装。请先安装 ${command}。`));
        process.exit(1);
    }
}
