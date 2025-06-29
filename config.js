import path from 'path';
import fsExtra from 'fs-extra';
// 向上搜索，找到包含 CMakeLists.txt 的项目根目录
function findProjectRoot(startDir) {
    let dir = startDir;
    while (dir !== path.parse(dir).root) {
        if (fsExtra.existsSync(path.join(dir, 'CMakeLists.txt'))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    // 如果未找到，则返回启动目录
    return startDir;
}
// 项目根目录
const PROJECT_ROOT_PATH = findProjectRoot(process.cwd());
const PREBUILTS_DIR = path.join(PROJECT_ROOT_PATH, 'prebuilts');
// 读取环境变量，若不存在则使用默认值
function env(key, def) {
    var _a;
    return (_a = process.env[key]) !== null && _a !== void 0 ? _a : def;
}
export const config = {
    ANDROID_PLATFORM: env('ANDROID_PLATFORM', 'android-34'),
    ANDROID_NDK_VERSION: env('ANDROID_NDK_VERSION', 'r28'),
    QNN_SDK_VERSION: env('QNN_SDK_VERSION', '2.35.0.250530'),
    HTP_ARCH_VERSION: env('HTP_ARCH_VERSION', 'v79'),
    HTP_ARCH_VERSION_A: env('HTP_ARCH_VERSION_A', 'V79'),
    // 运行相关
    RUNNING_PARAMS: env('RUNNING_PARAMS', '-ngl 99 -t 8 -n 256 --no-warmup'),
    PROMPT_STRING: env('PROMPT_STRING', 'introduce the movie Once Upon a Time in America briefly.\\n'),
    // 默认 GGUF 模型名称（可从环境变量覆盖）
    GGUF_MODEL_NAME: env('GGUF_MODEL_NAME', '/sdcard/qwen1_5-1_8b-chat-q4_0.gguf'),
    // 目录常量
    PROJECT_ROOT_PATH,
    PREBUILTS_DIR,
};
// 基于以上配置派生的一些路径常量
export const paths = {
    ANDROID_NDK: path.join(PREBUILTS_DIR, `android-ndk-${config.ANDROID_NDK_VERSION}`),
    ANDROID_NDK_ZIP: path.join(PREBUILTS_DIR, `android-ndk-${config.ANDROID_NDK_VERSION}-linux.zip`),
    QNN_SDK_ZIP: path.join(PREBUILTS_DIR, `v${config.QNN_SDK_VERSION}.zip`),
    QNN_SDK_PATH: path.join(PREBUILTS_DIR, 'QNN_SDK', `qairt/${config.QNN_SDK_VERSION}/`),
    QNN_SDK_LIBS_PATH: path.join(PREBUILTS_DIR, 'QNN_SDK', 'lib', 'aarch64-android'),
    HEXAGON_SDK_DIR: path.join(PREBUILTS_DIR, 'Hexagon_SDK'),
    HEXAGON_SDK_PATH: path.join(PREBUILTS_DIR, 'Hexagon_SDK', '6.2.0.1'),
    HEXAGON_MINIMAL_XZ: path.join(PREBUILTS_DIR, 'Hexagon_SDK', 'minimal-hexagon-sdk-6.2.0.1.xz'),
};
// 确保预构建目录存在
fsExtra.ensureDirSync(PREBUILTS_DIR);
