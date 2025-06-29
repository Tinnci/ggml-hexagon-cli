import chalk from 'chalk';
import path from 'path';

import { config } from '../../config.js';
import { QNN_SDK_DIR } from './sdk.js';
import { executeCommand } from './system.js';

const REMOTE_ANDROID_PATH = '/data/local/tmp/';

/**
 * 检查并推送 QNN 运行时库到安卓设备
 */
export async function checkAndPushQnnLibs() {
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