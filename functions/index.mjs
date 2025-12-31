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
 * Scaffold
 */
async function scaffold() {
    const riseConfig = `export default {
    name: 'my-app',
    functions: {
        hello: './functions/hello.mjs',
        scheduled: './functions/scheduled.mjs',
        eventHandler: './functions/event-handler.mjs'
    },
    triggers: {
        hello: 'API GET /hello',
        scheduled: 'SCHEDULE 5',
        /*
        This means:
        • **Trigger type**: EVENT (EventBridge)
        • **Source**: my.service (the service that emits the event)
        • **Event name**: order.created (the specific event type)
        • **Event bus**: default (the EventBridge bus to listen on)
        */
        eventHandler: 'EVENT my.service order.created default'
    },
    api: {
        authorizer: '{@output.auth-stack.CognitoUserPoolIssuer}'
    }
}`

    const helloFunction = `export const config = {
    timeout: 10,
    env: {
        NODE_ENV: 'production',
        TABLE_NAME: '{@output.my-stack.TableName}',
        BUCKET_NAME: '{@output.my-stack.BucketName}'
    },
    permissions: [
        {
            Effect: 'Allow',
            Action: ['dynamodb:Query', 'dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
            Resource: '{@output.my-stack.TableArn}'
        },
        {
            Effect: 'Allow',
            Action: ['s3:GetObject', 's3:PutObject'],
            Resource: '{@output.my-stack.BucketArn}/*'
        }
    ]
}

export async function handler(event) {
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Hello World!' })
    }
}`

    const scheduledFunction = `export const config = {
    timeout: 30,
    env: {
        NODE_ENV: 'production'
    }
}

export async function handler(event) {
    console.log('Scheduled function executed:', new Date().toISOString())
    return { success: true }
}`

    const eventFunction = `export const config = {
    timeout: 15,
    env: {
        NODE_ENV: 'production'
    }
}

export async function handler(event) {
    console.log('Event received:', event)
    return { processed: true }
}`

    await filesystem.makeDir({ path: '/functions', projectRoot: process.cwd() })
    
    filesystem.writeFile({
        path: '/rise.mjs',
        content: riseConfig,
        projectRoot: process.cwd()
    })
    
    filesystem.writeFile({
        path: '/functions/hello.mjs',
        content: helloFunction,
        projectRoot: process.cwd()
    })
    
    filesystem.writeFile({
        path: '/functions/scheduled.mjs',
        content: scheduledFunction,
        projectRoot: process.cwd()
    })
    
    filesystem.writeFile({
        path: '/functions/event-handler.mjs',
        content: eventFunction,
        projectRoot: process.cwd()
    })
    
    console.log('✅ Project scaffolded successfully!')
    console.log('Run "rise deploy" to deploy your app')
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

addCommand({
    command: 'init',
    action: scaffold
})

runProgram()
