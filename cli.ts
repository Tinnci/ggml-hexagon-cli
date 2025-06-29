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
import { executeCommand, checkHostCommand } from './src/lib/system.js';
import { GLOBAL_YES, GLOBAL_VERBOSE, setGlobalYes, setGlobalVerbose } from './src/state.js';
import { ensureAndroidNdk, ensureQnnSdk, ensureHexagonSdk, ANDROID_NDK_DIR, QNN_SDK_DIR, HEXAGON_SDK_DIR } from './src/lib/sdk.js';
import { checkAndDownloadFile } from './src/lib/download.js';
import { scanForModels, checkAndDownloadPrebuiltModel } from './src/lib/models.js';
import { checkAndPushQnnLibs } from './src/lib/adb.js';
import { setupAction } from './src/commands/setup.js';
import { buildAction } from './src/commands/build.js';
import { cleanAction } from './src/commands/clean.js';
import { runAction } from './src/commands/run.js';
import { runBenchAction } from './src/commands/run-bench.js';
import { runTestOpsAction } from './src/commands/run-test-ops.js';

const program = new Command();

// === 全局选项 ===
program
  .option('-v, --verbose', '显示详细执行过程，不使用旋转指示器')
  .option('-y, --yes', '自动确认所有交互提示（使用默认选项）');

// --- 配置和常量 (可从原始脚本迁移) ---
// 从 config.ts 中导入常量
const MODELS_DIR = path.join(config.PROJECT_ROOT_PATH, 'models'); // 保持与之前逻辑一致，尽管扫描会向上查找
const REMOTE_ANDROID_PATH = '/data/local/tmp/';
const REMOTE_MODEL_PATH = '/sdcard/';

// --- 辅助函数 ---

/**
 * 检查并下载/解压 Hexagon SDK
 */


/**
 * 扫描目录寻找 .gguf 模型文件
 * @param dir - 要扫描的目录
 * @param depth - 当前搜索深度
 * @param maxDepth - 最大搜索深度
 * @returns 找到的模型文件路径数组
 */


/**
 * 扫描 models 文件夹，返回所有 .gguf 模型文件的列表
 */


/**
 * 检查并推送 QNN 运行时库到安卓设备
 */


/**
 * 检查并下载预构建模型
 */


// --- CLI 命令定义 ---

program
  .name('ggml-hexagon-cli')
  .description('一个用于构建和运行 ggml-hexagon 项目的交互式 CLI 工具')
  .version('1.0.0');

program
  .command('setup')
  .description('下载并准备 Android NDK, Qualcomm QNN SDK, Hexagon SDK')
  .action(setupAction);

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
  .action(buildAction);

program
  .command('clean')
  .description('删除构建输出目录')
  .action(cleanAction);

program
  .command('push-libs')
  .description('推送 QNN 运行时库到安卓设备')
  .action(checkAndPushQnnLibs);

program
  .command('update-models')
  .description('下载预构建模型并推送至安卓设备')
  .action(checkAndDownloadPrebuiltModel);

program
  .command('run')
  .description('在连接的安卓设备上运行一个模型')
  .option('-p, --prompt <prompt>', 'Prompt string for llama-cli', config.PROMPT_STRING.trim())
  .option('-n, --tokens <tokens>', 'Number of tokens to generate', '256')
  .option('-t, --threads <threads>', 'Number of threads to use', '8')
  .option('--no-cnv', 'Disable CNV (QNN backend specific)')
  .option('--model-path <path>', 'Full path to the model on the device', config.GGUF_MODEL_NAME)
  .action(runAction);

program
  .command('run-bench')
  .description('在连接的安卓设备上运行 llama-bench')
  .option('--model-path <path>', 'Full path to the model on the device', config.GGUF_MODEL_NAME)
  .action(runBenchAction);

program
  .command('run-test-ops')
  .description('在连接的安卓设备上运行 test-backend-ops')
  .option('-o, --op <opname>', 'Specific operation to test, e.g., ADD/MUL_MAT')
  .action(runTestOpsAction);

program.parse(process.argv);

// 解析全局选项
const globalOpts = program.opts();
setGlobalVerbose(!!globalOpts.verbose);
setGlobalYes(!!globalOpts.yes);
// 导出供其他模块使用（如有需要）
export { GLOBAL_VERBOSE, GLOBAL_YES };
