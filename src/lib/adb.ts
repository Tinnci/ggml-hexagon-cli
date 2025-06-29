import { executeCommand, IExecuteCommandOptions, ICommandResult } from './system.js';
import { config, paths } from '../../config.js';
import chalk from 'chalk';
import path from 'path';
import fsExtra from 'fs-extra';
const { pathExists } = fsExtra;
import { QNN_SDK_DIR } from './sdk.js';
import { GLOBAL_VERBOSE } from '../state.js';

const REMOTE_ANDROID_PATH = '/data/local/tmp';

export async function ensureAdbDevice(): Promise<string> {
    console.log(chalk.blue('🔍  检查 ADB 设备连接...'));
    const options: IExecuteCommandOptions = { silent: true, ignoreExitCode: true };
    const result: ICommandResult = await executeCommand('adb', ['devices'], options);
    
    if (result.failed) {
        if (result.stderr.includes('command not found')) {
            console.error(chalk.red('❌  ADB 设备检查失败: `adb` 命令未找到。请确保 Android SDK Platform-Tools 已安装并添加到了您的系统 PATH 中。'));
        } else {
            console.error(chalk.red('❌  ADB 设备检查失败:'), chalk.red(result.stderr || result.message));
        }
        process.exit(1);
    }

    const lines = result.stdout.trim().split('\n');
    const devices = lines.slice(1).map((line: string) => {
        const [id, status] = line.split(/\s+/);
        return { id, status };
    }).filter((d: {id: string}) => d.id);

    if (devices.length === 0) {
        console.error(chalk.red('❌  未检测到安卓设备。请连接您的设备，并确保已开启 "USB调试" 模式。'));
        process.exit(1);
    }

    if (devices.length > 1) {
        console.warn(chalk.yellow(`检测到多个设备，将使用第一个设备: ${devices[0].id}`));
    }

    const device = devices[0];

    if (device.status === 'unauthorized') {
        console.error(chalk.red(`❌  设备 ${device.id} 未经授权。请在您的手机上查看，并允许来自这台电脑的USB调试连接。`));
        process.exit(1);
    }

    if (device.status !== 'device') {
        console.error(chalk.red(`❌  设备 ${device.id} 状态异常: ${device.status}。`));
        process.exit(1);
    }

    console.log(chalk.green(`✔  检测到已授权设备: ${device.id}`));
    return device.id;
}


/**
 * 检查并推送 QNN 运行时库到安卓设备
 */
export async function checkAndPushQnnLibs() {
    await ensureAdbDevice();
    console.log(chalk.blue('检查并推送 QNN 运行时库...'));

    const qnnLibs = [
        'libQnnSystem.so',
        'libQnnCpu.so',
        'libQnnHtp.so',
        'libQnnHtpPrepare.so',
        'libQnnHtpV75Stub.so',
        'libQnnHtpV79Skel.so',
        'libqnn-htp-v75-perf.so'
    ];
    
    const options: IExecuteCommandOptions = { silent: true };

    for (const lib of qnnLibs) {
        const localPath = path.join(paths.QNN_SDK_LIBS_PATH, lib);
        const remotePath = `${REMOTE_ANDROID_PATH}/${lib}`;

        if (!(await pathExists(localPath))) {
            if (GLOBAL_VERBOSE) {
                console.log(chalk.gray(`本地库 ${lib} 不存在，跳过。`));
            }
            continue;
        }

        const checkResult: ICommandResult = await executeCommand('adb', ['shell', `ls ${remotePath}`], {...options, ignoreExitCode: true});
        if (checkResult.failed) {
            console.log(chalk.yellow(`推送库 ${lib} 到设备...`));
            await executeCommand('adb', ['push', localPath, remotePath]);
        } else if (GLOBAL_VERBOSE) {
            console.log(chalk.green(`库 ${lib} 已存在于设备上，跳过推送。`));
        }
    }

    const hexagonLibPath = path.join(QNN_SDK_DIR, `lib/hexagon-${config.HTP_ARCH_VERSION}/unsigned/`);
    const skelLib = `libQnnHtp${config.HTP_ARCH_VERSION_A}Skel.so`;
    const localSkelPath = path.join(hexagonLibPath, skelLib);
    const remoteSkelPath = `${REMOTE_ANDROID_PATH}/${skelLib}`;

    if (await pathExists(localSkelPath)) {
        const checkSkel: ICommandResult = await executeCommand('adb', ['shell', `ls ${remoteSkelPath}`], {...options, ignoreExitCode: true});
        if (checkSkel.failed) {
            console.log(chalk.yellow(`推送库 ${skelLib} 到设备...`));
            await executeCommand('adb', ['push', localSkelPath, remoteSkelPath]);
        }
    }

    const cfgFile = './scripts/ggml-hexagon.cfg';
    const remoteCfgPath = `${REMOTE_ANDROID_PATH}/ggml-hexagon.cfg`;
    const checkCfg: ICommandResult = await executeCommand('adb', ['shell', `ls ${remoteCfgPath}`], {...options, ignoreExitCode: true});
    if (checkCfg.failed) {
        console.log(chalk.yellow(`推送配置文件 ${cfgFile} 到设备...`));
        await executeCommand('adb', ['push', cfgFile, remoteCfgPath]);
    }

    await executeCommand('adb', ['shell', `chmod +x ${REMOTE_ANDROID_PATH}/*`], { silent: !GLOBAL_VERBOSE });

    console.log(chalk.green('QNN 运行时库检查和推送完成。'));
}