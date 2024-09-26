import * as filesystem from './base_fs.mjs'
import * as s3 from './base_s3.mjs'
import { deployInfra } from './deploy_infra.mjs'
import process from 'node:process'

/**
 * @param {string} appName
 * @param {string} stage
 * @param {string} region
 */
export async function deployApplication(appName, stage, region, auth) {
    let bucketTemplate = s3.makeBucket('Main')
    const stackName = `${appName}${stage}-bucket`

    const template = {
        Resources: {
            AmplifyApp: {
                Type: 'AWS::Amplify::App',
                Properties: {
                    Name: appName
                }
            },
            AmplifyMainBranch: {
                Type: 'AWS::Amplify::Branch',
                Properties: {
                    AppId: { 'Fn::GetAtt': ['AmplifyApp', 'AppId'] },
                    BranchName: 'main'
                }
            },
            ...bucketTemplate.Resources
        },
        Outputs: {
            ...bucketTemplate.Outputs,
            AmplifyId: {
                Value: { 'Fn::GetAtt': ['AmplifyApp', 'AppId'] }
            }
        }
    }

    if (auth) {
        template.Resources.AmplifyApp.Properties.BasicAuthConfig = {
            EnableBasicAuth: true,
            Password: auth.password,
            Username: auth.username
        }
    }

    const result = await deployInfra({
        name: stackName,
        stage,
        region,
        template: JSON.stringify(template),
        outputs: ['MainBucket', 'AmplifyId']
    })

    if (result.status === 'error') {
        throw new Error(result.message)
    }

    filesystem.writeFile({
        path: '/.rise/data.js',
        content: `export const config = { 
            bucketName: "${result.outputs.MainBucket}", 
            appId: "${result.outputs.AmplifyId}"
        }`,
        projectRoot: process.cwd()
    })

    return {
        bucket: result.outputs.MainBucket,
        appId: result.outputs.AmplifyId
    }
}