import * as cli from './base_cli.mjs'
import {deployStack, getDeployStatus, getOutputs} from './base_cfn.mjs'

/**
 * Logs
 */
function makeCheckmarkIcon() {
    return cli.makeGreenText('✔')
}

function makeInProgressIcon() {
    return cli.makeBlueText('•')
}

function makeErrorIcon() {
    return cli.makeRedText('•')
}

function makeStatusText(text) {
    return cli.makeDimText(text)
}

function makeName(text, cellLength) {
    return cli.setTextWidth(text, cellLength)
}

function makeSuccessMessage(name, length, status) {
    return `${makeCheckmarkIcon()} ${makeName(name, length)} ${makeStatusText(
        status
    )}`
}

function makeInProgressMessage(name, length, status) {
    return `${makeInProgressIcon()} ${makeName(name, length)} ${makeStatusText(
        status
    )}`
}

function makeErrorMessage(name, length, status) {
    return `${makeErrorIcon()} ${makeName(name, length)} ${makeStatusText(
        status
    )}`
}

function printResourceStatus(nameLength, resource) {
    const name = resource.id
    const status = resource.status

    if (resource.status.includes('COMPLETE')) {
        return makeSuccessMessage(name, nameLength, status)
    }

    if (
        resource.status.includes('FAILED') ||
        resource.status.includes('ROLLBACK')
    ) {
        return makeErrorMessage(name, nameLength, status)
    }

    return makeInProgressMessage(name, nameLength, status)
}

function getLongestResourceName(resources) {
    return resources.reduce((acc, r) => {
        return r.id.length > acc ? r.id.length : acc
    }, 0)
}

function formatCloudformationStatus(resources) {
    let text = ''
    const nameLength = getLongestResourceName(resources)
    resources.forEach((resource) => {
        const msg = printResourceStatus(nameLength, resource)
        text = text + msg + '\n'
    })
    return text
}


export const deployInfraAction =
    (io) =>
    async ({ name, region, stage, template, outputs }) => {
        try {
            /**
             * Start deployment
             */
            await io.aws.deployStack({
                name: name + stage,
                region,
                template
            })

            /**
             * Check status of deployment
             */
            io.cli.clear()
            io.cli.endLoadingMessage()
            io.cli.startLoadingMessage('Deploying CloudFormation Template')

            const res = await io.aws.getDeployStatus({
                region: region,
                config: {
                    stackName: name + stage,
                    minRetryInterval: 5000,
                    maxRetryInterval: 10000,
                    backoffRate: 1.1,
                    maxRetries: 200,
                    onCheck: (resources) => {
                        io.cli.clear()
                        const cfStatus = formatCloudformationStatus(resources)
                        io.cli.print(cfStatus)
                        io.cli.endLoadingMessage()
                        io.cli.startLoadingMessage(
                            'Deploying CloudFormation Template'
                        )
                    }
                }
            })

            io.cli.endLoadingMessage()

            if (res.status === 'fail') {
                throw new Error('CloudFormation deployment has failed')
            }

            if (res.status === 'rollback') {
                throw new Error('Deployment has been rolled back')
            }

            if (res.status === 'inprogress') {
                throw new Error('Deployment is still in progress')
            }

            /**
             * Return result
             */
            if (outputs.length === 0) {
                return {
                    status: 'ok',
                    message: 'Template deployed successfully',
                    outputs: {}
                }
            }

            const outputsResult = await io.aws.getOutputs({
                stack: name + stage,
                region: region,
                outputs: outputs
            })

            io.cli.clear()
            io.cli.printSuccessMessage('Deployment Complete')

            return {
                status: 'ok',
                message: 'Template deployed successfully',
                outputs: outputsResult
            }
        } catch (e) {
            let message =
                e instanceof Error
                    ? e.message
                    : 'Something unexpected has occurred'
            return {
                status: 'error',
                message: message
            }
        }
    }
/**
 * @param props
 * @param {string} props.name
 * @param {string} props.region
 * @param {string} props.stage
 * @param {string} props.template
 * @param {Array.of<string>} props.outputs
 */
export async function deployInfra({ name, region, stage, template, outputs }) {
    const io = {
        aws: {
            deployStack: deployStack,
            getDeployStatus: getDeployStatus,
            getOutputs: getOutputs
        },
        cli: {
            clear: cli.clear,
            print: cli.print,
            endLoadingMessage: cli.endLoadingMessage,
            startLoadingMessage: cli.startLoadingMessage,
            printSuccessMessage: cli.printSuccessMessage
        }
    }
    return await deployInfraAction(io)({
        name,
        region,
        stage,
        template,
        outputs
    })
}

