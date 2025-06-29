var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
import AdmZip from 'adm-zip';
const program = new Command();
// --- 配置和常量 (可从原始脚本迁移) ---
// 从 config.ts 中导入常量
const MODELS_DIR = path.join(config.PROJECT_ROOT_PATH, 'models'); // 保持与之前逻辑一致，尽管扫描会向上查找
const REMOTE_ANDROID_PATH = '/data/local/tmp/';
const REMOTE_MODEL_PATH = '/sdcard/';
// 全局可变 SDK 路径，初始化为默认 paths 中的值
let ANDROID_NDK_DIR = paths.ANDROID_NDK;
let QNN_SDK_DIR = paths.QNN_SDK_PATH;
let HEXAGON_SDK_DIR = paths.HEXAGON_SDK_PATH;
// --- 辅助函数 ---
/**
 * 获取可能的 SDK 预构建目录
 * @returns string[]
 */
function getPossiblePrebuiltsDirs() {
    const currentCwd = process.cwd();
    const possibleRoots = [
        currentCwd, // ./prebuilts
        path.join(currentCwd, '..'), // ../prebuilts
        path.join(currentCwd, '..', '..'), // ../../prebuilts
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
function executeCommand(command, args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const fullCommand = `${command} ${args.join(' ')}`;
        const spinner = ora(chalk.yellow(`Executing: ${fullCommand}`)).start();
        try {
            const subprocess = execa(command, args, options);
            (_a = subprocess.stdout) === null || _a === void 0 ? void 0 : _a.pipe(process.stdout);
            (_b = subprocess.stderr) === null || _b === void 0 ? void 0 : _b.pipe(process.stderr);
            yield subprocess;
            spinner.succeed(chalk.green(`Successfully executed: ${fullCommand}`));
        }
        catch (error) {
            spinner.fail(chalk.red(`Error executing command: ${fullCommand}`));
            console.error(chalk.red(`\n❌  Error details: ${error.message}`));
            process.exit(1); // 出错时退出
        }
    });
}
/**
 * 检查并下载文件
 * @param url - 文件下载地址
 * @param outputPath - 文件保存路径
 * @param fileName - 文件名（用于显示）
 */
function checkAndDownloadFile(url, outputPath, fileName) {
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
/**
 * 检查命令是否存在于主机上
 */
function checkHostCommand(cmd) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield execa('which', [cmd]);
            console.log(chalk.green(`${cmd} 已安装`));
        }
        catch (error) {
            console.log(chalk.red(`${cmd} 未安装。请先安装 ${cmd}。`));
            process.exit(1);
        }
    });
}
/**
 * 检查并下载/解压 Android NDK
 */
