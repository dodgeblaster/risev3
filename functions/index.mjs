import {
    addCommand,
    runProgram,
} from './base_cli.mjs'
import {deploy} from './deploy.mjs'
import * as filesystem from './base_fs.mjs'
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

/**
 * Config
 */
async function getLocalBucketName() {
    try {
        const { config } = await filesystem.getJsFile({
            path: '/.rise/data.mjs',
            projectRoot: process.cwd()
        })

        return config.bucketName
    } catch (e) {
        return undefined
    }
}

export async function getConfigurations(rootFilePath) {
  try {
    const rootDir = process.cwd();
    const fullRootPath = path.resolve(rootDir, rootFilePath);

    // Import the root file
    const rootModule = await import(fullRootPath);
    const rootConfig = rootModule.default;

    // Get configurations for all functions
    const functionConfigs = {};
    for (const [functionName, functionPath] of Object.entries(rootConfig.functions)) {
      const fullFunctionPath = path.resolve(rootDir, functionPath);
      const functionModule = await import(fullFunctionPath);
      
      functionConfigs[functionName] = {
        path: functionPath,
        config: functionModule.config || {},
        trigger: rootConfig.triggers[functionName]
      };
    }

    const bucket = await getLocalBucketName()

    return {
      bucket,
      root: rootConfig,
      functions: functionConfigs
    };
  } catch (error) {
    console.error('Error getting configurations:', error);
    throw error;
  }
}


/**
 * Zip Files
 */
const execAsync = promisify(exec);

export async function zipLambdaFunctions(rootFilePath) {
  try {
    // Ensure ./.rise/lambda/ directory exists
    const lambdaDir = path.join(process.cwd(), '.rise', 'lambda');
    await fs.mkdir(lambdaDir, { recursive: true });

    // Import the root file
    const rootModule = await import(path.resolve(process.cwd(), rootFilePath));
    const functions = rootModule.default.functions;

    // Process each function
    for (const [functionName, functionPath] of Object.entries(functions)) {
      const fullFunctionPath = path.resolve(process.cwd(), functionPath);
      const zipFilePath = path.join(lambdaDir, `${functionName}.zip`);

      // Create a temporary directory for the function
      const tempDir = path.join(process.cwd(), '.rise', 'temp', functionName);
      await fs.mkdir(tempDir, { recursive: true });

      // Copy the function file to the temporary directory
      const tempFilePath = path.join(tempDir, path.basename(functionPath));
      await fs.copyFile(fullFunctionPath, tempFilePath);

      // Create zip file using zip command
      const command = `cd "${tempDir}" && zip -j "${zipFilePath}" "${path.basename(functionPath)}"`;
      await execAsync(command);

      // Clean up temporary directory
      await fs.rm(tempDir, { recursive: true, force: true });

      console.log(`Created zip file for ${functionName} at ${zipFilePath}`);
    }

    console.log('All lambda functions have been zipped successfully.');
  } catch (error) {
    console.error('Error zipping lambda functions:', error);
  }
}

/**
 * Program
 */
addCommand({
    command: 'deploy',
    action: async () => {
        const config = await getConfigurations('rise.mjs')
      
        const rootFilePath = 'rise.mjs';
        zipLambdaFunctions(rootFilePath);
        await deploy(config)
    }
})

runProgram()
