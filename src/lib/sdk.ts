import path from 'path';
import fsExtra from 'fs-extra';
const { pathExists, ensureDir } = fsExtra;
import chalk from 'chalk';
import inquirer from 'inquirer';
import AdmZip from 'adm-zip';
import { execa } from 'execa';
import ora from 'ora';

import { config, paths } from '../../config.js';
import { checkAndDownloadFile } from './download.js';
import { executeCommand } from './system.js';

// 全局可变 SDK 路径，初始化为默认 paths 中的值
// 这些变量会被 ensure...Sdk 函数修改，所以我们导出它们供其他模块使用
export let ANDROID_NDK_DIR: string = paths.ANDROID_NDK;
export let QNN_SDK_DIR: string = paths.QNN_SDK_PATH;
export let HEXAGON_SDK_DIR: string = paths.HEXAGON_SDK_PATH;

/**
 * 获取可能的 SDK 预构建目录
 * @returns string[]
 */
function getPossiblePrebuiltsDirs(): string[] {
  const currentCwd = process.cwd();
  const possibleRoots = [
    currentCwd,                                  // ./prebuilts
    path.join(currentCwd, '..'),                  // ../prebuilts
    path.join(currentCwd, '..', '..'),               // ../../prebuilts
  ];
  // 过滤掉无效路径和重复项，并确保它们是 prebuilts 目录
  return [...new Set(possibleRoots.map(p => path.join(p, 'prebuilts')))];
}

/**
 * 检查并下载/解压 Android NDK
 */