function ensureAndroidNdk() {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureDir(config.PREBUILTS_DIR); // 确保默认预构建目录存在
        const possibleNdkRootDirs = getPossiblePrebuiltsDirs();
        let foundNdkPath = null;
        const searchedPaths = [];
        for (const prebuiltDir of possibleNdkRootDirs) {
            const potentialNdkPath = path.join(prebuiltDir, `android-ndk-${config.ANDROID_NDK_VERSION}`);
            searchedPaths.push(potentialNdkPath);
            if ((yield pathExists(potentialNdkPath)) && (yield pathExists(path.join(potentialNdkPath, 'build/cmake/android.toolchain.cmake')))) {
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
        let action;
        try {
            ({ action } = yield inquirer.prompt([
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
        }
        catch (e) {
            console.log(chalk.red('\n操作已取消。'));
            process.exit(1);
        }
        if (action === 'local') {
            const { localPath } = yield inquirer.prompt([
                {
                    type: 'input',
                    name: 'localPath',
                    message: '请输入本地 Android NDK 路径:',
                    validate: (input) => __awaiter(this, void 0, void 0, function* () {
                        const ok = yield pathExists(path.join(input, 'build/cmake/android.toolchain.cmake'));
                        return ok || '路径无效，未找到 android.toolchain.cmake';
                    }),
                },
            ]);
            ANDROID_NDK_DIR = localPath;
            console.log(chalk.green(`使用本地 Android NDK: ${ANDROID_NDK_DIR}`));
            return;
        }
        else if (action === 'download') {
            yield checkAndDownloadFile(`https://dl.google.com/android/repository/android-ndk-${config.ANDROID_NDK_VERSION}-linux.zip`, paths.ANDROID_NDK_ZIP, `Android NDK ${config.ANDROID_NDK_VERSION}`);
            console.log(chalk.blue(`解压 Android NDK 到 ${config.PREBUILTS_DIR}...`));
            const spinner = ora('Decompressing...').start();
            try {
                const zip = new AdmZip(paths.ANDROID_NDK_ZIP);
                zip.extractAllTo(config.PREBUILTS_DIR, true);
                spinner.succeed(chalk.green('Android NDK 解压完成.'));
                ANDROID_NDK_DIR = paths.ANDROID_NDK; // 默认下载到预设路径
            }
            catch (error) {
                spinner.fail(chalk.red(`Android NDK 解压失败: ${error.message}`));
                process.exit(1);
            }
        }
        else {
            console.log(chalk.red('已取消操作。'));
            process.exit(1);
        }
    });
}
/**
 * 检查并下载/解压 Qualcomm QNN SDK
 */
function ensureQnnSdk() {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureDir(config.PREBUILTS_DIR); // 确保默认预构建目录存在
        const possibleQnnSdkRootDirs = getPossiblePrebuiltsDirs();
        let foundQnnPath = null;
        const searchedPaths = [];
        for (const prebuiltDir of possibleQnnSdkRootDirs) {
            const potentialQnnPath = path.join(prebuiltDir, 'QNN_SDK', `qairt/${config.QNN_SDK_VERSION}/`);
            searchedPaths.push(potentialQnnPath);
            if (yield pathExists(potentialQnnPath)) {
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
        let action;
        console.log(chalk.yellow('未在以下路径发现 Qualcomm QNN SDK:'));
        searchedPaths.forEach(p => console.log(`  • ${p}`));
        try {
            ({ action } = yield inquirer.prompt([
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
        }
        catch (e) {
            console.log(chalk.red('\n操作已取消。'));
            process.exit(1);
        }
        if (action === 'local') {
            const { localPath } = yield inquirer.prompt([
                {
                    type: 'input',
                    name: 'localPath',
                    message: '请输入本地 QNN SDK 路径:',
                    validate: (input) => __awaiter(this, void 0, void 0, function* () { return (yield pathExists(input)) || '路径无效'; }),
                },
            ]);
            QNN_SDK_DIR = localPath;
            console.log(chalk.green(`使用本地 QNN SDK: ${QNN_SDK_DIR}`));
            return;
        }
        else if (action === 'download') {
            console.log(chalk.yellow(`\n请注意：Qualcomm QNN SDK 通常需要开发者账户才能下载。`));
            console.log(chalk.yellow(`如果下载失败，请手动从 ${qnnSdkUrl} 下载并放置在 ${config.PREBUILTS_DIR}。`));
            yield checkAndDownloadFile(qnnSdkUrl, paths.QNN_SDK_ZIP, `Qualcomm QNN SDK ${config.QNN_SDK_VERSION}`);
            console.log(chalk.blue(`解压 Qualcomm QNN SDK 到 ${config.PREBUILTS_DIR}...`));
            const spinner = ora('Decompressing...').start();
            try {
                const zip = new AdmZip(paths.QNN_SDK_ZIP);
                zip.extractAllTo(config.PREBUILTS_DIR, true);
                spinner.succeed(chalk.green('Qualcomm QNN SDK 解压完成.'));
                QNN_SDK_DIR = paths.QNN_SDK_PATH;
            }
            catch (error) {
                spinner.fail(chalk.red(`Qualcomm QNN SDK 解压失败: ${error.message}`));
                process.exit(1);
            }
        }
        else {
            console.log(chalk.red('已取消操作。'));
            process.exit(1);
        }
    });
}
/**
 * 检查并下载/解压 Hexagon SDK
 */
function ensureHexagonSdk() {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureDir(paths.HEXAGON_SDK_DIR); // 确保默认预构建目录存在
        const possibleHexagonSdkRootDirs = getPossiblePrebuiltsDirs();
        let foundHexagonPath = null;
        const searchedPaths = [];
        for (const prebuiltDir of possibleHexagonSdkRootDirs) {
            const potentialHexagonPath = path.join(prebuiltDir, 'Hexagon_SDK', '6.2.0.1');
            searchedPaths.push(potentialHexagonPath);
            if ((yield pathExists(potentialHexagonPath)) && (yield pathExists(path.join(potentialHexagonPath, 'tools/HEXAGON_Tools/8.8.06/NOTICE.txt')))) {
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
        let action;
        console.log(chalk.yellow('未在以下路径发现 Hexagon SDK:'));
        searchedPaths.forEach(p => console.log(`  • ${p}`));
        try {
            ({ action } = yield inquirer.prompt([
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
        }
        catch (e) {
            console.log(chalk.red('\n操作已取消。'));
            process.exit(1);
        }
        if (action === 'local') {
            const { localPath } = yield inquirer.prompt([
                {
                    type: 'input',
                    name: 'localPath',
                    message: '请输入本地 Hexagon SDK 路径:',
                    validate: (input) => __awaiter(this, void 0, void 0, function* () {
                        const ok = yield pathExists(path.join(input, 'tools/HEXAGON_Tools/8.8.06/NOTICE.txt'));
                        return ok || '路径无效，未找到 NOTICE.txt';
                    }),
                },
            ]);
            HEXAGON_SDK_DIR = localPath;
            console.log(chalk.green(`使用本地 Hexagon SDK: ${HEXAGON_SDK_DIR}`));
            return;
        }
        else if (action === 'download') {
            yield checkAndDownloadFile(hexagonSdkUrl, paths.HEXAGON_MINIMAL_XZ, 'Minimal Hexagon SDK');
            console.log(chalk.blue(`解压 Minimal Hexagon SDK 到 ${paths.HEXAGON_SDK_DIR}...`));
            const spinner = ora('Decompressing...').start();
            try {
                // 使用 xzcat 解压 .xz 文件，并用 tar 解包
                const xzProcess = execa('xzcat', [paths.HEXAGON_MINIMAL_XZ]);
                const tarProcess = execa('tar', ['-C', paths.HEXAGON_SDK_DIR, '-xf', '-'], { stdin: xzProcess.stdout });
                yield tarProcess;
                spinner.succeed(chalk.green('Minimal Hexagon SDK 解压完成.'));
                HEXAGON_SDK_DIR = paths.HEXAGON_SDK_PATH;
            }
            catch (error) {
                spinner.fail(chalk.red(`Minimal Hexagon SDK 解压失败: ${error.message}`));
                process.exit(1);
            }
        }
        else {
            console.log(chalk.red('已取消操作。'));
            process.exit(1);
        }
    });
}
/**
 * 扫描目录寻找 .gguf 模型文件
 * @param dir - 要扫描的目录
 * @param depth - 当前搜索深度
 * @param maxDepth - 最大搜索深度
 * @returns 找到的模型文件路径数组
 */
function findModelsInDirectory(dir_1) {
    return __awaiter(this, arguments, void 0, function* (dir, depth = 0, maxDepth = 3) {
        if (depth > maxDepth || !(yield pathExists(dir))) {
            return [];
        }
        const files = yield readdir(dir, { withFileTypes: true });
        let models = [];
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                // 递归搜索子目录
                const subDirModels = yield findModelsInDirectory(fullPath, depth + 1, maxDepth);
                models = [...models, ...subDirModels];
            }
            else if (file.isFile() && file.name.endsWith('.gguf')) {
                // 找到模型文件
                models.push(fullPath);
            }
        }
        return models;
    });
}
/**
 * 扫描 models 文件夹，返回所有 .gguf 模型文件的列表
 */
function scanForModels() {
    return __awaiter(this, void 0, void 0, function* () {
        // 尝试多个可能的模型目录位置
        const possibleModelDirs = [
            MODELS_DIR, // 当前目录下的models
            path.join(config.PROJECT_ROOT_PATH, '..', 'models'), // 上级目录的models
            path.join(config.PROJECT_ROOT_PATH, '..', '..', 'models'), // 上上级目录的models
        ];
        let foundModels = [];
        // 尝试在各个可能的目录中查找模型
        for (const dir of possibleModelDirs) {
            if (yield pathExists(dir)) {
                console.log(chalk.blue(`Searching for models in: ${dir}`));
                const models = yield findModelsInDirectory(dir);
                if (models.length > 0) {
                    foundModels = [...foundModels, ...models];
                }
            }
        }
        // 如果没有找到任何模型，提示创建目录
        if (foundModels.length === 0) {
            console.log(chalk.yellow(`\nNo model directories found in the expected locations.`));
            const { createDir } = yield inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'createDir',
                    message: 'Would you like to create the models directory?',
                    default: true,
                },
            ]);
            if (createDir) {
                yield mkdir(MODELS_DIR);
                console.log(chalk.green(`Models directory created at: ${MODELS_DIR}`));
            }
            else {
                console.log(chalk.red('Cannot proceed without a models directory. Operation cancelled.'));
            }
        }
        return foundModels;
    });
}
/**
 * 检查并推送 QNN 运行时库到安卓设备
 */
function checkAndPushQnnLibs() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(chalk.blue('检查并推送 QNN 运行时库...'));
        // 检查设备上是否已存在 QNN 库
        try {
            yield executeCommand('adb', ['shell', `ls ${REMOTE_ANDROID_PATH}/libQnnCpu.so`]);
            console.log(chalk.green('QNN 运行时库已存在于设备上，跳过推送。'));
            return;
        }
        catch (error) {
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
            yield executeCommand('adb', ['push', path.join(qnnLibPath, lib), REMOTE_ANDROID_PATH]);
        }
        // 推送 Hexagon 相关的 lib
        yield executeCommand('adb', ['push', path.join(hexagonLibPath, `libQnnHtp${config.HTP_ARCH_VERSION_A}Skel.so`), REMOTE_ANDROID_PATH]);
        yield executeCommand('adb', ['push', './scripts/ggml-hexagon.cfg', REMOTE_ANDROID_PATH]);
        console.log(chalk.green('QNN 运行时库推送完成。'));
    });
}
/**
 * 检查并下载预构建模型
 */
function checkAndDownloadPrebuiltModel() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(chalk.blue(`检查并下载预构建模型 ${path.basename(config.GGUF_MODEL_NAME)}...`));
        try {
            // 检查手机上是否已存在模型
            yield executeCommand('adb', ['shell', `ls ${config.GGUF_MODEL_NAME}`]);
            console.log(chalk.green('预构建模型已存在于设备上，跳过下载和推送。'));
            return;
        }
        catch (error) {
            console.log(chalk.yellow('预构建模型不存在于设备上，开始下载和推送...'));
        }
        const modelFileName = path.basename(config.GGUF_MODEL_NAME);
        const localModelPath = path.join(MODELS_DIR, modelFileName);
        // 确保本地 models 目录存在
        yield ensureDir(MODELS_DIR);
        const modelUrl = 'https://huggingface.co/Qwen/Qwen1.5-1.8B-Chat-GGUF/resolve/main/qwen1_5-1_8b-chat-q4_0.gguf';
        yield checkAndDownloadFile(modelUrl, localModelPath, modelFileName);
        // 推送模型到设备
        yield executeCommand('adb', ['push', localModelPath, config.GGUF_MODEL_NAME]);
        console.log(chalk.green('预构建模型推送完成。'));
    });
}
// --- CLI 命令定义 ---
program
    .name('ggml-hexagon-cli')
    .description('一个用于构建和运行 ggml-hexagon 项目的交互式 CLI 工具')
    .version('1.0.0');
