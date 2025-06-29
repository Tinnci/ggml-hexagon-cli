import { execa, ExecaError, Options } from 'execa';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { GLOBAL_VERBOSE } from '../state.js';
import { performance } from 'perf_hooks';
import os from 'os';

// 定义一个接口，用于描述 executeCommand 的 options 对象
export interface IExecuteCommandOptions extends Options {
    silent?: boolean;
    ignoreExitCode?: boolean;
}

/**
 * 带有 ora 指示器的命令执行器
 * @param command - 要执行的命令
 * @param args - 命令参数
 * @param options - execa 选项
 * @returns
 */
export async function executeCommand(command: string, args: string[], options: IExecuteCommandOptions = {}) {
    const { silent = false, ignoreExitCode = false, ...execaOptions } = options;

    if (GLOBAL_VERBOSE || silent) {
        try {
            // 在详细或静默模式下，直接继承 stdio
            const result = await execa(command, args, { stdio: 'inherit', ...execaOptions });
            return result;
        } catch (error) {
            const e = error as ExecaError;
            if (!ignoreExitCode) {
                 console.error(chalk.red(`❌  Error executing command: ${e.command}`),);
                 console.error(chalk.red(`❌  Error details: ${e.message}`),);
                throw e; // 重新抛出错误，让调用者处理
            }
            return e; // 返回错误对象供调用者检查
        }
    }

    let spinner: Ora | null = null;
    let interval: NodeJS.Timeout | null = null;

    try {
        const subprocess = execa(command, args, execaOptions);
        
        let lastLine = '';
        const getProgressText = () => {
             const memUsage = process.memoryUsage();
             const memText = `Mem: ${(memUsage.rss / 1024 / 1024).toFixed(0)}MB`;
             let progressText = lastLine.substring(0, 60);
             if (progressText.length < lastLine.length) progressText += '...';
             return `[${memText}] ${progressText}`;
        }

        spinner = ora({
            text: `Executing: ${chalk.cyan(command)} ${args.join(' ')}`,
            spinner: 'dots',
        }).start();
        
        subprocess.stdout?.on('data', (data) => {
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

        const result = await subprocess;
        if(interval) clearInterval(interval);
        spinner.succeed(`Successfully executed: ${command} ${args.join(' ')}`);
        return result;

    } catch (error) {
        if(interval) clearInterval(interval);
        const e = error as ExecaError;
        if (spinner) {
            spinner.fail(`Error executing command: ${command} ${args.join(' ')}`);
        }
        if (!ignoreExitCode) {
            console.error(chalk.red(`❌  Error details: ${e.stdout || e.stderr || e.message}`),);
            throw e;
        }
        return e;
    }
}

/**
 * 检查主机是否安装了特定命令
 * @param command - 要检查的命令
 * @returns
 */
export async function checkHostCommand(command: string) {
  try {
    await execa('which', [command]);
    console.log(chalk.green(`${command} 已安装`));
  } catch (error) {
    console.log(chalk.red(`${command} 未安装。请先安装 ${command}。`));
    process.exit(1);
  }
}
