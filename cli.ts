import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { execa } from 'execa';
import fsExtra from 'fs-extra';
const { readdir, pathExists, mkdir, ensureDir } = fsExtra;
import path from 'path';
import ora from 'ora';
import { config, paths } from './config.js';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createGunzip } from 'zlib';
import AdmZip from 'adm-zip';

const program = new Command();

// === 全局选项 ===
program
  .option('-v, --verbose', '显示详细执行过程，不使用旋转指示器')
  .option('-y, --yes', '自动确认所有交互提示（使用默认选项）');

// 全局状态变量，稍后在 program.parse 之后赋值
let GLOBAL_VERBOSE = false;
let GLOBAL_YES = false;

// --- 配置和常量 (可从原始脚本迁移) ---
// 从 config.ts 中导入常量
const MODELS_DIR = path.join(config.PROJECT_ROOT_PATH, 'models'); // 保持与之前逻辑一致，尽管扫描会向上查找
const REMOTE_ANDROID_PATH = '/data/local/tmp/';
const REMOTE_MODEL_PATH = '/sdcard/';

// 全局可变 SDK 路径，初始化为默认 paths 中的值
let ANDROID_NDK_DIR: string = paths.ANDROID_NDK;
let QNN_SDK_DIR: string = paths.QNN_SDK_PATH;
let HEXAGON_SDK_DIR: string = paths.HEXAGON_SDK_PATH;

// --- 辅助函数 ---

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
 * 执行一个 shell 命令并实时显示其输出
 * @param command - 要执行的命令字符串
 * @param args - 命令的参数数组
 * @param options - execa 选项
 */
