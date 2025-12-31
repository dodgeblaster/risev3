import * as cli from './base_cli.mjs';
import * as s3 from './base_s3.mjs';
import { deployInfra } from './deploy_infra.mjs';
import * as filesystem from './base_fs.mjs';
import process from 'node:process';
import path from 'path';

/**
 * @param {string} appName
 * @param {string} stage
 * @param {string} region
 */
export async function deployBucket({ name, stage, region }) {
    let bucketTemplate = s3.makeBucket('Main');
    const stackName = `${name}${stage}-bucket`;
    const result = await deployInfra({
        name: stackName,
        stage,
        region,
        template: JSON.stringify(bucketTemplate),
        outputs: ['MainBucket', 'AmplifyId'],
    });

    if (result.status === 'error') {
        throw new Error(result.message);
    }

    filesystem.writeFile({
        path: '/.rise/data.mjs',
        content: `export const config = { 
            bucketName: "${result.outputs.MainBucket}"
        }`,
        projectRoot: process.cwd(),
    });

    return result.outputs.MainBucket;
}

/**
 * Upload code to bucket
 *
 * @param {object} config
 * @param {string} config.bucketName
 * @param {string} config.functionsLocation
 * @param {string} config.zipTarget
 * @param {string} config.hiddenFolder
 */
async function uploadCode(config) {
    const uploadFile = s3.uploadFile;
    const getAllPaths = () => {
        return Object.keys(config.config.functions).map(
            (name) => `${config.zipTarget}/${name}.zip`
        );
    };

    let result = [];
    const paths = getAllPaths();
    for (const path of paths) {
        const file = await filesystem.getFile({
            path,
            projectRoot: process.cwd(),
        });
        const res = await uploadFile({
            file,
            bucket: config.bucketName,
            key: path.split(config.hiddenFolder + '/')[1],
        });
        result.push(res);
    }

    return result;
}

import * as cfn from './base_cfn.mjs';

/**
 * Resolve CloudFormation output references
 */
async function resolveOutputReferences(obj) {
    // Collect all output references first
    const outputRefs = new Map();
    
    function collectRefs(item) {
        if (typeof item === 'string') {
            const outputPattern = /{@output\.([^.]+)\.([^}]+)}/g;
            let match;
            while ((match = outputPattern.exec(item)) !== null) {
                const [, stackName, outputName] = match;
                if (!outputRefs.has(stackName)) {
                    outputRefs.set(stackName, new Set());
                }
                outputRefs.get(stackName).add(outputName);
            }
        } else if (Array.isArray(item)) {
            item.forEach(collectRefs);
        } else if (item && typeof item === 'object') {
            Object.values(item).forEach(collectRefs);
        }
    }
    
    collectRefs(obj);
    
    // Fetch all outputs in batch
    const resolvedOutputs = new Map();
    for (const [stackName, outputNames] of outputRefs) {
        try {
            const outputs = await cfn.getOutputs({
                stack: stackName,
                outputs: Array.from(outputNames),
                region: 'us-east-1'
            });
            resolvedOutputs.set(stackName, outputs);
        } catch (e) {
            console.warn(`Could not resolve outputs for stack ${stackName}: ${e.message}`);
        }
    }
    
    // Replace references
    function replaceRefs(item) {
        if (typeof item === 'string') {
            return item.replace(/{@output\.([^.]+)\.([^}]+)}/g, (match, stackName, outputName) => {
                const stackOutputs = resolvedOutputs.get(stackName);
                return stackOutputs?.[outputName] || match;
            });
        } else if (Array.isArray(item)) {
            return item.map(replaceRefs);
        } else if (item && typeof item === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(item)) {
                result[key] = replaceRefs(value);
            }
            return result;
        }
        return item;
    }
    
    return replaceRefs(obj);
}

