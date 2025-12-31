# Rise - Serverless Framework

A simple, configuration-driven serverless framework for AWS Lambda functions with API Gateway, EventBridge, and scheduled triggers.

## Quick Start

```bash
# Initialize a new project
node index.mjs init

# Deploy your application
node index.mjs deploy
```

## Project Structure

```
my-app/
├── rise.mjs          # Main configuration file
├── functions/        # Lambda function files
│   ├── hello.mjs
│   ├── scheduled.mjs
│   └── event-handler.mjs
└── .rise/           # Generated deployment files (auto-created)
```

## Configuration

### Main Configuration (`rise.mjs`)

The `rise.mjs` file defines your application structure and routing:

```javascript
export default {
    name: 'my-app',
    functions: {
        hello: './functions/hello.mjs',
        scheduled: './functions/scheduled.mjs',
        eventHandler: './functions/event-handler.mjs'
    },
    triggers: {
        hello: 'API GET /hello public',
        scheduled: 'SCHEDULE 5',
        eventHandler: 'EVENT my.service order.created default'
    },
    api: {
        authorizer: '{@output.auth-stack.CognitoUserPoolIssuer}'
    }
}
```

#### Properties

- **`name`** (string): Application name (used for CloudFormation stack naming)
- **`functions`** (object): Maps function names to file paths
- **`triggers`** (object): Defines how functions are triggered
- **`api`** (object, optional): API Gateway configuration

#### Trigger Types

**API Triggers**
```javascript
// Public API endpoint (no authentication)
'API GET /hello public'

// Protected API endpoint (requires JWT)
'API POST /users'

// Supported methods: GET, POST, PUT, DELETE, PATCH
```

**Scheduled Triggers**
```javascript
// Run every 5 minutes
'SCHEDULE 5'

// Run every 30 minutes
'SCHEDULE 30'
```

**EventBridge Triggers**
```javascript
// Listen for events from a service
'EVENT my.service order.created default'
// Format: EVENT <source> <detail-type> <event-bus>
```

#### API Configuration

```javascript
api: {
    // Cognito User Pool issuer for JWT authentication
    authorizer: '{@output.auth-stack.CognitoUserPoolIssuer}'
}
```

#### CloudFormation Output References

Reference outputs from other CloudFormation stacks:

```javascript
'{@output.stack-name.OutputName}'
```

Example:
```javascript
env: {
    TABLE_NAME: '{@output.my-stack.TableName}',
    BUCKET_NAME: '{@output.my-stack.BucketName}'
}
```

### Function Configuration

Each function file exports a `config` object and a `handler` function:

```javascript
export const config = {
    timeout: 10,
    env: {
        NODE_ENV: 'production',
        TABLE_NAME: '{@output.my-stack.TableName}',
        BUCKET_NAME: '{@output.my-stack.BucketName}'
    },
    permissions: [
        {
            Effect: 'Allow',
            Action: ['dynamodb:Query', 'dynamodb:PutItem'],
            Resource: '{@output.my-stack.TableArn}'
        },
        {
            Effect: 'Allow',
            Action: ['s3:GetObject', 's3:PutObject'],
            Resource: '{@output.my-stack.BucketArn}/*'
        }
    ]
}

export async function handler(event) {
    // Import AWS SDK inside handler to avoid deployment issues
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Hello World!' })
    }
}
```

#### Function Config Properties

- **`timeout`** (number, optional): Function timeout in seconds (default: 3)
- **`env`** (object, optional): Environment variables
- **`permissions`** (array, optional): IAM policy statements for the function

#### Important Notes

1. **AWS SDK Imports**: Always import AWS SDK modules inside the handler function using dynamic imports to avoid deployment-time errors:
   ```javascript
   // ✅ Correct
   export async function handler(event) {
       const { S3Client } = await import('@aws-sdk/client-s3');
   }
   
   // ❌ Incorrect - causes deployment errors
   import { S3Client } from '@aws-sdk/client-s3';
   ```

2. **Permissions**: Only functions with permissions defined will have IAM policies attached. Functions without permissions run with basic Lambda execution role.

## Examples

### API Function with Database Access

```javascript
export const config = {
    timeout: 15,
    env: {
        TABLE_NAME: '{@output.data-stack.UsersTable}'
    },
    permissions: [
        {
            Effect: 'Allow',
            Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
            Resource: '{@output.data-stack.UsersTableArn}'
        }
    ]
}

export async function handler(event) {
    const { DynamoDBClient, GetItemCommand } = await import('@aws-sdk/client-dynamodb');
    const dynamodb = new DynamoDBClient({});
    
    // Your function logic here
    return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
    }
}
```

### Scheduled Function

```javascript
export const config = {
    timeout: 30,
    env: {
        NODE_ENV: 'production'
    }
}

export async function handler(event) {
    console.log('Scheduled task executed:', new Date().toISOString());
    return { success: true };
}
```

### EventBridge Function

```javascript
export const config = {
    timeout: 15,
    env: {
        NOTIFICATION_TOPIC: '{@output.messaging-stack.NotificationTopic}'
    },
    permissions: [
        {
            Effect: 'Allow',
            Action: ['sns:Publish'],
            Resource: '{@output.messaging-stack.NotificationTopicArn}'
        }
    ]
}

export async function handler(event) {
    console.log('Event received:', event);
    // Process the event
    return { processed: true };
}
```

## Commands

- **`node index.mjs init`**: Initialize a new project with example files
- **`node index.mjs deploy`**: Deploy your application to AWS

## Deployment

The framework automatically:
1. Creates an S3 bucket for storing Lambda code
2. Zips your function files
3. Uploads code to S3
4. Generates CloudFormation template
5. Deploys infrastructure using AWS SAM

## Authentication

- API routes without `public` flag require JWT authentication
- Configure Cognito User Pool issuer in the `api.authorizer` field
- Test authenticated routes with: `Authorization: Bearer <jwt-token>` header

## Best Practices

1. Keep function files focused and lightweight
2. Use CloudFormation output references for cross-stack dependencies
3. Import AWS SDK modules inside handlers, not at the top level
4. Use meaningful function and trigger names
5. Set appropriate timeouts based on function complexity
6. Follow least-privilege principle for IAM permissions
