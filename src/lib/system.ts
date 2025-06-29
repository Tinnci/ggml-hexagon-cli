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
export async function executeCommand(command: string, args: string[], options?: {
  cwd?: string;
  shell?: boolean;
}) {
  const fullCommand = `${command} ${args.join(' ')}`;
  if (GLOBAL_VERBOSE) {
    console.log(chalk.magenta(`[CMD] ${fullCommand}`));
  }
  const spinner = GLOBAL_VERBOSE ? null : ora(chalk.yellow(`Executing: ${fullCommand}`)).start();
  try {
    const subprocess = execa(command, args, options);
    subprocess.stdout?.pipe(process.stdout);
    subprocess.stderr?.pipe(process.stderr);
    await subprocess;
    if (spinner) spinner.succeed(chalk.green(`Successfully executed: ${fullCommand}`));
  } catch (error: any) {
    if (spinner) spinner.fail(chalk.red(`Error executing command: ${fullCommand}`));
    console.error(chalk.red(`\n❌  Error details: ${error.message}`));
    process.exit(1); // 出错时退出
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