async function executeCommand(command: string, args: string[], options?: {
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
 * 检查并下载文件
 * @param url - 文件下载地址
 * @param outputPath - 文件保存路径
 * @param fileName - 文件名（用于显示）
 */
async function checkAndDownloadFile(url: string, outputPath: string, fileName: string) {
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

/**
 * 检查命令是否存在于主机上
 */
async function checkHostCommand(cmd: string) {
  try {
    await execa('which', [cmd]);
    console.log(chalk.green(`${cmd} 已安装`));
  } catch (error) {
    console.log(chalk.red(`${cmd} 未安装。请先安装 ${cmd}。`));
    process.exit(1);
  }
}

/**
 * 检查并下载/解压 Android NDK
 */
async function ensureAndroidNdk() {
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
async function ensureQnnSdk() {
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
async function ensureHexagonSdk() {
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

/**
 * 扫描目录寻找 .gguf 模型文件
 * @param dir - 要扫描的目录
 * @param depth - 当前搜索深度
 * @param maxDepth - 最大搜索深度
 * @returns 找到的模型文件路径数组
 */
async function findModelsInDirectory(dir: string, depth: number = 0, maxDepth: number = 3): Promise<string[]> {
  if (depth > maxDepth || !(await pathExists(dir))) {
    return [];
  }

  const files = await readdir(dir, { withFileTypes: true });
  let models: string[] = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      // 递归搜索子目录
      const subDirModels = await findModelsInDirectory(fullPath, depth + 1, maxDepth);
      models = [...models, ...subDirModels];
    } else if (file.isFile() && file.name.endsWith('.gguf')) {
      // 找到模型文件
      models.push(fullPath);
    }
  }

  return models;
}

/**
 * 扫描 models 文件夹，返回所有 .gguf 模型文件的列表
 */
async function scanForModels(): Promise<string[]> {
  // 尝试多个可能的模型目录位置
  const possibleModelDirs = [
    MODELS_DIR,                               // 当前目录下的models
    path.join(config.PROJECT_ROOT_PATH, '..', 'models'), // 上级目录的models
    path.join(config.PROJECT_ROOT_PATH, '..', '..', 'models'), // 上上级目录的models
  ];

  let foundModels: string[] = [];
  
  // 尝试在各个可能的目录中查找模型
  for (const dir of possibleModelDirs) {
    if (await pathExists(dir)) {
      console.log(chalk.blue(`Searching for models in: ${dir}`));
      const models = await findModelsInDirectory(dir);
      if (models.length > 0) {
        foundModels = [...foundModels, ...models];
      }
    }
  }

  // 如果没有找到任何模型，提示创建目录
  if (foundModels.length === 0) {
    console.log(chalk.yellow(`\nNo model directories found in the expected locations.`));
    const { createDir } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createDir',
        message: 'Would you like to create the models directory?',
        default: true,
      },
    ]);

    if (createDir) {
      await mkdir(MODELS_DIR);
      console.log(chalk.green(`Models directory created at: ${MODELS_DIR}`));
    } else {
      console.log(chalk.red('Cannot proceed without a models directory. Operation cancelled.'));
    }
  }
  
  return foundModels;
}

/**
 * 检查并推送 QNN 运行时库到安卓设备
 */
async function checkAndPushQnnLibs() {
  console.log(chalk.blue('检查并推送 QNN 运行时库...'));
  // 检查设备上是否已存在 QNN 库
  try {
    await executeCommand('adb', ['shell', `ls ${REMOTE_ANDROID_PATH}/libQnnCpu.so`]);
    console.log(chalk.green('QNN 运行时库已存在于设备上，跳过推送。'));
    return;
  } catch (error) {
    console.log(chalk.yellow('QNN 运行时库不存在或不完整，开始推送...'));
  }

  const qnnLibPath = `${QNN_SDK_DIR}lib/aarch64-android/`;
  const hexagonLibPath = `${QNN_SDK_DIR}lib/hexagon-${config.HTP_ARCH_VERSION}/unsigned/`;

  const libsToPush = [
    'libQnnSystem.so',
    'libQnnCpu.so',
    'libQnnGpu.so',
    'libQnnHtp.so',
    'libQnnHtpNetRunExtensions.so',
    'libQnnHtpPrepare.so',
    `libQnnHtp${config.HTP_ARCH_VERSION_A}Stub.so`,
  ];

  for (const lib of libsToPush) {
    await executeCommand('adb', ['push', path.join(qnnLibPath, lib), REMOTE_ANDROID_PATH]);
  }

  // 推送 Hexagon 相关的 lib
  await executeCommand('adb', ['push', path.join(hexagonLibPath, `libQnnHtp${config.HTP_ARCH_VERSION_A}Skel.so`), REMOTE_ANDROID_PATH]);
  await executeCommand('adb', ['push', './scripts/ggml-hexagon.cfg', REMOTE_ANDROID_PATH]);

  console.log(chalk.green('QNN 运行时库推送完成。'));
}

/**
 * 检查并下载预构建模型
 */
async function checkAndDownloadPrebuiltModel() {
  console.log(chalk.blue(`检查并下载预构建模型 ${path.basename(config.GGUF_MODEL_NAME)}...`));
  try {
    // 检查手机上是否已存在模型
    await executeCommand('adb', ['shell', `ls ${config.GGUF_MODEL_NAME}`]);
    console.log(chalk.green('预构建模型已存在于设备上，跳过下载和推送。'));
    return;
  } catch (error) {
    console.log(chalk.yellow('预构建模型不存在于设备上，开始下载和推送...'));
  }

  const modelFileName = path.basename(config.GGUF_MODEL_NAME);
  const localModelPath = path.join(MODELS_DIR, modelFileName);

  // 确保本地 models 目录存在
  await ensureDir(MODELS_DIR);

  const modelUrl = 'https://huggingface.co/Qwen/Qwen1.5-1.8B-Chat-GGUF/resolve/main/qwen1_5-1_8b-chat-q4_0.gguf';
  await checkAndDownloadFile(modelUrl, localModelPath, modelFileName);

  // 推送模型到设备
  await executeCommand('adb', ['push', localModelPath, config.GGUF_MODEL_NAME]);
  console.log(chalk.green('预构建模型推送完成。'));
}

// --- CLI 命令定义 ---

program
  .name('ggml-hexagon-cli')
  .description('一个用于构建和运行 ggml-hexagon 项目的交互式 CLI 工具')
  .version('1.0.0');

program
  .command('setup')
  .description('下载并准备 Android NDK, Qualcomm QNN SDK, Hexagon SDK')
  .action(async () => {
    console.log(chalk.blue('🚀  开始设置开发环境...'));
    await checkHostCommand('wget');
    await checkHostCommand('xzcat');
    await checkHostCommand('unzip');
    await ensureAndroidNdk();
    await ensureQnnSdk();
    await ensureHexagonSdk();
    console.log(chalk.green.bold('🎉  环境设置完成！'));
  });

program
  .command('build')
  .description('编译整个项目 (llama.cpp + ggml-hexagon backend)')
  .option('-d, --debug', '启用 Debug 构建')
  .option('-t, --build-type <type>', '构建类型 (Release/Debug/RelWithDebInfo/MinSizeRel)')
  .option('--openmp', '启用 OpenMP 支持')
  .option('--curl', '启用 LLAMA_CURL (允许从 URL 下载模型)')
  .option('--abi <abi>', 'Android ABI (arm64-v8a, armeabi-v7a 等)', 'arm64-v8a')
  .option('--cmake-args [args...]', '附加传递给 CMake 的自定义参数')
  .option('--no-clean', '增量构建（保留已有 out/android 目录）')
  .option('--all-warnings', '启用所有编译器警告')
  .option('--fatal-warnings', '将编译器警告视为错误 (-Werror)')
  .option('--sanitize-thread', '启用线程消毒器 (-fsanitize=thread)')
  .option('--sanitize-address', '启用地址消毒器 (-fsanitize=address)')
  .option('--sanitize-undefined', '启用未定义行为消毒器 (-fsanitize=undefined)')
  .option('--build-tests', '构建测试程序')
  .option('--build-tools', '构建工具程序')
  .option('--build-examples', '构建示例程序')
  .option('--build-server', '构建服务器程序')
  .action(async (options) => {
    console.log(chalk.blue('🚀  开始构建项目...'));

    await ensureAndroidNdk();
    await ensureQnnSdk();
    await ensureHexagonSdk();

    const buildDir = path.join(config.PROJECT_ROOT_PATH, 'out', 'android');

    // === 处理构建目录 ===
    if (!options.noClean && (await pathExists(buildDir))) {
      if (GLOBAL_YES) {
        await fsExtra.remove(buildDir);
      } else {
        const { confirmClean } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmClean',
            message: `检测到已有构建目录 ${buildDir}，是否删除并重新构建？`,
            default: true,
          },
        ]);
        if (confirmClean) {
          await fsExtra.remove(buildDir);
        } else {
          console.log(chalk.yellow('保留旧构建目录，将进行增量构建。'));
        }
      }
    }

    // 解析构建类型
    const buildType: string = options.buildType ?? (options.debug ? 'Debug' : 'Release');
    const openmpFlag = options.openmp ? 'ON' : 'OFF';
    const curlFlag   = options.curl   ? 'ON' : 'OFF';

    const cmakeArgs = [
      '-S', config.PROJECT_ROOT_PATH,
      '-B', buildDir,
      `-DCMAKE_BUILD_TYPE=${buildType}`,
      `-DGGML_OPENMP=${openmpFlag}`,
      `-DCMAKE_TOOLCHAIN_FILE=${ANDROID_NDK_DIR}/build/cmake/android.toolchain.cmake`,
      `-DANDROID_ABI=${options.abi}`,
      `-DANDROID_PLATFORM=${config.ANDROID_PLATFORM}`,
      '-DGGML_HEXAGON=ON',
      `-DLLAMA_CURL=${curlFlag}`,
      `-DQNN_SDK_PATH=${QNN_SDK_DIR}`,
      `-DHEXAGON_SDK_PATH=${HEXAGON_SDK_DIR}`,
      `-DHTP_ARCH_VERSION=${config.HTP_ARCH_VERSION}`,
    ];

    // 添加新的编译选项
    if (options.allWarnings) {
      cmakeArgs.push('-DLLAMA_ALL_WARNINGS=ON');
    }
    if (options.fatalWarnings) {
      cmakeArgs.push('-DLLAMA_FATAL_WARNINGS=ON');
    }
    if (options.sanitizeThread) {
      cmakeArgs.push('-DLLAMA_SANITIZE_THREAD=ON');
    }
    if (options.sanitizeAddress) {
      cmakeArgs.push('-DLLAMA_SANITIZE_ADDRESS=ON');
    }
    if (options.sanitizeUndefined) {
      cmakeArgs.push('-DLLAMA_SANITIZE_UNDEFINED=ON');
    }
    if (options.buildTests) {
      cmakeArgs.push('-DLLAMA_BUILD_TESTS=ON');
    }
    if (options.buildTools) {
      cmakeArgs.push('-DLLAMA_BUILD_TOOLS=ON');
    }
    if (options.buildExamples) {
      cmakeArgs.push('-DLLAMA_BUILD_EXAMPLES=ON');
    }
    if (options.buildServer) {
      cmakeArgs.push('-DLLAMA_BUILD_SERVER=ON');
    }

    // 追加用户自定义的 CMake 参数
    if (options.cmakeArgs && Array.isArray(options.cmakeArgs)) {
      cmakeArgs.push(...options.cmakeArgs);
    }

    // === 列出将要使用的 CMake 参数 ===
    console.log(chalk.blue('\n📋  即将使用以下 CMake 参数：'));
    cmakeArgs.forEach(arg => console.log('  ' + arg));

    // 构建确认
    if (!GLOBAL_YES) {
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: '继续执行构建吗？',
          default: true,
        },
      ]);
      if (!proceed) {
        console.log(chalk.yellow('构建已取消。'));
        return;
      }
    }

    await executeCommand('cmake', cmakeArgs);
    await executeCommand('make', ['-C', buildDir, '-j', `${process.cpuUsage().user}`]);
    console.log(chalk.green.bold('🎉  构建完成！'));
  });

