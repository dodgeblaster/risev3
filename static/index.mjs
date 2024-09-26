#! /usr/bin/env node
import * as cli from './base_cli.mjs'
import * as filesystem from './base_fs.mjs'
import { deployStaticSite } from './deploy.mjs'
import { getProjectData } from './get_project_data.mjs'
//import { pull } from './pull.mjs'
import process from 'node:process'

const flags = [
    {
        flag: '--stage',
        default: 'dev'
    },
    {
        flag: '--region',
        default: 'us-east-1'
    }
]

cli.addCommand({
    command: 'deploy',
    flags,
    action: async () => {
        const flags = {
            stage: 'prod',
            region: 'us-east-1'
        }
        /**
         * Make hidden folders
         */
        const HIDDEN_FOLDER = '.rise'
        const projectFolder = filesystem.getDirectories({
            path: '/',
            projectRoot: process.cwd()
        })

        if (!projectFolder.includes(HIDDEN_FOLDER)) {
            await filesystem.makeDir({
                path: '/' + HIDDEN_FOLDER,
                projectRoot: process.cwd()
            })
        }

        /**
         * Get Project Config
         */
        let projectData = {}
        try {
            projectData = await getProjectData(cli)
        } catch (e) {
            cli.clear()
            cli.printErrorMessage('Rise Static Validation Error')
            cli.printInfoMessage('- ' + e.message)
            return
        }

        /**
         * Deploy
         */
        await deployStaticSite({
            app: {
                stage: flags.stage,
                region: flags.region,
                bucketName: projectData.bucketName,
                appId: projectData.appId,
                auth: projectData.auth
            },
            zipConfig: {
                source: projectData.distFolder,
                target: '/.rise',
                name: 'static'
            },
            deployName: projectData.name
        })
    }
})

// cli.addCommand({
//     command: 'remove',
//     flags: [
//         {
//             flag: '--stage',
//             default: 'dev'
//         },
//         {
//             flag: '--region',
//             default: 'us-east-1'
//         }
//     ],
//     action: async (flags) => {
//         console.log('in development...')
//     }
// })

// cli.addCommand({
//     command: 'pull',
//     flags: [
//         {
//             flag: '--stage',
//             default: 'dev'
//         },
//         {
//             flag: '--region',
//             default: 'us-east-1'
//         }
//     ],
//     action: async (flags) => {
//         /**
//          * Get Project Config
//          */
//         let projectData = {}
//         try {
//             projectData = await getProjectData(cli)
//         } catch (e) {
//             cli.clear()
//             cli.printErrorMessage('Rise Static Validation Error')
//             cli.printInfoMessage('- ' + e.message)
//             return
//         }
//         await pull(projectData, flags.region)
//     }
// })

cli.runProgram()