import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const wait = () => new Promise((r) => setTimeout(r, 2000));

/**
 * Checks the status of an Amplify deployment job.
 * 
 * @param {string} appId - The ID of the Amplify app.
 * @param {string} jobId - The ID of the deployment job.
 * @param {number} count - The current number of status check attempts.
 * @returns {Promise<string>} The final status of the deployment job.
 * @throws {Error} If the deployment takes longer than expected or if there's an error checking the status.
 */
async function checkDeployStatus(appId, jobId, count) {
    if (count > 100) {
        throw new Error('Deployment is taking longer than usual');
    }

    const command = `aws amplify get-job --app-id ${appId} --branch-name main --job-id ${jobId}`;
    
    try {
        const { stdout } = await execAsync(command);
        const jobStatus = JSON.parse(stdout);

        if (
            jobStatus.job.summary.status === 'PENDING' ||
            jobStatus.job.summary.status === 'RUNNING'
        ) {
            await wait();
            return await checkDeployStatus(appId, jobId, count + 1);
        }

        return jobStatus.job.summary.status;
    } catch (error) {
        console.error('Error checking deploy status:', error);
        throw error;
    }
}

/**
 * Deploys an application to AWS Amplify.
 * 
 * @param {Object} config - The configuration object for the deployment.
 * @param {Object} config.app - The app-specific configuration.
 * @param {string} config.app.appId - The ID of the Amplify app.
 * @param {string} config.app.bucketName - The name of the S3 bucket containing the deployment package.
 * @param {Object} config.zipConfig - The configuration for the zip file.
 * @param {string} config.zipConfig.name - The name of the zip file (without the .zip extension).
 * @throws {Error} If there's an error starting the deployment or checking its status.
 */
export async function deployToAmplify(config) {
    const startDeploymentCommand = `aws amplify start-deployment --app-id ${config.app.appId} --branch-name main --source-url s3://${config.app.bucketName}/${config.zipConfig.name}.zip`;

    try {
        const { stdout } = await execAsync(startDeploymentCommand);
        const res = JSON.parse(stdout);

        await checkDeployStatus(config.app.appId, res.jobSummary.jobId, 0);
    } catch (error) {
        console.error('Error starting deployment:', error);
        throw error;
    }
}