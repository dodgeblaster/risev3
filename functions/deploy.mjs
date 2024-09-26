import * as cli from './base_cli.mjs'
import * as s3 from './base_s3.mjs'
import { deployInfra } from './deploy_infra.mjs'
import * as filesystem from './base_fs.mjs'
import process from 'node:process'
import path from 'path';

/**
 * @param {string} appName
 * @param {string} stage
 * @param {string} region
 */
export async function deployBucket({name, stage, region}) {
    let bucketTemplate = s3.makeBucket('Main')
    const stackName = `${name}${stage}-bucket`
    const result = await deployInfra({
        name: stackName,
        stage,
        region,
        template: JSON.stringify(bucketTemplate),
        outputs: ['MainBucket', 'AmplifyId']
    })

    if (result.status === 'error') {
        throw new Error(result.message)
    }

    filesystem.writeFile({
        path: '/.rise/data.mjs',
        content: `export const config = { 
            bucketName: "${result.outputs.MainBucket}"
        }`,
        projectRoot: process.cwd()
    })

    return result.outputs.MainBucket
    
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
    const uploadFile = s3.uploadFile
    const getAllPaths = () => {
        return Object.keys(config.config.functions).map((name) => `${config.zipTarget}/${name}.zip`)
    }

    let result = []
    const paths = getAllPaths()
    for (const path of paths) {
        const file = await filesystem.getFile({
            path,
            projectRoot: process.cwd()
        })
        const res = await uploadFile({
            file,
            bucket: config.bucketName,
            key: path.split(config.hiddenFolder + '/')[1]
        })
        result.push(res)
    }

    return result
}


export async function generateCloudFormationTemplate(rootFile, s3bucket) {
    const root = await import(path.join(process.cwd(), rootFile)); // await import(rootFile);
    const template = {
      AWSTemplateFormatVersion: '2010-09-09',
      Transform: 'AWS::Serverless-2016-10-31',
      Description: root.default.name,
      Resources: {}
    };
  
    let httpSet = false
    // Generate HTTP API
    const setApi = () => {
      template.Resources.HttpApi = {
          Type: 'AWS::Serverless::HttpApi',
          Properties: {
              StageName: '$default',
          }    
      }
      if (root.default.api?.authorizer) {
          template.Resources.HttpApi.Properties.Auth = {
              Authorizers: {
                  MyAuthorizer: {
                      JwtConfiguration: {
                      issuer: root.default.api.authorizer
                      },
                      IdentitySource: '$request.header.Authorization'
                  }
              },
              DefaultAuthorizer: 'MyAuthorizer'
          }
        }
    }
    

    // Generate Lambda Functions
    for (const [functionName, functionPath] of Object.entries(root.default.functions)) {
     // const functionModule = await import(path.resolve(path.dirname(rootFile), functionPath));
      const functionModule = await import(path.join(process.cwd(), functionPath));
      const functionConfig = functionModule.config || {};
  
      template.Resources[functionName] = {
        Type: 'AWS::Serverless::Function',
        Properties: {
          //CodeUri: functionPath,
          CodeUri: {
              Bucket: s3bucket,
              Key: `lambda/${functionPath.split('./')[1].split('.mjs')[0]}.zip`//'path/to/my/code.zip'
          },
          Handler: functionName + '.handler',
          Runtime: 'nodejs20.x',
          Timeout: functionConfig.timeout || 3,
          Environment: {
            Variables: functionConfig.env || {}
          },
          Policies: [
            { Statement: functionConfig.permissions || [],
            }],
          Events: {}
        }
      };
  
      // Add trigger
      const trigger = root.default.triggers[functionName];
      if (trigger) {
        const [triggerType, ...triggerArgs] = trigger.split(' ');
        switch (triggerType) {
          case 'API':
            if (!httpSet) {
              setApi()
            }
            const [method, path] = triggerArgs;
            template.Resources[functionName].Properties.Events[`${functionName}ApiEvent`] = {
              Type: 'HttpApi',
              Properties: {
                Path: path,
                Method: method.toUpperCase(),
                ApiId: { Ref: 'HttpApi' }
              }
            };
            httpSet = true
            break;
          case 'EVENT':
            const [sourceName, eventName, busName] = triggerArgs;
            template.Resources[functionName].Properties.Events[`${functionName}EventBridgeEvent`] = {
              Type: 'EventBridgeRule',
              Properties: {
                Pattern: {
                  source: [sourceName],
                  'detail-type': [eventName]
                },
                EventBusName: busName || 'default'
              }
            };
            break;
          case 'SCHEDULE':
            const [rate] = triggerArgs;
            template.Resources[functionName].Properties.Events[`${functionName}ScheduleEvent`] = {
              Type: 'Schedule',
              Properties: {
                Schedule: `rate(${rate} minutes)`
              }
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

    cli.clear()
    console.time('✅ Deployed Successfully \x1b[2mDeploy Time')
    cli.hideCursor()



 

    // cli.showCursor()
    // console.log('>>', config)
    const deployName = config.root.name

    const bucket = config.bucket

    if (!bucket) {
        cli.clear()
        cli.startLoadingMessage('Deploying Bucket')

        const bucketName = await deployBucket({
            name: deployName,
            stage: '',
            region: 'us-east-1'
        })

        config.bucket = bucketName
        cli.endLoadingMessage()
    }

     /**
     * Upload code to S3
     */
    cli.clear()
    cli.startLoadingMessage('Uploading code to AWS S3')
    await uploadCode({
        bucketName: config.bucket,
        functionsLocation: '/.rise/src/lambda',
        zipTarget: '/.rise/lambda',
        hiddenFolder: '.rise',
        config
    })
    cli.endLoadingMessage()
    cli.clear()

    /**
     * Deploy CFN
     */
    const temp = await generateCloudFormationTemplate('./rise.mjs', bucket)
    const stackName = `${config.root.name}-app`
    const result = await deployInfra({
        name: stackName,
        stage: '',
        region: 'us-east-1',
        template: temp,
        outputs: []//['MainBucket', 'AmplifyId']
    })

    console.log('>>> ', result)

    console.timeEnd('✅ Deployed Successfully \x1b[2mDeploy Time')
    cli.showCursor()

}