import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import os from 'os-utils';
import { GLOBAL_VERBOSE } from '../state.js';

function getSimpleProgress(line: string): string | null {
    if (line.startsWith('[') && line.includes('%]')) {
        const match = line.match(/\[\s*(\d+)%\]\s(Building|Generating|Linking).*/);
        if (match) {
            return match[0].substring(match[0].indexOf(']') + 2);
        }
    }
    return null;
}

/**
 * 执行一个 shell 命令并实时显示其输出
 * @param command - 要执行的命令字符串
 * @param args - 命令的参数数组
 * @param options - execa 选项
 */
export async function executeCommand(command: string, args: string[], options?: {
    cwd?: string;
    shell?: boolean;
}) {
    const fullCommand = `${command} ${args.join(' ')}`;
    if (GLOBAL_VERBOSE) {
        console.log(chalk.magenta(`[CMD] ${fullCommand}`));
        // 在 verbose 模式下，依然使用简单流式输出
        const subprocess = execa(command, args, options);
        subprocess.stdout?.pipe(process.stdout);
        subprocess.stderr?.pipe(process.stderr);
        await subprocess;
        return;
    }

    const spinner = ora(chalk.yellow(`Executing: ${fullCommand}`)).start();
    let interval: NodeJS.Timeout | null = null;

    try {
        const subprocess = execa(command, args, options);

        interval = setInterval(() => {
            os.cpuUsage((cpuUsage: number) => {
                const cpuText = `CPU: ${(cpuUsage * 100).toFixed(1)}%`;
                const memText = `Mem: ${(100 * (1 - os.freememPercentage())).toFixed(1)}%`;
                spinner.text = `${chalk.yellow(spinner.text.split(' | ')[0])} | ${cpuText}, ${memText}`;
            });
        }, 1000);

        const onData = (data: any) => {
            const line = data.toString().trim();
            const progress = getSimpleProgress(line);
            if (progress) {
                const originalText = progress;
                spinner.text = originalText; // 更新基础文本
            }
        };

        subprocess.stdout?.on('data', onData);
        subprocess.stderr?.on('data', onData);
        
        await subprocess;

        if (spinner) spinner.succeed(chalk.green(`Successfully executed: ${fullCommand}`));

    } catch (error: any) {
        if (spinner) spinner.fail(chalk.red(`Error executing command: ${fullCommand}`));
        console.error(chalk.red(`\n❌  Error details: ${error.message}`));
        process.exit(1);
    } finally {
        if (interval) {
            clearInterval(interval);
        }
    }
}

/**
 * 检查命令是否存在于主机上
 */
export async function checkHostCommand(cmd: string) {
  try {
    await execa('which', [cmd]);
    console.log(chalk.green(`${cmd} 已安装`));
  } catch (error) {
    console.log(chalk.red(`${cmd} 未安装。请先安装 ${cmd}。`));
    process.exit(1);
  }
}
