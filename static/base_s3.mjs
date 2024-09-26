import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Uploads a file to an S3 bucket using the AWS CLI.
 * 
 * @param {Object} props - The properties for the file upload.
 * @param {string|Buffer} props.file - The file to upload. Can be a file path (string) or file content (Buffer).
 * @param {string} props.bucket - The name of the S3 bucket.
 * @param {string} props.key - The key (path) where the file will be stored in the bucket.
 * @param {string} [props.region] - The AWS region. Defaults to process.env.AWS_REGION or 'us-east-1'.
 * @returns {Promise<Object>} An object containing the ETag of the uploaded file.
 * @throws {Error} If there's an error during the upload process.
 */
export async function uploadFile(props) {
    const region = props.region || process.env.AWS_REGION || 'us-east-1';
    let filePath;

    // If props.file is a Buffer, we need to write it to a temporary file
    if (Buffer.isBuffer(props.file)) {
        filePath = path.join('/tmp', `temp-${Date.now()}.bin`);
        fs.writeFileSync(filePath, props.file);
    } else if (typeof props.file === 'string') {
        filePath = props.file;
    } else {
        throw new Error('Invalid file type. Expected string (file path) or Buffer.');
    }

    const command = `aws s3 cp "${filePath}" s3://${props.bucket}/${props.key} --region ${region}`;

    try {
        const { stdout } = await execAsync(command);
        console.log('Upload output:', stdout);

        // Get the ETag of the uploaded file
        const etagCommand = `aws s3api head-object --bucket ${props.bucket} --key ${props.key} --region ${region} --query ETag --output text`;
        const { stdout: etagStdout } = await execAsync(etagCommand);
        const etag = etagStdout.trim();

        // If we created a temporary file, delete it
        if (Buffer.isBuffer(props.file)) {
            fs.unlinkSync(filePath);
        }

        return { etag };
    } catch (error) {
        console.error('Error uploading file:', error);
        
        // If we created a temporary file, make sure to delete it even if there was an error
        if (Buffer.isBuffer(props.file) && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        throw error;
    }
}


/**
 * Removes a file from an S3 bucket using the AWS CLI.
 * 
 * @param {Object} props - The properties for the file removal.
 * @param {string} props.bucket - The name of the S3 bucket.
 * @param {string} props.key - The key (path) of the file to be removed from the bucket.
 * @param {string} [props.region] - The AWS region. Defaults to process.env.AWS_REGION or 'us-east-1'.
 * @returns {Promise<boolean>} Returns true if the file was successfully removed.
 * @throws {Error} If there's an error during the removal process.
 */
export async function removeFile(props) {
    const region = props.region || process.env.AWS_REGION || 'us-east-1';
    const command = `aws s3 rm s3://${props.bucket}/${props.key} --region ${region}`;

    try {
        const { stdout } = await execAsync(command);
        console.log('Remove output:', stdout);

        // Check if the file was successfully removed
        if (stdout.includes('delete:')) {
            return true;
        } else {
            console.warn('File may not have been removed or did not exist.');
            return false;
        }
    } catch (error) {
        console.error('Error removing file:', error);
        throw error;
    }
}


/**
 * Empties an S3 bucket or removes objects with a specific prefix using the AWS CLI.
 * 
 * @param {Object} props - The properties for emptying the bucket.
 * @param {string} props.bucketName - The name of the S3 bucket.
 * @param {string} [props.keyPrefix] - Optional prefix to filter objects to delete.
 * @param {string} [props.region] - The AWS region. Defaults to process.env.AWS_REGION or 'us-east-1'.
 * @returns {Promise<boolean>} Returns true if the bucket was completely emptied, false otherwise.
 * @throws {Error} If there's an error during the process.
 */
export async function emptyBucket(props) {
    const region = props.region || process.env.AWS_REGION || 'us-east-1';
    const prefix = props.keyPrefix ? `--prefix "${props.keyPrefix}"` : '';

    // List objects in the bucket
    const listCommand = `aws s3api list-objects-v2 --bucket ${props.bucketName} ${prefix} --query 'Contents[].Key' --output json --region ${region}`;

    try {
        const { stdout: listStdout } = await execAsync(listCommand);
        const objects = JSON.parse(listStdout);

        if (!objects || objects.length === 0) {
            console.log('No objects to delete.');
            return true;
        }

        // Prepare the delete command
        const deleteObjects = objects.map(key => `{"Key":"${key}"}`).join(',');
        const deleteCommand = `aws s3api delete-objects --bucket ${props.bucketName} --delete '{"Objects":[${deleteObjects}]}' --region ${region}`;

        const { stdout: deleteStdout } = await execAsync(deleteCommand);
        console.log('Delete output:', deleteStdout);

        // Check if all objects were deleted
        const deletedCount = JSON.parse(deleteStdout).Deleted.length;
        const willEmptyBucket = deletedCount === objects.length;

        if (willEmptyBucket) {
            console.log('Bucket emptied successfully.');
        } else {
            console.log(`Deleted ${deletedCount} out of ${objects.length} objects.`);
        }

        return willEmptyBucket;
    } catch (error) {
        console.error('Error emptying bucket:', error);
        throw error;
    }
}


/**
 * @param {string} name
 */
export function makeBucket(name) {
    const theName = name.charAt(0).toUpperCase() + name.slice(1)
    const BucketName = `${theName}Bucket`
    const PolicyName = `${theName}BucketPolicy`

    return {
        Resources: {
            [BucketName]: {
                Type: 'AWS::S3::Bucket',
                Properties: {
                    OwnershipControls: {
                        Rules: [
                            {
                                ObjectOwnership: 'BucketOwnerPreferred'
                            }
                        ]
                    },
                    BucketEncryption: {
                        ServerSideEncryptionConfiguration: [
                            {
                                ServerSideEncryptionByDefault: {
                                    SSEAlgorithm: 'AES256'
                                }
                            }
                        ]
                    }
                }
            },
            [PolicyName]: {
                Type: 'AWS::S3::BucketPolicy',
                Properties: {
                    Bucket: {
                        Ref: BucketName
                    },
                    PolicyDocument: {
                        Statement: [
                            {
                                Action: 's3:*',
                                Effect: 'Deny',
                                Principal: '*',
                                Resource: [
                                    {
                                        'Fn::Join': [
                                            '',
                                            [
                                                'arn:',
                                                {
                                                    Ref: 'AWS::Partition'
                                                },
                                                ':s3:::',
                                                {
                                                    Ref: BucketName
                                                },
                                                '/*'
                                            ]
                                        ]
                                    }
                                ],
                                Condition: {
                                    Bool: {
                                        'aws:SecureTransport': false
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        },
        Outputs: {
            [BucketName]: {
                Value: {
                    Ref: BucketName
                }
            }
        }
    }
}