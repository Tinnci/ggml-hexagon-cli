var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import chalk from 'chalk';
import fsExtra from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import os from 'os';
import { config } from '../../config.js';
import { ensureAndroidNdk, ensureQnnSdk, ensureHexagonSdk, ANDROID_NDK_DIR, QNN_SDK_DIR, HEXAGON_SDK_DIR } from '../lib/sdk.js';
import { executeCommand } from '../lib/system.js';
import { GLOBAL_YES, GLOBAL_VERBOSE } from '../state.js';
export function buildAction(options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log(chalk.blue('🚀  开始构建项目...'));
        yield ensureAndroidNdk();
        if (options.backend === 'hexagon') {
            console.log(chalk.blue('Building with Hexagon backend...'));
            yield ensureQnnSdk();
            yield ensureHexagonSdk();
        }
        else if (options.backend === 'cpu') {
            console.log(chalk.blue('Building with CPU backend only...'));
        }
        else {
            console.error(chalk.red(`错误：未知的后端 '${options.backend}'。有效选项为 'cpu', 'hexagon'。`));
            return;
        }
        const buildDir = path.join(config.PROJECT_ROOT_PATH, 'out', 'android', options.backend);
        // === 处理构建目录 ===
        if (!options.noClean && (yield fsExtra.pathExists(buildDir))) {
            if (GLOBAL_YES) {
                yield fsExtra.remove(buildDir);
            }
            else {
                const { confirmClean } = yield inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirmClean',
                        message: `检测到已有构建目录 ${buildDir}，是否删除并重新构建？`,
                        default: true,
                    },
                ]);
                if (confirmClean) {
                    yield fsExtra.remove(buildDir);
                }
                else {
                    console.log(chalk.yellow('保留旧构建目录，将进行增量构建。'));
                }
            }
        }
        // 解析构建类型
        const buildType = (_a = options.buildType) !== null && _a !== void 0 ? _a : (options.debug ? 'Debug' : 'Release');
        const openmpFlag = options.openmp ? 'ON' : 'OFF';
        const curlFlag = options.curl ? 'ON' : 'OFF';
        const cmakeArgs = [
            '-S', config.PROJECT_ROOT_PATH,
            '-B', buildDir,
            `-DCMAKE_BUILD_TYPE=${buildType}`,
            `-DGGML_OPENMP=${openmpFlag}`,
            `-DCMAKE_TOOLCHAIN_FILE=${ANDROID_NDK_DIR}/build/cmake/android.toolchain.cmake`,
            `-DANDROID_ABI=${options.abi}`,
            `-DANDROID_PLATFORM=${config.ANDROID_PLATFORM}`,
            `-DLLAMA_CURL=${curlFlag}`,
        ];
        if (options.backend === 'hexagon') {
            cmakeArgs.push('-DGGML_HEXAGON=ON', `-DQNN_SDK_PATH=${QNN_SDK_DIR}`, `-DHEXAGON_SDK_PATH=${HEXAGON_SDK_DIR}`, `-DHTP_ARCH_VERSION=${config.HTP_ARCH_VERSION}`);
        }
        // 添加新的编译选项
        if (options.allWarnings)
            cmakeArgs.push('-DLLAMA_ALL_WARNINGS=ON');
        if (options.fatalWarnings)
            cmakeArgs.push('-DLLAMA_FATAL_WARNINGS=ON');
        if (options.sanitizeThread)
            cmakeArgs.push('-DLLAMA_SANITIZE_THREAD=ON');
        if (options.sanitizeAddress)
            cmakeArgs.push('-DLLAMA_SANITIZE_ADDRESS=ON');
        if (options.sanitizeUndefined)
            cmakeArgs.push('-DLLAMA_SANITIZE_UNDEFINED=ON');
        if (options.buildTests)
            cmakeArgs.push('-DLLAMA_BUILD_TESTS=ON');
        if (options.buildTools)
            cmakeArgs.push('-DLLAMA_BUILD_TOOLS=ON');
        if (options.buildExamples)
            cmakeArgs.push('-DLLAMA_BUILD_EXAMPLES=ON');
        if (options.buildServer)
            cmakeArgs.push('-DLLAMA_BUILD_SERVER=ON');
        // 追加用户自定义的 CMake 参数
        if (options.cmakeArgs && Array.isArray(options.cmakeArgs)) {
            cmakeArgs.push(...options.cmakeArgs);
        }
        // === 列出将要使用的 CMake 参数 ===
        console.log(chalk.blue('\n📋  即将使用以下 CMake 参数：'));
        const descriptions = {
            '-S': '项目源码根目录',
            '-B': '构建输出目录',
            'CMAKE_BUILD_TYPE': '构建类型',
            'GGML_OPENMP': '启用 OpenMP 并行计算',
            'CMAKE_TOOLCHAIN_FILE': 'Android 工具链文件',
            'ANDROID_ABI': '目标 ABI',
            'ANDROID_PLATFORM': '目标 Android 平台',
            'GGML_HEXAGON': '启用 Hexagon 后端',
            'LLAMA_CURL': '启用 cURL (用于从URL加载模型)',
            'QNN_SDK_PATH': 'Qualcomm QNN SDK 路径',
            'HEXAGON_SDK_PATH': 'Hexagon SDK 路径',
            'HTP_ARCH_VERSION': 'HTP 架构版本',
            'LLAMA_ALL_WARNINGS': '启用所有编译器警告',
            'LLAMA_FATAL_WARNINGS': '将警告视为错误 (-Werror)',
            'LLAMA_SANITIZE_THREAD': '启用线程消毒器',
            'LLAMA_SANITIZE_ADDRESS': '启用地址消毒器',
            'LLAMA_SANITIZE_UNDEFINED': '启用未定义行为消毒器',
            'LLAMA_BUILD_TESTS': '构建测试程序',
            'LLAMA_BUILD_TOOLS': '构建工具程序',
            'LLAMA_BUILD_EXAMPLES': '构建示例程序',
            'LLAMA_BUILD_SERVER': '构建服务器程序',
        };
        // 解析并格式化输出
        const formattedArgs = [];
        for (let i = 0; i < cmakeArgs.length; i++) {
            const arg = cmakeArgs[i];
            if (arg.startsWith('-D')) {
                const [key, value] = arg.substring(2).split('=');
                const desc = descriptions[key] || '自定义参数';
                formattedArgs.push(`  ${chalk.cyan(key)}: ${chalk.yellow(value)} (${desc})`);
            }
            else if (i + 1 < cmakeArgs.length && !cmakeArgs[i + 1].startsWith('-')) {
                const key = arg;
                const value = cmakeArgs[i + 1];
                const desc = descriptions[key] || '路径设置';
                formattedArgs.push(`  ${chalk.cyan(key)} ${chalk.yellow(value)} (${desc})`);
                i++; // 跳过下一个元素
            }
            else {
                formattedArgs.push(`  ${arg}`);
            }
        }
        console.log(formattedArgs.join('\n'));
        // 构建确认
        if (!GLOBAL_YES) {
            const { proceed } = yield inquirer.prompt([
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
        yield executeCommand('cmake', cmakeArgs);
        const coreCount = os.cpus().length;
        console.log(chalk.blue(`\nDetected ${coreCount} CPU cores. Using -j ${coreCount} for make.`));
        const makeArgs = ['-C', buildDir, '-j', `${coreCount}`];
        if (GLOBAL_VERBOSE) {
            makeArgs.push('VERBOSE=1');
        }
        yield executeCommand('make', makeArgs);
        console.log(chalk.green.bold('🎉  构建完成！'));
    });
}
