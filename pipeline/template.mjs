import bucket from './template_bucket.mjs'
import makeBuild from './template_build.mjs'
import connection from './template_connection.mjs'
import pipeline from './template_pipeline.mjs'

function makeScript(commands) {
    let script = `version: 0.2
phases:
    install:
        runtime-versions:
            nodejs: 20

    build:
        commands:`

    commands.forEach((c) => {
        script = script + `\n            - ` + c
    })

    return script
}

const commands = [
    'cd ./app',
    `npm config set '//registry.npmjs.org/:_authToken' "\${NPM_TOKEN}"`,
    `npm i`,
    `npm publish`
]

const res = makeScript(commands)
console.log(res)

export default function makeCfn(def) {
    let template = {
        Resources: {
            ...connection(def.name).Resources,
            ...bucket(def.name).Resources
        },
        Outputs: {}
    }

    let pipelineStages = []
    for (const s of def.stages) {
        let actions = []

        for (const x of s.actions) {
            const valid = ['BUILD', 'SOURCE', 'INVOKE', 'APPROVAL', 'DEPLOY']

            if (!valid.includes(x.type)) {
                throw new Error(x.type + ' is not a valid action')
            }

            if (x.type === 'BUILD') {
                const name = (def.name + x.name).replace(/[^a-zA-Z ]/g, '')
                const build = makeBuild({
                    name: name,
                    buildSpec: makeScript(x.script),
                    env: {}
                })
                template = {
                    Resources: {
                        ...template.Resources,
                        ...build.Resources
                    },
                    Outputs: {
                        ...template.Outputs,
                        ...build.Outputs
                    }
                }

                actions.push({
                    ...x,
                    env: x.env || {},
                    projectCFName: name,
                    inputArtifact: x.inputArtifact || 'sourceZip',
                    outputArtifact: x.outputArtifact || x.name + 'Zip'
                })
            } else {
                if (x.type === 'SOURCE') {
                    x.outputArtifact = x.outputArtifact || 'sourceZip'
                } else {
                    x.inputArtifact = x.inputArtifact || 'sourceZip'
                    x.outputArtifact = x.outputArtifact || x.name + 'Zip'
                }
                actions.push(x)
            }
        }

        pipelineStages.push({
            name: s.name,
            actions
        })
    }

    const pipe = pipeline({
        pipelineName: def.name,
        stages: pipelineStages
    })

    template = {
        Resources: {
            ...template.Resources,
            ...pipe.Resources
        },
        Outputs: {
            ...template.Outputs,
            ...pipe.Outputs
        }
    }

    return template
}