program
  .command('clean')
  .description('删除构建输出目录')
  .action(async () => {
    const buildDir = path.join(config.PROJECT_ROOT_PATH, 'out', 'android');
    if (await pathExists(buildDir)) {
      console.log(chalk.blue(`清理构建目录: ${buildDir}`));
      await fsExtra.remove(buildDir);
      console.log(chalk.green('清理完成。'));
    } else {
      console.log(chalk.yellow('构建目录不存在，无需清理。'));
    }
  });

program
  .command('push-libs')
  .description('推送 QNN 运行时库到安卓设备')
  .action(async () => {
    await checkAndPushQnnLibs();
  });

program
  .command('update-models')
  .description('下载预构建模型并推送至安卓设备')
  .action(async () => {
    await checkAndDownloadPrebuiltModel();
  });

program
  .command('run')
  .description('在连接的安卓设备上运行一个模型')
  .option('-p, --prompt <prompt>', 'Prompt string for llama-cli', config.PROMPT_STRING.trim())
  .option('-n, --tokens <tokens>', 'Number of tokens to generate', '256')
  .option('-t, --threads <threads>', 'Number of threads to use', '8')
  .option('--no-cnv', 'Disable CNV (QNN backend specific)')
  .option('--model-path <path>', 'Full path to the model on the device', config.GGUF_MODEL_NAME)
  .action(async (options) => {
    console.log(chalk.blue('🔍  扫描可用模型...'));
    const models = await scanForModels();

    if (models.length === 0) {
      console.log(chalk.red('在任何搜索目录中都未找到 .gguf 模型。'));
      console.log(chalk.yellow('请下载模型并首先放置到 models 目录中。'));
      return;
    }

    // 提取模型名称用于显示
    const modelChoices = models.map(modelPath => ({
      name: `${path.basename(modelPath)} (${path.dirname(modelPath)})`,
      value: modelPath
    }));

    // 交互式提问
    const { selectedModel } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedModel',
        message: '您想运行哪个模型？',
        choices: modelChoices,
      },
    ]);
    
    const { confirmation } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmation',
            message: `您即将运行 ${chalk.cyan(path.basename(selectedModel))}。继续吗？`,
            default: true,
        }
    ]);

    if (!confirmation) {
        console.log(chalk.yellow('操作已取消。'));
        return;
    }

    console.log(chalk.blue(`🚀  准备运行 ${path.basename(selectedModel)}...`));

    // 确保核心库和可执行文件已存在于设备上
    await checkAndPushQnnLibs();

    // 推送选择的模型
    const remoteModelFullPath = path.join(REMOTE_MODEL_PATH, path.basename(selectedModel)).replace(/\\/g, '/');
    await executeCommand('adb', ['push', selectedModel, remoteModelFullPath]);

    // 推送 llama-cli 可执行文件
    const llamaCliPath = path.join(config.PROJECT_ROOT_PATH, 'out/android/bin/llama-cli');
    if (!(await pathExists(llamaCliPath))) {
      console.log(chalk.red(`llama-cli 可执行文件未找到: ${llamaCliPath}`));
      console.log(chalk.yellow('请先运行 ' + chalk.cyan('ggml-hexagon-cli build') + ' 命令。'));
      return;
    }
    await executeCommand('adb', ['push', llamaCliPath, REMOTE_ANDROID_PATH]);
    await executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-cli`]);

    // 构造运行命令
    let remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./llama-cli -m ${remoteModelFullPath}`;
    // 添加运行参数
    remoteCommand += ` -n ${options.tokens} -p "${options.prompt}"`;
    if (options.noCnv) {
      remoteCommand += ' -no-cnv';
    }
    remoteCommand += ` -t ${options.threads}`;
    // 保持与 shell 脚本一致的 running_params
    remoteCommand += ` ${config.RUNNING_PARAMS}`;

    await executeCommand('adb', ['shell', remoteCommand]);
  });

