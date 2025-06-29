import { pathExists } from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createWriteStream } from 'fs';

/**
 * 检查并下载文件
 * @param url - 文件下载地址
 * @param outputPath - 文件保存路径
 * @param fileName - 文件名（用于显示）
 */
export async function checkAndDownloadFile(url: string, outputPath: string, fileName: string) {
  if (await pathExists(outputPath)) {
    console.log(chalk.green(`${fileName} 已存在: ${outputPath}`));
    return;
  }

  console.log(chalk.blue(`开始下载 ${fileName} 从 ${url}...`));
  const spinner = ora('Downloading...').start();
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.statusText}`);
    }
    // 将 Web ReadableStream 转换为 Node.js ReadableStream
    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(outputPath));
    spinner.succeed(chalk.green(`${fileName} 下载完成.`));
  } catch (error: any) {
    spinner.fail(chalk.red(`下载 ${fileName} 失败: ${error.message}`));
    process.exit(1);
  }
} 