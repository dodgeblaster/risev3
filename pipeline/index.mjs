import {
    addCommand,
    startLoadingMessage,
    endLoadingMessage,
    clear,
    hideCursor,
    showCursor,
    runProgram
} from './base_cli.mjs'
import { deployInfra } from './deploy_infra.mjs'
import * as filesystem from './base_fs.mjs'
import cfn from './template.mjs'

addCommand({
    command: 'deploy',
    action: async () => {
        console.time('✅ Deployed Successfully \x1b[2mDeploy Time')
        hideCursor()

        let config = await filesystem.getJsFile({
            path: '/pipeline.mjs',
            projectRoot: process.cwd()
        })

        config = config.default

        const template = cfn(config)

        startLoadingMessage('Deploying Pipeline')
        const result = await deployInfra({
            name: config.name,
            stage: '',
            region: 'us-east-1',
            template: JSON.stringify(template, null, 2),
            outputs: []
        })

        if (result.status === 'error') {
            showCursor()
            throw new Error(result.message)
        }

        endLoadingMessage()

        clear()
        console.timeEnd('✅ Deployed Successfully \x1b[2mDeploy Time')
        showCursor()
    }
})


runProgram()