program
    .command('setup')
    .description('下载并准备 Android NDK, Qualcomm QNN SDK, Hexagon SDK')
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log(chalk.blue('🚀  开始设置开发环境...'));
    yield checkHostCommand('wget');
    yield checkHostCommand('xzcat');
    yield checkHostCommand('unzip');
    yield ensureAndroidNdk();
    yield ensureQnnSdk();
    yield ensureHexagonSdk();
    console.log(chalk.green.bold('🎉  环境设置完成！'));
}));
program
    .command('build')
    .description('编译整个项目 (llama.cpp + ggml-hexagon backend)')
    .option('--debug', 'Enable debug build')
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(chalk.blue('🚀  开始构建项目...'));
    yield ensureAndroidNdk();
    yield ensureQnnSdk();
    yield ensureHexagonSdk();
    const buildDir = path.join(config.PROJECT_ROOT_PATH, 'out', 'android');
    yield fsExtra.remove(buildDir); // 清理旧的构建目录
    const cmakeArgs = [
        '-S', config.PROJECT_ROOT_PATH,
        '-B', buildDir,
        `-DCMAKE_BUILD_TYPE=${options.debug ? 'Debug' : 'Release'}`,
        '-DGGML_OPENMP=OFF',
        `-DCMAKE_TOOLCHAIN_FILE=${ANDROID_NDK_DIR}/build/cmake/android.toolchain.cmake`,
        '-DANDROID_ABI=arm64-v8a',
        `-DANDROID_PLATFORM=${config.ANDROID_PLATFORM}`,
        '-DGGML_HEXAGON=ON',
        '-DLLAMA_CURL=OFF',
        `-DQNN_SDK_PATH=${QNN_SDK_DIR}`,
        `-DHEXAGON_SDK_PATH=${HEXAGON_SDK_DIR}`,
        `-DHTP_ARCH_VERSION=${config.HTP_ARCH_VERSION}`,
    ];
    yield executeCommand('cmake', cmakeArgs);
    yield executeCommand('make', ['-C', buildDir, '-j', `${process.cpuUsage().user}`]);
    console.log(chalk.green.bold('🎉  构建完成！'));
}));
program
    .command('clean')
    .description('删除构建输出目录')
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    const buildDir = path.join(config.PROJECT_ROOT_PATH, 'out', 'android');
    if (yield pathExists(buildDir)) {
        console.log(chalk.blue(`清理构建目录: ${buildDir}`));
        yield fsExtra.remove(buildDir);
        console.log(chalk.green('清理完成。'));
    }
    else {
        console.log(chalk.yellow('构建目录不存在，无需清理。'));
    }
}));
program
    .command('push-libs')
    .description('推送 QNN 运行时库到安卓设备')
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    yield checkAndPushQnnLibs();
}));
program
    .command('update-models')
    .description('下载预构建模型并推送至安卓设备')
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    yield checkAndDownloadPrebuiltModel();
}));
program
    .command('run')
    .description('在连接的安卓设备上运行一个模型')
    .option('-p, --prompt <prompt>', 'Prompt string for llama-cli', config.PROMPT_STRING.trim())
    .option('-n, --tokens <tokens>', 'Number of tokens to generate', '256')
    .option('-t, --threads <threads>', 'Number of threads to use', '8')
    .option('--no-cnv', 'Disable CNV (QNN backend specific)')
    .option('--model-path <path>', 'Full path to the model on the device', config.GGUF_MODEL_NAME)
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(chalk.blue('🔍  扫描可用模型...'));
    const models = yield scanForModels();
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
    const { selectedModel } = yield inquirer.prompt([
        {
            type: 'list',
            name: 'selectedModel',
            message: '您想运行哪个模型？',
            choices: modelChoices,
        },
    ]);
    const { confirmation } = yield inquirer.prompt([
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
    yield checkAndPushQnnLibs();
    // 推送选择的模型
    const remoteModelFullPath = path.join(REMOTE_MODEL_PATH, path.basename(selectedModel)).replace(/\\/g, '/');
    yield executeCommand('adb', ['push', selectedModel, remoteModelFullPath]);
    // 推送 llama-cli 可执行文件
    const llamaCliPath = path.join(config.PROJECT_ROOT_PATH, 'out/android/bin/llama-cli');
    if (!(yield pathExists(llamaCliPath))) {
        console.log(chalk.red(`llama-cli 可执行文件未找到: ${llamaCliPath}`));
        console.log(chalk.yellow('请先运行 ' + chalk.cyan('ggml-hexagon-cli build') + ' 命令。'));
        return;
    }
    yield executeCommand('adb', ['push', llamaCliPath, REMOTE_ANDROID_PATH]);
    yield executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-cli`]);
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
    yield executeCommand('adb', ['shell', remoteCommand]);
}));
program
    .command('run-bench')
    .description('在连接的安卓设备上运行 llama-bench')
    .option('--model-path <path>', 'Full path to the model on the device', config.GGUF_MODEL_NAME)
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(chalk.blue('🚀  准备运行 llama-bench...'));
    // 确保核心库和可执行文件已存在于设备上
    yield checkAndPushQnnLibs();
    yield checkAndDownloadPrebuiltModel(); // 确保默认模型已在设备上
    // 推送 llama-bench 可执行文件
    const llamaBenchPath = path.join(config.PROJECT_ROOT_PATH, 'out/android/bin/llama-bench');
    if (!(yield pathExists(llamaBenchPath))) {
        console.log(chalk.red(`llama-bench 可执行文件未找到: ${llamaBenchPath}`));
        console.log(chalk.yellow('请先运行 ' + chalk.cyan('ggml-hexagon-cli build') + ' 命令。'));
        return;
    }
    yield executeCommand('adb', ['push', llamaBenchPath, REMOTE_ANDROID_PATH]);
    yield executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/llama-bench`]);
    // 构造运行命令
    const remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./llama-bench -m ${options.modelPath} ${config.RUNNING_PARAMS}`;
    yield executeCommand('adb', ['shell', remoteCommand]);
}));
program
    .command('run-test-ops')
    .description('在连接的安卓设备上运行 test-backend-ops')
    .option('-o, --op <opname>', 'Specific operation to test, e.g., ADD/MUL_MAT')
    .action((options) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(chalk.blue('🚀  准备运行 test-backend-ops...'));
    // 确保核心库已存在于设备上
    yield checkAndPushQnnLibs();
    // 推送 test-backend-ops 可执行文件
    const testOpsPath = path.join(config.PROJECT_ROOT_PATH, 'out/android/bin/test-backend-ops');
    if (!(yield pathExists(testOpsPath))) {
        console.log(chalk.red(`test-backend-ops 可执行文件未找到: ${testOpsPath}`));
        console.log(chalk.yellow('请先运行 ' + chalk.cyan('ggml-hexagon-cli build') + ' 命令。'));
        return;
    }
    yield executeCommand('adb', ['push', testOpsPath, REMOTE_ANDROID_PATH]);
    yield executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/test-backend-ops`]);
    let remoteCommand = `cd ${REMOTE_ANDROID_PATH} && export LD_LIBRARY_PATH=. && ./test-backend-ops test`;
    if (options.op) {
        remoteCommand += ` -o ${options.op}`;
    }
    yield executeCommand('adb', ['shell', remoteCommand]);
}));
program.parse(process.argv);
