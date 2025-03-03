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

addCommand({
    command: 'deploy',
    action: async () => {
        console.time('✅ Deployed Successfully \x1b[2mDeploy Time')
        hideCursor()

        let config = await filesystem.getJsFile({
            path: '/rise.mjs',
            projectRoot: process.cwd()
        })

        config = config.default

        const template = await filesystem.getTextContent({
            path: '/template.yml',
            projectRoot: process.cwd()
        })

        startLoadingMessage('Deploying Infra')
        const result = await deployInfra({
            name: config.name,
            stage: '', // not sure i believe in stages anymore. Your entire aws account is a stage
            region: 'us-east-1,
            template: JSON.stringifgy(template,null,2),
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
