import {
    addCommand,
    runProgram,
    startLoadingMessage,
    endLoadingMessage,
    clear,
    hideCursor,
    showCursor
} from './base_cli.mjs'
import { deployInfra } from './deploy_infra.mjs'
import * as filesystem from './base_fs.mjs'
import cfn from './template.mjs'

addCommand({
    command: 'deploy',
    action: async () => {
        console.time('✅ Deployed Successfully \x1b[2mDeploy Time')
        hideCursor()

        const config = await filesystem.getJsFile({
            path: '/pipeline.mjs',
            projectRoot: process.cwd()
        })

        const template = cfn(config)

        startLoadingMessage('Deploying Pipeline')
        const result = await deployInfra({
            name: config.default.name,
            stage: '', // flags.stage,
            region: flags.region,
            template: template,
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
