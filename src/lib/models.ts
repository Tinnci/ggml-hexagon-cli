import path from 'path';
import fsExtra from 'fs-extra';
const { readdir, pathExists, mkdir, ensureDir } = fsExtra;
import chalk from 'chalk';
import inquirer from 'inquirer';

import { config } from '../../config.js';
import { checkAndDownloadFile } from './download.js';
import { executeCommand } from './system.js';

const MODELS_DIR = path.join(config.PROJECT_ROOT_PATH, 'models');

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
export async function scanForModels(): Promise<string[]> {
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
 * 检查并下载预构建模型
 */
export async function checkAndDownloadPrebuiltModel() {
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