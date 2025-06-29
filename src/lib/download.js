var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
export function checkAndDownloadFile(url, outputPath, fileName) {
    return __awaiter(this, void 0, void 0, function* () {
        if (yield pathExists(outputPath)) {
            console.log(chalk.green(`${fileName} 已存在: ${outputPath}`));
            return;
        }
        console.log(chalk.blue(`开始下载 ${fileName} 从 ${url}...`));
        const spinner = ora('Downloading...').start();
        try {
            const response = yield fetch(url);
            if (!response.ok) {
                throw new Error(`下载失败: ${response.statusText}`);
            }
            // 将 Web ReadableStream 转换为 Node.js ReadableStream
            yield pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
            spinner.succeed(chalk.green(`${fileName} 下载完成.`));
        }
        catch (error) {
            spinner.fail(chalk.red(`下载 ${fileName} 失败: ${error.message}`));
            process.exit(1);
        }
    });
}