export async function ensureAndroidNdk() {
  await ensureDir(config.PREBUILTS_DIR); // 确保默认预构建目录存在

  const possibleNdkRootDirs = getPossiblePrebuiltsDirs();
  let foundNdkPath: string | null = null;
  const searchedPaths: string[] = [];

  for (const prebuiltDir of possibleNdkRootDirs) {
    const potentialNdkPath = path.join(prebuiltDir, `android-ndk-${config.ANDROID_NDK_VERSION}`);
    searchedPaths.push(potentialNdkPath);
    if (await pathExists(potentialNdkPath) && await pathExists(path.join(potentialNdkPath, 'build/cmake/android.toolchain.cmake'))) {
      foundNdkPath = potentialNdkPath;
      break;
    }
  }

  if (foundNdkPath) {
    ANDROID_NDK_DIR = foundNdkPath;
    console.log(chalk.green(`Android NDK 已存在: ${ANDROID_NDK_DIR}`));
    return;
  }

  console.log(chalk.yellow('未在以下路径发现 Android NDK:'));
  searchedPaths.forEach(p => console.log(`  • ${p}`));

  let action: string;
  try {
    ({ action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '未检测到 Android NDK，您想如何处理？',
        choices: [
          { name: '提供本地路径', value: 'local' },
          { name: '自动下载', value: 'download' },
          { name: '取消', value: 'abort' },
        ],
      },
    ]));
  } catch (e: any) {
    console.log(chalk.red('\n操作已取消。'));
    process.exit(1);
  }

  if (action === 'local') {
    const { localPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'localPath',
        message: '请输入本地 Android NDK 路径:',
        validate: async (input: string) => {
          const ok = await pathExists(path.join(input, 'build/cmake/android.toolchain.cmake'));
          return ok || '路径无效，未找到 android.toolchain.cmake';
        },
      },
    ]);
    ANDROID_NDK_DIR = localPath;
    console.log(chalk.green(`使用本地 Android NDK: ${ANDROID_NDK_DIR}`));
    return;
  } else if (action === 'download') {
    await checkAndDownloadFile(
      `https://dl.google.com/android/repository/android-ndk-${config.ANDROID_NDK_VERSION}-linux.zip`,
      paths.ANDROID_NDK_ZIP,
      `Android NDK ${config.ANDROID_NDK_VERSION}`
    );

    console.log(chalk.blue(`解压 Android NDK 到 ${config.PREBUILTS_DIR}...`));
    const spinner = ora('Decompressing...').start();
    try {
      const zip = new AdmZip(paths.ANDROID_NDK_ZIP);
      zip.extractAllTo(config.PREBUILTS_DIR, true);
      spinner.succeed(chalk.green('Android NDK 解压完成.'));
      ANDROID_NDK_DIR = paths.ANDROID_NDK; // 默认下载到预设路径
    } catch (error: any) {
      spinner.fail(chalk.red(`Android NDK 解压失败: ${error.message}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.red('已取消操作。'));
    process.exit(1);
  }
}

/**
 * 检查并下载/解压 Qualcomm QNN SDK
 */
export async function ensureQnnSdk() {
  await ensureDir(config.PREBUILTS_DIR); // 确保默认预构建目录存在

  const possibleQnnSdkRootDirs = getPossiblePrebuiltsDirs();
  let foundQnnPath: string | null = null;
  const searchedPaths: string[] = [];

  for (const prebuiltDir of possibleQnnSdkRootDirs) {
    const potentialQnnPath = path.join(prebuiltDir, 'QNN_SDK', `qairt/${config.QNN_SDK_VERSION}/`);
    searchedPaths.push(potentialQnnPath);
    if (await pathExists(potentialQnnPath)) {
      foundQnnPath = potentialQnnPath;
      break;
    }
  }

  if (foundQnnPath) {
    QNN_SDK_DIR = foundQnnPath;
    console.log(chalk.green(`Qualcomm QNN SDK 已存在: ${QNN_SDK_DIR}`));
    return;
  }

  const qnnSdkUrl = `https://softwarecenter.qualcomm.com/api/download/software/sdks/Qualcomm_AI_Runtime_Community/All/${config.QNN_SDK_VERSION}/v${config.QNN_SDK_VERSION}.zip`;

  let action: string;
  console.log(chalk.yellow('未在以下路径发现 Qualcomm QNN SDK:'));
  searchedPaths.forEach(p => console.log(`  • ${p}`));

  try {
    ({ action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '未检测到 Qualcomm QNN SDK，您想如何处理？',
        choices: [
          { name: '提供本地路径', value: 'local' },
          { name: '自动下载', value: 'download' },
          { name: '取消', value: 'abort' },
        ],
      },
    ]));
  } catch (e: any) {
    console.log(chalk.red('\n操作已取消。'));
    process.exit(1);
  }

  if (action === 'local') {
    const { localPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'localPath',
        message: '请输入本地 QNN SDK 路径:',
        validate: async (input: string) => (await pathExists(input)) || '路径无效',
      },
    ]);
    QNN_SDK_DIR = localPath;
    console.log(chalk.green(`使用本地 QNN SDK: ${QNN_SDK_DIR}`));
    return;
  } else if (action === 'download') {
    console.log(chalk.yellow(`\n请注意：Qualcomm QNN SDK 通常需要开发者账户才能下载。`));
    console.log(chalk.yellow(`如果下载失败，请手动从 ${qnnSdkUrl} 下载并放置在 ${config.PREBUILTS_DIR}。`));

    await checkAndDownloadFile(qnnSdkUrl, paths.QNN_SDK_ZIP, `Qualcomm QNN SDK ${config.QNN_SDK_VERSION}`);

    console.log(chalk.blue(`解压 Qualcomm QNN SDK 到 ${config.PREBUILTS_DIR}...`));
    const spinner = ora('Decompressing...').start();
    try {
      const zip = new AdmZip(paths.QNN_SDK_ZIP);
      zip.extractAllTo(config.PREBUILTS_DIR, true);
      spinner.succeed(chalk.green('Qualcomm QNN SDK 解压完成.'));
      QNN_SDK_DIR = paths.QNN_SDK_PATH;
    } catch (error: any) {
      spinner.fail(chalk.red(`Qualcomm QNN SDK 解压失败: ${error.message}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.red('已取消操作。'));
    process.exit(1);
  }
}

/**
 * 检查并下载/解压 Hexagon SDK
 */
export async function ensureHexagonSdk() {
  await ensureDir(paths.HEXAGON_SDK_DIR); // 确保默认预构建目录存在

  const possibleHexagonSdkRootDirs = getPossiblePrebuiltsDirs();
  let foundHexagonPath: string | null = null;
  const searchedPaths: string[] = [];

  for (const prebuiltDir of possibleHexagonSdkRootDirs) {
    const potentialHexagonPath = path.join(prebuiltDir, 'Hexagon_SDK', '6.2.0.1');
    searchedPaths.push(potentialHexagonPath);
    if (await pathExists(potentialHexagonPath) && await pathExists(path.join(potentialHexagonPath, 'tools/HEXAGON_Tools/8.8.06/NOTICE.txt'))) {
      foundHexagonPath = potentialHexagonPath;
      break;
    }
  }

  if (foundHexagonPath) {
    HEXAGON_SDK_DIR = foundHexagonPath;
    console.log(chalk.green(`Hexagon SDK 已存在: ${HEXAGON_SDK_DIR}`));
    return;
  }

  const hexagonSdkUrl = 'https://github.com/kantv-ai/toolchain/raw/refs/heads/main/minimal-hexagon-sdk-6.2.0.1.xz';

  let action: string;
  console.log(chalk.yellow('未在以下路径发现 Hexagon SDK:'));
  searchedPaths.forEach(p => console.log(`  • ${p}`));

  try {
    ({ action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '未检测到 Hexagon SDK，您想如何处理？',
        choices: [
          { name: '提供本地路径', value: 'local' },
          { name: '自动下载', value: 'download' },
          { name: '取消', value: 'abort' },
        ],
      },
    ]));
  } catch (e: any) {
    console.log(chalk.red('\n操作已取消。'));
    process.exit(1);
  }

  if (action === 'local') {
    const { localPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'localPath',
        message: '请输入本地 Hexagon SDK 路径:',
        validate: async (input: string) => {
          const ok = await pathExists(path.join(input, 'tools/HEXAGON_Tools/8.8.06/NOTICE.txt'));
          return ok || '路径无效，未找到 NOTICE.txt';
        },
      },
    ]);
    HEXAGON_SDK_DIR = localPath;
    console.log(chalk.green(`使用本地 Hexagon SDK: ${HEXAGON_SDK_DIR}`));
    return;
  } else if (action === 'download') {
    await checkAndDownloadFile(hexagonSdkUrl, paths.HEXAGON_MINIMAL_XZ, 'Minimal Hexagon SDK');

    console.log(chalk.blue(`解压 Minimal Hexagon SDK 到 ${paths.HEXAGON_SDK_DIR}...`));
    const spinner = ora('Decompressing...').start();
    try {
      // 使用 xzcat 解压 .xz 文件，并用 tar 解包
      const xzProcess = execa('xzcat', [paths.HEXAGON_MINIMAL_XZ]);
      const tarProcess = execa('tar', ['-C', paths.HEXAGON_SDK_DIR, '-xf', '-'], { stdin: xzProcess.stdout });
      await tarProcess;
      spinner.succeed(chalk.green('Minimal Hexagon SDK 解压完成.'));
      HEXAGON_SDK_DIR = paths.HEXAGON_SDK_PATH;
    } catch (error: any) {
      spinner.fail(chalk.red(`Minimal Hexagon SDK 解压失败: ${error.message}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.red('已取消操作。'));
    process.exit(1);
  }
} 