export async function generateCloudFormationTemplate(rootFile, s3bucket) {
    const root = await import(path.join(process.cwd(), rootFile)); // await import(rootFile);
    
    // Resolve CloudFormation output references in root config
    const resolvedRoot = await resolveOutputReferences(root.default);
    
    const template = {
        AWSTemplateFormatVersion: '2010-09-09',
        Transform: 'AWS::Serverless-2016-10-31',
        Description: resolvedRoot.name,
        Resources: {},
    };

    let httpSet = false;
    // Generate HTTP API
    const setApi = () => {
        template.Resources.HttpApi = {
            Type: 'AWS::Serverless::HttpApi',
            Properties: {
                StageName: '$default',
            },
        };
        if (resolvedRoot.api?.authorizer) {
            template.Resources.HttpApi.Properties.Auth = {
                Authorizers: {
                    MyAuthorizer: {
                        JwtConfiguration: {
                            issuer: resolvedRoot.api.authorizer,
                        },
                        IdentitySource: '$request.header.Authorization',
                    },
                },
                DefaultAuthorizer: 'MyAuthorizer',
            };
        }
    };

    // Generate Lambda Functions
    for (const [functionName, functionPath] of Object.entries(
        resolvedRoot.functions
    )) {
        // const functionModule = await import(path.resolve(path.dirname(rootFile), functionPath));
        const functionModule = await import(
            path.join(process.cwd(), functionPath)
        );
        let functionConfig = functionModule.config || {};
        
        // Resolve CloudFormation output references
        functionConfig = await resolveOutputReferences(functionConfig);

        const functionResource = {
            Type: 'AWS::Serverless::Function',
            Properties: {
                //CodeUri: functionPath,
                CodeUri: {
                    Bucket: s3bucket,
                    Key: `lambda/${functionName}.zip`,
                },
                Handler: functionName + '.handler',
                Runtime: 'nodejs22.x',
                Timeout: functionConfig.timeout || 3,
                Environment: {
                    Variables: functionConfig.env || {},
                },
                Events: {},
            },
        };

        // Only add Policies if there are permissions
        if (functionConfig.permissions && functionConfig.permissions.length > 0) {
            functionResource.Properties.Policies = [{ Statement: functionConfig.permissions }];
        }

        template.Resources[functionName] = functionResource;

        // Add trigger
        const trigger = resolvedRoot.triggers[functionName];
        console.log(`Processing trigger for ${functionName}:`, trigger);
        if (trigger) {
            const [triggerType, ...triggerArgs] = trigger.split(' ');
            console.log(`Trigger type: ${triggerType}, args:`, triggerArgs);
            switch (triggerType) {
                case 'API':
                    if (!httpSet) {
                        setApi();
                        httpSet = true;
                    }
                    const [method, path, ...authOptions] = triggerArgs;
                    const eventConfig = {
                        Type: 'HttpApi',
                        Properties: {
                            Path: path,
                            Method: method.toUpperCase(),
                            ApiId: { Ref: 'HttpApi' },
                        },
                    };
                    
                    // Check if route should be public (no auth)
                    if (authOptions.includes('public')) {
                        eventConfig.Properties.Auth = {
                            Authorizer: 'NONE'
                        };
                    }
                    
                    template.Resources[functionName].Properties.Events[
                        `${functionName}ApiEvent`
                    ] = eventConfig;
                    break;
                case 'EVENT':
                    const [sourceName, eventName, busName] = triggerArgs;
                    template.Resources[functionName].Properties.Events[
                        `${functionName}EventBridgeEvent`
                    ] = {
                        Type: 'EventBridgeRule',
                        Properties: {
                            Pattern: {
                                source: [sourceName],
                                'detail-type': [eventName],
                            },
                            EventBusName: busName || 'default',
                        },
                    };
                    break;
                case 'SCHEDULE':
                    const [rate] = triggerArgs;
                    template.Resources[functionName].Properties.Events[
                        `${functionName}ScheduleEvent`
                    ] = {
                        Type: 'Schedule',
                        Properties: {
                            Schedule: `rate(${rate} minutes)`,
                        },
                    };
                    break;
            }
        }
    }

    return JSON.stringify(template, null, 2);
}

/**
 * Deploy
 */
export async function deploy(config) {
    config.root.name = config.root.name.toLowerCase().replace(/\s+/g, '');

    // cli.clear();
    console.time('✅ Deployed Successfully \x1b[2mDeploy Time');
    cli.hideCursor();

    // cli.showCursor()
    // console.log('>>', config)
    const deployName = config.root.name;

    const bucket = config.bucket;

    if (!bucket) {
        // cli.clear();
        cli.startLoadingMessage('Deploying Bucket');

        const bucketName = await deployBucket({
            name: deployName,
            stage: '',
            region: 'us-east-1',
        });

        config.bucket = bucketName;
        cli.endLoadingMessage();
    }

    /**
     * Upload code to S3
     */
    // cli.clear();
    cli.startLoadingMessage('Uploading code to AWS S3');
    await uploadCode({
        bucketName: config.bucket,
        functionsLocation: '/.rise/src/lambda',
        zipTarget: '/.rise/lambda',
        hiddenFolder: '.rise',
        config,
    });
    cli.endLoadingMessage();
    // cli.clear();

    /**
     * Deploy CFN
     */
    const temp = await generateCloudFormationTemplate('./rise.mjs', bucket);
    console.log('Generated CloudFormation template:', JSON.stringify(JSON.parse(temp), null, 2));
    const stackName = `${config.root.name}-app`;
    const result = await deployInfra({
        name: stackName,
        stage: '',
        region: 'us-east-1',
        template: temp,
        outputs: [],
    });

    console.log('>>> ', result);

    console.timeEnd('✅ Deployed Successfully \x1b[2mDeploy Time');
    cli.showCursor();
}