program
  .command('run-bench')
  .description('在连接的安卓设备上运行 llama-bench')
  .option('--model-path <path>', 'Full path to the model on the device', config.GGUF_MODEL_NAME)
  .action(async (options) => {
    console.log(chalk.blue('🚀  准备运行 llama-bench...'));

    // 确保核心库和可执行文件已存在于设备上
    await checkAndPushQnnLibs();
    await checkAndDownloadPrebuiltModel(); // 确保默认模型已在设备上

    // 推送 llama-bench 可执行文件
    const llamaBenchPath = path.join(config.PROJECT_ROOT_PATH, 'out/android/bin/llama-bench');
    if (!(await pathExists(llamaBenchPath))) {
      console.log(chalk.red(`llama-bench 可执行文件未找到: ${llamaBenchPath}`));
      console.log(chalk.yellow('请先运行 ' + chalk.cyan('ggml-hexagon-cli build') + ' 命令。'));
      return;
    }
    await executeCommand('adb', ['push', llamaBenchPath, REMOTE_ANDROID_PATH]);
    await executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-bench`]);

    // 构造运行命令
    const remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./llama-bench -m ${options.modelPath} ${config.RUNNING_PARAMS}`;
    await executeCommand('adb', ['shell', remoteCommand]);
  });

program
  .command('run-test-ops')
  .description('在连接的安卓设备上运行 test-backend-ops')
  .option('-o, --op <opname>', 'Specific operation to test, e.g., ADD/MUL_MAT')
  .action(async (options) => {
    console.log(chalk.blue('🚀  准备运行 test-backend-ops...'));

    // 确保核心库已存在于设备上
    await checkAndPushQnnLibs();

    // 推送 test-backend-ops 可执行文件
    const testOpsPath = path.join(config.PROJECT_ROOT_PATH, 'out/android/bin/test-backend-ops');
    if (!(await pathExists(testOpsPath))) {
      console.log(chalk.red(`test-backend-ops 可执行文件未找到: ${testOpsPath}`));
      console.log(chalk.yellow('请先运行 ' + chalk.cyan('ggml-hexagon-cli build') + ' 命令。'));
      return;
    }
    await executeCommand('adb', ['push', testOpsPath, REMOTE_ANDROID_PATH]);
    await executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/test-backend-ops`]);

    let remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./test-backend-ops test`;

    if (options.op) {
      remoteCommand += ` -o ${options.op}`;
    }

    await executeCommand('adb', ['shell', remoteCommand]);
  });

program.parse(process.argv);

// 解析全局选项
const globalOpts = program.opts();
GLOBAL_VERBOSE = !!globalOpts.verbose;
GLOBAL_YES = !!globalOpts.yes;
// 导出供其他模块使用（如有需要）
export { GLOBAL_VERBOSE, GLOBAL_YES };
